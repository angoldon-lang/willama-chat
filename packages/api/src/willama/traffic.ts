import { logger } from '@librechat/data-schemas';
import { emptyCounts, scanText, sizeBucket, totalFlags } from './scanner';
import type { NextFunction, Response } from 'express';
import type { ScanCounts, SizeBucket } from './scanner';
import type { ServerRequest } from '~/types';

const SIZES: SizeBucket[] = ['xs', 's', 'm', 'l', 'xl'];
const MAX_LABEL = 100;

/** Minimal slice of the AiTrafficStat model, so this module never depends on Mongoose types. */
export type TrafficStore = {
  updateOne: (
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options: { upsert: boolean },
  ) => PromiseLike<unknown>;
  find: (filter: Record<string, unknown>) => {
    lean: () => PromiseLike<TrafficDoc[]>;
  };
};

export type TrafficDoc = {
  day: string;
  endpoint: string;
  model: string;
  messages: number;
  flaggedMessages: number;
  chars: number;
  sizes?: Partial<Record<SizeBucket, number>>;
  categories?: Partial<ScanCounts>;
};

/** Labels come from the client body: bound their charset and length so they cannot blow up cardinality. */
export function sanitizeLabel(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return 'unknown';
  }
  return value
    .trim()
    .slice(0, MAX_LABEL)
    .replace(/[^\w./:@+-]/g, '_');
}

export type TrafficInput = {
  endpoint: unknown;
  model: unknown;
  text: unknown;
  tenantId?: string;
};

/**
 * Records an anonymous per-day aggregate of what is sent to AI endpoints. Only counters are
 * written: no user, conversation, message id or text ever reaches the store.
 */
export function createTrafficRecorder(store: TrafficStore, now: () => Date = () => new Date()) {
  return async function record(input: TrafficInput): Promise<void> {
    const text = typeof input.text === 'string' ? input.text : '';
    const counts = scanText(text);
    const flags = totalFlags(counts);
    const inc: Record<string, number> = {
      messages: 1,
      chars: text.length,
      [`sizes.${sizeBucket(text.length)}`]: 1,
    };
    if (flags > 0) {
      inc.flaggedMessages = 1;
    }
    for (const [category, value] of Object.entries(counts)) {
      if (value > 0) {
        inc[`categories.${category}`] = value;
      }
    }
    await store.updateOne(
      {
        day: now().toISOString().slice(0, 10),
        endpoint: sanitizeLabel(input.endpoint),
        model: sanitizeLabel(input.model),
        ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      },
      { $inc: inc },
      { upsert: true },
    );
  };
}

/** Never blocks or fails a chat request: recording is fire-and-forget. */
export function createTrafficMiddleware(deps: {
  record: (input: TrafficInput) => Promise<void>;
  isEnabled: () => boolean;
}) {
  return (req: ServerRequest, _res: Response, next: NextFunction): void => {
    if (deps.isEnabled() && req.method === 'POST' && req.path !== '/resume') {
      const body = (req.body ?? {}) as Record<string, unknown>;
      deps
        .record({
          endpoint: body.endpoint,
          model: body.model,
          text: body.text,
          tenantId: req.user?.tenantId,
        })
        .catch((error: Error) => logger.warn('[AiTraffic] record failed', error.message));
    }
    next();
  };
}

export type TrafficSummary = {
  range: { from: string; to: string };
  totals: {
    messages: number;
    flaggedMessages: number;
    chars: number;
    sizes: Record<SizeBucket, number>;
    categories: ScanCounts;
  };
  byDay: Array<{ day: string; messages: number; flaggedMessages: number }>;
  byModel: Array<{
    endpoint: string;
    model: string;
    messages: number;
    flaggedMessages: number;
    categories: ScanCounts;
  }>;
};

export async function getTrafficSummary(
  store: TrafficStore,
  range: { from: string; to: string },
  tenantId?: string,
): Promise<TrafficSummary> {
  const docs = await store
    .find({ day: { $gte: range.from, $lte: range.to }, ...(tenantId ? { tenantId } : {}) })
    .lean();
  const sizes = Object.fromEntries(SIZES.map((s) => [s, 0])) as Record<SizeBucket, number>;
  const categories = emptyCounts();
  const totals = { messages: 0, flaggedMessages: 0, chars: 0, sizes, categories };
  const byDay = new Map<string, { messages: number; flaggedMessages: number }>();
  const byModel = new Map<string, TrafficSummary['byModel'][number]>();

  for (const doc of docs) {
    totals.messages += doc.messages;
    totals.flaggedMessages += doc.flaggedMessages;
    totals.chars += doc.chars;
    for (const size of SIZES) {
      sizes[size] += doc.sizes?.[size] ?? 0;
    }
    const day = byDay.get(doc.day) ?? { messages: 0, flaggedMessages: 0 };
    day.messages += doc.messages;
    day.flaggedMessages += doc.flaggedMessages;
    byDay.set(doc.day, day);

    const key = `${doc.endpoint}\u0000${doc.model}`;
    const entry = byModel.get(key) ?? {
      endpoint: doc.endpoint,
      model: doc.model,
      messages: 0,
      flaggedMessages: 0,
      categories: emptyCounts(),
    };
    entry.messages += doc.messages;
    entry.flaggedMessages += doc.flaggedMessages;
    for (const category of Object.keys(categories) as Array<keyof ScanCounts>) {
      const value = doc.categories?.[category] ?? 0;
      categories[category] += value;
      entry.categories[category] += value;
    }
    byModel.set(key, entry);
  }

  return {
    range,
    totals,
    byDay: [...byDay.entries()]
      .map(([day, value]) => ({ day, ...value }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    byModel: [...byModel.values()].sort((a, b) => b.messages - a.messages),
  };
}
