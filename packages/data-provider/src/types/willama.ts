export type TWillamaBucket = {
  promptTokens: number;
  completionTokens: number;
  /** Provider cost before the markup. */
  baseCost: number;
  /** Cost with the configured markup (default +20%). */
  cost: number;
};

export type TWillamaUsage = {
  range: { from: string; to: string };
  currency: 'USD';
  markupPercent: number;
  totals: TWillamaBucket;
  byModel: Array<TWillamaBucket & { model: string; source: string }>;
  byDay: Array<TWillamaBucket & { day: string }>;
  byUser?: Array<TWillamaBucket & { user: string }>;
  pricingErrors: string[];
};

export type TWillamaTrafficCategories = Record<
  'email' | 'phone' | 'iban' | 'creditCard' | 'fiscalCode' | 'ipAddress' | 'apiKey',
  number
>;

export type TWillamaTraffic = {
  range: { from: string; to: string };
  totals: {
    messages: number;
    flaggedMessages: number;
    chars: number;
    sizes: Record<'xs' | 's' | 'm' | 'l' | 'xl', number>;
    categories: TWillamaTrafficCategories;
  };
  byDay: Array<{ day: string; messages: number; flaggedMessages: number }>;
  byModel: Array<{
    endpoint: string;
    model: string;
    messages: number;
    flaggedMessages: number;
    categories: TWillamaTrafficCategories;
  }>;
};

export type TWillamaRange = { from?: string; to?: string };
