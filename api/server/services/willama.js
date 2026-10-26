const mongoose = require('mongoose');
const {
  isEnabled,
  createPricingService,
  createUsageAggregator,
  createTrafficRecorder,
  createTrafficMiddleware,
  createWillamaHandlers,
} = require('@librechat/api');
const { Transaction, User, AiTrafficStat } = require('~/db/models');

const pricing = createPricingService({
  cortecsApiKey: process.env.CORTECS_API_KEY,
  overridesJson: process.env.WILLAMA_PRICE_OVERRIDES,
});

const aggregateUsage = createUsageAggregator({
  Transaction,
  User,
  toObjectId: (id) => new mongoose.Types.ObjectId(id),
});

/** On by default; set WILLAMA_TRAFFIC_MONITOR=false to stop recording the anonymous counters. */
const isTrafficMonitorEnabled = () => isEnabled(process.env.WILLAMA_TRAFFIC_MONITOR ?? 'true');

const trafficMiddleware = createTrafficMiddleware({
  record: createTrafficRecorder(AiTrafficStat),
  isEnabled: isTrafficMonitorEnabled,
});

const handlers = createWillamaHandlers({
  aggregateUsage,
  pricing,
  trafficStore: AiTrafficStat,
  getMarkupPercent: () => process.env.WILLAMA_COST_MARKUP_PERCENT,
});

module.exports = { handlers, trafficMiddleware };
