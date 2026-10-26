import { Model } from 'mongoose';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import aiTrafficSchema, { IAiTrafficStat } from '~/schema/aiTraffic';

export function createAiTrafficModel(mongoose: typeof import('mongoose')): Model<IAiTrafficStat> {
  applyTenantIsolation(aiTrafficSchema);
  return (
    mongoose.models.AiTrafficStat ||
    mongoose.model<IAiTrafficStat>('AiTrafficStat', aiTrafficSchema)
  );
}
