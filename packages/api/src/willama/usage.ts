import { lookupPrice } from './pricing';
import type { PriceBook } from './pricing';

export const DEFAULT_MARKUP_PERCENT = 20;
export const MAX_RANGE_DAYS = 366;
const CREDITS_PER_USD = 1_000_000;

/** One aggregated Transaction group: spend of one token type, per day, model (and user). */
export type UsageRow = {
  day: string;
  model: string;
  tokenType: 'prompt' | 'completion';
  tokens: number;
  /** Sum of |tokenValue| — LibreChat's own cost estimate in credits (1,000,000 = 1 USD). */
  credits: number;
  user?: string;
};

export type CostSource = 'openrouter' | 'cortecs' | 'override' | 'librechat';

type Bucket = {
  promptTokens: number;
  completionTokens: number;
  baseCost: number;
  cost: number;
};

export type UsageReport = {
  range: { from: string; to: string };
  currency: 'USD';
  markupPercent: number;
  totals: Bucket;
  byModel: Array<Bucket & { model: string; source: CostSource }>;
  byDay: Array<Bucket & { day: string }>;
  byUser?: Array<Bucket & { user: string }>;
  pricingErrors: string[];
};

const blank = (): Bucket => ({ promptTokens: 0, completionTokens: 0, baseCost: 0, cost: 0 });

/** Resolves the markup from a raw setting; invalid or negative values fall back to the default. */
export function resolveMarkupPercent(raw?: string | number): number {
  const value = typeof raw === 'string' ? parseFloat(raw) : raw;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : DEFAULT_MARKUP_PERCENT;
}

const round = (value: number, digits = 6) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const add = (bucket: Bucket, row: UsageRow, baseCost: number, markup: number) => {
  if (row.tokenType === 'prompt') {
    bucket.promptTokens += row.tokens;
  } else {
    bucket.completionTokens += row.tokens;
  }
  bucket.baseCost += baseCost;
  bucket.cost += baseCost * markup;
};

const finalize = <T extends Bucket>(bucket: T): T => ({
  ...bucket,
  baseCost: round(bucket.baseCost),
  cost: round(bucket.cost),
});

/**
 * Prices each group from the provider price lists (OpenRouter / Cortecs), falling back to
 * LibreChat's recorded credits for models no provider lists, then applies the markup.
 */
export function buildUsageReport(params: {
  rows: UsageRow[];
  books: PriceBook[];
  markupPercent: number;
  range: { from: string; to: string };
  pricingErrors?: string[];
  includeUsers?: boolean;
}): UsageReport {
  const { rows, books, markupPercent, range, includeUsers } = params;
  const markup = 1 + markupPercent / 100;
  const totals = blank();
  const byModel = new Map<string, Bucket & { source: CostSource }>();
  const byDay = new Map<string, Bucket>();
  const byUser = new Map<string, Bucket>();

  for (const row of rows) {
    const price = lookupPrice(books, row.model);
    const baseCost = price
      ? row.tokens * (row.tokenType === 'prompt' ? price.prompt : price.completion)
      : row.credits / CREDITS_PER_USD;
    const source: CostSource = price?.source ?? 'librechat';

    add(totals, row, baseCost, markup);
    const model = byModel.get(row.model) ?? { ...blank(), source };
    add(model, row, baseCost, markup);
    byModel.set(row.model, model);
    const day = byDay.get(row.day) ?? blank();
    add(day, row, baseCost, markup);
    byDay.set(row.day, day);
    if (includeUsers && row.user) {
      const user = byUser.get(row.user) ?? blank();
      add(user, row, baseCost, markup);
      byUser.set(row.user, user);
    }
  }

  return {
    range,
    currency: 'USD',
    markupPercent,
    totals: finalize(totals),
    byModel: [...byModel.entries()]
      .map(([model, bucket]) => ({ model, ...finalize(bucket) }))
      .sort((a, b) => b.cost - a.cost),
    byDay: [...byDay.entries()]
      .map(([day, bucket]) => ({ day, ...finalize(bucket) }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    ...(includeUsers
      ? {
          byUser: [...byUser.entries()]
            .map(([user, bucket]) => ({ user, ...finalize(bucket) }))
            .sort((a, b) => b.cost - a.cost),
        }
      : {}),
    pricingErrors: params.pricingErrors ?? [],
  };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Parses `from`/`to` (YYYY-MM-DD, inclusive); defaults to the last 30 days. */
export function parseRange(
  from?: unknown,
  to?: unknown,
  now: Date = new Date(),
): { from: string; to: string } | { error: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const end = typeof to === 'string' && to ? to : iso(now);
  const start =
    typeof from === 'string' && from ? from : iso(new Date(Date.parse(end) - 29 * 86_400_000));
  if (!DAY.test(start) || !DAY.test(end) || Number.isNaN(Date.parse(start) + Date.parse(end))) {
    return { error: 'invalid_date' };
  }
  const days = (Date.parse(end) - Date.parse(start)) / 86_400_000;
  if (days < 0 || days > MAX_RANGE_DAYS) {
    return { error: 'invalid_range' };
  }
  return { from: start, to: end };
}
