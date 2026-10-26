import { logger } from '@librechat/data-schemas';
import { buildUsageReport, parseRange, resolveMarkupPercent } from './usage';
import { getTrafficSummary } from './traffic';
import type { Response } from 'express';
import type { UsageAggregator } from './aggregate';
import type { PricingService } from './pricing';
import type { TrafficStore } from './traffic';
import type { ServerRequest } from '~/types';

const first = (value: unknown) => (Array.isArray(value) ? value[0] : value);

export function createWillamaHandlers(deps: {
  aggregateUsage: UsageAggregator;
  pricing: PricingService;
  trafficStore: TrafficStore;
  getMarkupPercent?: () => string | number | undefined;
}) {
  const markup = () => resolveMarkupPercent(deps.getMarkupPercent?.());

  const usage =
    (scope: 'me' | 'all') =>
    async (req: ServerRequest, res: Response): Promise<void> => {
      try {
        const range = parseRange(first(req.query.from), first(req.query.to));
        if ('error' in range) {
          res.status(400).json({ message: range.error });
          return;
        }
        const userId = req.user?.id;
        if (scope === 'me' && !userId) {
          res.status(401).json({ message: 'Authentication required' });
          return;
        }
        const [rows, snapshot] = await Promise.all([
          deps.aggregateUsage({
            ...range,
            user: scope === 'me' ? userId : undefined,
            includeUsers: scope === 'all',
          }),
          deps.pricing.getSnapshot(),
        ]);
        res.json(
          buildUsageReport({
            rows,
            books: snapshot.books,
            markupPercent: markup(),
            range,
            pricingErrors: snapshot.errors,
            includeUsers: scope === 'all',
          }),
        );
      } catch (error) {
        logger.error('[Willama] Failed to build usage report', error);
        res.status(500).json({ message: 'Failed to load usage' });
      }
    };

  const traffic = async (req: ServerRequest, res: Response): Promise<void> => {
    try {
      const range = parseRange(first(req.query.from), first(req.query.to));
      if ('error' in range) {
        res.status(400).json({ message: range.error });
        return;
      }
      res.json(await getTrafficSummary(deps.trafficStore, range, req.user?.tenantId));
    } catch (error) {
      logger.error('[Willama] Failed to build AI traffic summary', error);
      res.status(500).json({ message: 'Failed to load AI traffic' });
    }
  };

  return { myUsage: usage('me'), allUsage: usage('all'), traffic };
}
