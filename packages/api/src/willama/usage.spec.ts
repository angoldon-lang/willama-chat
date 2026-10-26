import { buildUsageReport, parseRange, resolveMarkupPercent } from './usage';
import { parseCortecsModels, parseOpenRouterModels, parsePriceOverrides } from './pricing';
import type { UsageRow } from './usage';

const openrouter = parseOpenRouterModels({
  data: [{ id: 'openai/gpt-4o-mini', pricing: { prompt: '0.00000015', completion: '0.0000006' } }],
});

const rows: UsageRow[] = [
  { day: '2026-10-01', model: 'openai/gpt-4o-mini', tokenType: 'prompt', tokens: 1_000_000, credits: 0 },
  { day: '2026-10-01', model: 'openai/gpt-4o-mini', tokenType: 'completion', tokens: 500_000, credits: 0 },
  { day: '2026-10-02', model: 'unlisted-model', tokenType: 'prompt', tokens: 1000, credits: 2_000_000 },
];

describe('buildUsageReport', () => {
  it('prices from the provider list and applies the default 20% markup', () => {
    const report = buildUsageReport({
      rows,
      books: [openrouter],
      markupPercent: 20,
      range: { from: '2026-10-01', to: '2026-10-02' },
    });
    const mini = report.byModel.find((m) => m.model === 'openai/gpt-4o-mini');
    // 1M*0.00000015 + 0.5M*0.0000006 = 0.15 + 0.30
    expect(mini?.baseCost).toBeCloseTo(0.45, 6);
    expect(mini?.cost).toBeCloseTo(0.54, 6);
    expect(mini?.source).toBe('openrouter');
  });

  it('falls back to recorded credits (1M credits = 1 USD) for unlisted models', () => {
    const report = buildUsageReport({
      rows,
      books: [openrouter],
      markupPercent: 20,
      range: { from: '2026-10-01', to: '2026-10-02' },
    });
    const other = report.byModel.find((m) => m.model === 'unlisted-model');
    expect(other?.baseCost).toBeCloseTo(2, 6);
    expect(other?.cost).toBeCloseTo(2.4, 6);
    expect(other?.source).toBe('librechat');
    expect(report.totals.cost).toBeCloseTo(2.94, 6);
    expect(report.byDay.map((d) => d.day)).toEqual(['2026-10-01', '2026-10-02']);
  });

  it('groups by user only when requested', () => {
    const withUser = rows.map((r) => ({ ...r, user: 'a@b.it' }));
    const base = { books: [openrouter], markupPercent: 0, range: { from: 'x', to: 'y' } };
    expect(buildUsageReport({ ...base, rows: withUser }).byUser).toBeUndefined();
    expect(buildUsageReport({ ...base, rows: withUser, includeUsers: true }).byUser).toHaveLength(1);
  });
});

describe('resolveMarkupPercent', () => {
  it('defaults to 20 and rejects invalid values', () => {
    expect(resolveMarkupPercent(undefined)).toBe(20);
    expect(resolveMarkupPercent('abc')).toBe(20);
    expect(resolveMarkupPercent('-5')).toBe(20);
    expect(resolveMarkupPercent('0')).toBe(0);
    expect(resolveMarkupPercent('35')).toBe(35);
  });
});

describe('parseRange', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  it('defaults to the last 30 days', () => {
    expect(parseRange(undefined, undefined, now)).toEqual({ from: '2026-09-27', to: '2026-10-26' });
  });
  it('rejects malformed, reversed and oversized ranges', () => {
    expect(parseRange('2026-13-01x', '2026-10-01')).toEqual({ error: 'invalid_date' });
    expect(parseRange('2026-10-05', '2026-10-01')).toEqual({ error: 'invalid_range' });
    expect(parseRange('2024-01-01', '2026-10-01')).toEqual({ error: 'invalid_range' });
  });
});

describe('price parsers', () => {
  it('parses Cortecs per-token and per-million spellings', () => {
    const book = parseCortecsModels({
      data: [
        { id: 'a', pricing: { input_token: 0.0000002, output_token: 0.0000004 } },
        { id: 'b', pricing: { input: 0.5, output: 1.5 } },
      ],
    });
    expect(book.get('a')?.prompt).toBeCloseTo(0.0000002, 12);
    expect(book.get('b')?.prompt).toBeCloseTo(0.0000005, 12);
    expect(book.get('b')?.source).toBe('cortecs');
  });

  it('reads overrides per million tokens and ignores bad JSON', () => {
    expect(parsePriceOverrides('{"m":{"prompt":2,"completion":4}}').get('m')?.prompt).toBeCloseTo(
      0.000002,
      12,
    );
    expect(parsePriceOverrides('{oops').size).toBe(0);
  });
});
