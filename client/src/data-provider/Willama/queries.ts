import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { TWillamaRange, TWillamaTraffic, TWillamaUsage } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';

const options = { keepPreviousData: true, refetchOnWindowFocus: false, retry: false } as const;

export const useWillamaUsageQuery = (
  range: TWillamaRange,
  config?: UseQueryOptions<TWillamaUsage>,
): QueryObserverResult<TWillamaUsage> =>
  useQuery<TWillamaUsage>(
    [QueryKeys.willamaUsage, range],
    () => dataService.getWillamaUsage(range),
    { ...options, ...config },
  );

export const useWillamaAdminUsageQuery = (
  range: TWillamaRange,
  config?: UseQueryOptions<TWillamaUsage>,
): QueryObserverResult<TWillamaUsage> =>
  useQuery<TWillamaUsage>(
    [QueryKeys.willamaAdminUsage, range],
    () => dataService.getWillamaAdminUsage(range),
    { ...options, ...config },
  );

export const useWillamaAdminTrafficQuery = (
  range: TWillamaRange,
  config?: UseQueryOptions<TWillamaTraffic>,
): QueryObserverResult<TWillamaTraffic> =>
  useQuery<TWillamaTraffic>(
    [QueryKeys.willamaAdminTraffic, range],
    () => dataService.getWillamaAdminTraffic(range),
    { ...options, ...config },
  );
