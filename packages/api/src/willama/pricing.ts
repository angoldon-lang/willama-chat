export type PriceSource = 'openrouter' | 'cortecs' | 'override';

/** USD per single token. */
export type ModelPrice = { prompt: number; completion: number; source: PriceSource };

export type PriceBook = Map<string, ModelPrice>;

type Json = Record<string, unknown>;

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const CORTECS_MODELS_URL = 'https://api.cortecs.ai/v1/models';
const DEFAULT_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

const asArray = (json: unknown): Json[] => {
  if (Array.isArray(json)) {
    return json as Json[];
  }
  const obj = json as Json | null;
  const list = obj?.data ?? obj?.models;
  return Array.isArray(list) ? (list as Json[]) : [];
};

const toNumber = (value: unknown): number | undefined => {
  const n = typeof value === 'string' ? parseFloat(value) : (value as number);
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** OpenRouter publishes `pricing.prompt` / `pricing.completion` as USD per token. */
export function parseOpenRouterModels(json: unknown): PriceBook {
  const book: PriceBook = new Map();
  for (const item of asArray(json)) {
    const pricing = item.pricing as Json | undefined;
    const prompt = toNumber(pricing?.prompt);
    const completion = toNumber(pricing?.completion);
    if (typeof item.id === 'string' && prompt !== undefined && completion !== undefined) {
      book.set(item.id, { prompt, completion, source: 'openrouter' });
    }
  }
  return book;
}

/**
 * Best-effort parser for the Cortecs model list (OpenAI-compatible `/models`).
 * Accepts several field spellings; values above 0.01 are read as "per million
 * tokens" (no real LLM costs 10k+/token), smaller ones as "per token".
 */
export function parseCortecsModels(json: unknown): PriceBook {
  const book: PriceBook = new Map();
  for (const item of asArray(json)) {
    const id = item.id ?? item.model ?? item.name;
    const pricing = (item.pricing ?? item.price) as Json | undefined;
    const input = toNumber(pricing?.input_token ?? pricing?.input ?? pricing?.prompt);
    const output = toNumber(pricing?.output_token ?? pricing?.output ?? pricing?.completion);
    if (typeof id !== 'string' || input === undefined || output === undefined) {
      continue;
    }
    const perToken = (value: number) => (value > 0.01 ? value / 1_000_000 : value);
    book.set(id, { prompt: perToken(input), completion: perToken(output), source: 'cortecs' });
  }
  return book;
}

/** Manual prices, USD per 1M tokens: `{"model-id":{"prompt":0.5,"completion":1.5}}`. */
export function parsePriceOverrides(raw?: string): PriceBook {
  const book: PriceBook = new Map();
  if (!raw) {
    return book;
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, { prompt?: number; completion?: number }>;
    for (const [model, price] of Object.entries(parsed)) {
      const prompt = toNumber(price?.prompt);
      const completion = toNumber(price?.completion);
      if (prompt !== undefined && completion !== undefined) {
        book.set(model, {
          prompt: prompt / 1_000_000,
          completion: completion / 1_000_000,
          source: 'override',
        });
      }
    }
  } catch {
    /* invalid override JSON is ignored; the fallback rate applies */
  }
  return book;
}

/** Overrides win, then OpenRouter, then Cortecs; tolerates `:free`-style suffixes and vendor prefixes. */
export function lookupPrice(books: PriceBook[], model: string): ModelPrice | undefined {
  const candidates = [model, model.toLowerCase(), model.split(':')[0]];
  const tail = model.split('/').pop();
  if (tail) {
    candidates.push(tail, tail.toLowerCase());
  }
  for (const book of books) {
    for (const key of candidates) {
      const hit = book.get(key);
      if (hit) {
        return hit;
      }
    }
  }
  return undefined;
}

export type PricingDeps = {
  fetchJson?: (url: string, headers?: Record<string, string>) => Promise<unknown>;
  now?: () => number;
  ttlMs?: number;
  cortecsApiKey?: string;
  overridesJson?: string;
};

export type PricingSnapshot = { books: PriceBook[]; errors: string[]; fetchedAt: number };

const defaultFetchJson = async (url: string, headers?: Record<string, string>) => {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
};

/** Cached provider price lists. A provider outage degrades to the other sources, never throws. */
export function createPricingService(deps: PricingDeps = {}) {
  const fetchJson = deps.fetchJson ?? defaultFetchJson;
  const now = deps.now ?? Date.now;
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
  const overrides = parsePriceOverrides(deps.overridesJson);
  let cache: PricingSnapshot | undefined;
  let inflight: Promise<PricingSnapshot> | undefined;

  const load = async (): Promise<PricingSnapshot> => {
    const errors: string[] = [];
    const [openrouter, cortecs] = await Promise.all([
      fetchJson(OPENROUTER_MODELS_URL)
        .then(parseOpenRouterModels)
        .catch((err: Error) => {
          errors.push(`openrouter: ${err.message}`);
          return new Map() as PriceBook;
        }),
      fetchJson(
        CORTECS_MODELS_URL,
        deps.cortecsApiKey ? { Authorization: `Bearer ${deps.cortecsApiKey}` } : undefined,
      )
        .then(parseCortecsModels)
        .catch((err: Error) => {
          errors.push(`cortecs: ${err.message}`);
          return new Map() as PriceBook;
        }),
    ]);
    return { books: [overrides, openrouter, cortecs], errors, fetchedAt: now() };
  };

  const getSnapshot = async (): Promise<PricingSnapshot> => {
    if (cache && now() - cache.fetchedAt < ttlMs) {
      return cache;
    }
    inflight ??= load()
      .then((snapshot) => {
        /** Failed refreshes keep serving the previous prices when there are any. */
        const empty = snapshot.books.every((book, i) => i === 0 || book.size === 0);
        cache = empty && cache ? { ...cache, errors: snapshot.errors } : snapshot;
        return cache;
      })
      .finally(() => {
        inflight = undefined;
      });
    return inflight;
  };

  return { getSnapshot };
}

export type PricingService = ReturnType<typeof createPricingService>;
