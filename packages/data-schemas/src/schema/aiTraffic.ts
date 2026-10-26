import { Schema, Document } from 'mongoose';

/** Categories of sensitive data detected in outgoing prompts (counts only, never content). */
export const AI_TRAFFIC_CATEGORIES = [
  'email',
  'phone',
  'iban',
  'creditCard',
  'fiscalCode',
  'ipAddress',
  'apiKey',
] as const;

export type AiTrafficCategory = (typeof AI_TRAFFIC_CATEGORIES)[number];

export const AI_TRAFFIC_SIZE_BUCKETS = ['xs', 's', 'm', 'l', 'xl'] as const;

export type AiTrafficSizeBucket = (typeof AI_TRAFFIC_SIZE_BUCKETS)[number];

/**
 * Anonymous daily aggregate of what is sent to AI endpoints.
 * Deliberately has no user, conversation or message reference and no text.
 */
export interface IAiTrafficStat extends Document {
  day: string;
  endpoint: string;
  model: string;
  messages: number;
  flaggedMessages: number;
  chars: number;
  sizes: Record<AiTrafficSizeBucket, number>;
  categories: Record<AiTrafficCategory, number>;
  tenantId?: string;
}

const counters = (keys: readonly string[]) =>
  Object.fromEntries(keys.map((key) => [key, { type: Number, default: 0 }]));

const aiTrafficSchema = new Schema<IAiTrafficStat>(
  {
    day: { type: String, required: true },
    endpoint: { type: String, required: true },
    model: { type: String, required: true },
    messages: { type: Number, default: 0 },
    flaggedMessages: { type: Number, default: 0 },
    chars: { type: Number, default: 0 },
    sizes: counters(AI_TRAFFIC_SIZE_BUCKETS),
    categories: counters(AI_TRAFFIC_CATEGORIES),
    tenantId: { type: String, index: true },
  },
  { timestamps: false },
);

aiTrafficSchema.index({ day: 1, endpoint: 1, model: 1, tenantId: 1 }, { unique: true });

export default aiTrafficSchema;
