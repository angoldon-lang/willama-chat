import type { UsageRow } from './usage';

/** Minimal slices of the Transaction and User models (no Mongoose types in this module's API). */
export type TransactionStore = {
  aggregate: (pipeline: Record<string, unknown>[]) => PromiseLike<
    Array<{
      _id: { day: string; model: string; tokenType: 'prompt' | 'completion'; user?: unknown };
      tokens: number;
      credits: number;
    }>
  >;
};

export type UserStore = {
  find: (
    filter: Record<string, unknown>,
    projection: string,
  ) => { lean: () => PromiseLike<Array<{ _id: unknown; name?: string; email?: string }>> };
};

export function createUsageAggregator(deps: {
  Transaction: TransactionStore;
  User: UserStore;
  toObjectId: (id: string) => unknown;
}) {
  /** `to` is inclusive. When `user` is set the rows are limited to that user. */
  return async function aggregateUsage(params: {
    from: string;
    to: string;
    user?: string;
    includeUsers?: boolean;
  }): Promise<UsageRow[]> {
    const start = new Date(`${params.from}T00:00:00.000Z`);
    const end = new Date(Date.parse(`${params.to}T00:00:00.000Z`) + 86_400_000);
    const groupUser = params.includeUsers === true;
    const result = await deps.Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lt: end },
          tokenType: { $in: ['prompt', 'completion'] },
          model: { $type: 'string' },
          ...(params.user ? { user: deps.toObjectId(params.user) } : {}),
        },
      },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
            model: '$model',
            tokenType: '$tokenType',
            ...(groupUser ? { user: '$user' } : {}),
          },
          tokens: { $sum: { $abs: { $ifNull: ['$rawAmount', 0] } } },
          credits: { $sum: { $abs: { $ifNull: ['$tokenValue', 0] } } },
        },
      },
    ]);

    let labels = new Map<string, string>();
    if (groupUser) {
      const ids = [...new Set(result.map((r) => String(r._id.user)))];
      const users = await deps.User.find({ _id: { $in: ids } }, 'name email').lean();
      labels = new Map(users.map((u) => [String(u._id), u.email ?? u.name ?? String(u._id)]));
    }

    return result.map((r) => ({
      day: r._id.day,
      model: r._id.model,
      tokenType: r._id.tokenType,
      tokens: r.tokens,
      credits: r.credits,
      ...(groupUser ? { user: labels.get(String(r._id.user)) ?? String(r._id.user) } : {}),
    }));
  };
}

export type UsageAggregator = ReturnType<typeof createUsageAggregator>;
