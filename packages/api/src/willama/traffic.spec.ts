import { createTrafficRecorder, getTrafficSummary, sanitizeLabel } from './traffic';
import { createPricingService } from './pricing';
import type { TrafficDoc, TrafficStore } from './traffic';

const makeStore = () => {
  const calls: Array<{ filter: Record<string, unknown>; update: Record<string, unknown> }> = [];
  let docs: TrafficDoc[] = [];
  const store: TrafficStore = {
    updateOne: async (filter, update) => {
      calls.push({ filter, update });
    },
    find: () => ({ lean: async () => docs }),
  };
  return { store, calls, setDocs: (d: TrafficDoc[]) => (docs = d) };
};

describe('createTrafficRecorder', () => {
  it('stores only counters: no text, user or conversation fields', async () => {
    const { store, calls } = makeStore();
    const record = createTrafficRecorder(store, () => new Date('2026-10-26T10:00:00Z'));
    await record({
      endpoint: 'OpenRouter',
      model: 'openai/gpt-4o-mini',
      text: 'scrivi a mario@example.com',
    });
    const { filter, update } = calls[0];
    expect(filter).toEqual({ day: '2026-10-26', endpoint: 'OpenRouter', model: 'openai/gpt-4o-mini' });
    expect(update.$inc).toMatchObject({
      messages: 1,
      flaggedMessages: 1,
      'categories.email': 1,
      'sizes.xs': 1,
    });
    expect(JSON.stringify(calls)).not.toContain('mario@example.com');
  });

  it('does not flag clean text', async () => {
    const { store, calls } = makeStore();
    await createTrafficRecorder(store)({ endpoint: 'e', model: 'm', text: 'ciao' });
    expect((calls[0].update.$inc as Record<string, number>).flaggedMessages).toBeUndefined();
  });
});

describe('sanitizeLabel', () => {
  it('bounds length and charset', () => {
    expect(sanitizeLabel(undefined)).toBe('unknown');
    expect(sanitizeLabel('a b<script>')).toBe('a_b_script_');
    expect(sanitizeLabel('x'.repeat(500))).toHaveLength(100);
  });
});

describe('getTrafficSummary', () => {
  it('aggregates documents by day and model', async () => {
    const { store, setDocs } = makeStore();
    setDocs([
      { day: '2026-10-01', endpoint: 'A', model: 'm', messages: 2, flaggedMessages: 1, chars: 100, categories: { email: 1 }, sizes: { xs: 2 } },
      { day: '2026-10-02', endpoint: 'A', model: 'm', messages: 3, flaggedMessages: 0, chars: 50, categories: {}, sizes: { s: 3 } },
    ]);
    const summary = await getTrafficSummary(store, { from: '2026-10-01', to: '2026-10-02' });
    expect(summary.totals.messages).toBe(5);
    expect(summary.totals.categories.email).toBe(1);
    expect(summary.totals.sizes).toMatchObject({ xs: 2, s: 3 });
    expect(summary.byModel).toHaveLength(1);
    expect(summary.byDay).toHaveLength(2);
  });
});

describe('createPricingService', () => {
  it('degrades to remaining sources when a provider fails and caches results', async () => {
    let calls = 0;
    const service = createPricingService({
      fetchJson: async (url) => {
        calls++;
        if (url.includes('cortecs')) {
          throw new Error('HTTP 401');
        }
        return { data: [{ id: 'm', pricing: { prompt: '0.000001', completion: '0.000002' } }] };
      },
    });
    const first = await service.getSnapshot();
    expect(first.errors).toEqual(['cortecs: HTTP 401']);
    expect(first.books[1].get('m')?.source).toBe('openrouter');
    await service.getSnapshot();
    expect(calls).toBe(2);
  });
});
