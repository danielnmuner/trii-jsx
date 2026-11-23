import { useQueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import type { DailyClosingRecord } from '../api/schemas'

type CachedDailyClosingWindow = {
  symbol: string
  recordCount: number
  records: DailyClosingRecord[]
}

export type DailyClosingLiquiditySummary = {
  tradedVolumeP50: number | null
  tradedVolumeMax: number | null
  tradedValueP50: number | null
  tradedValueMax: number | null
}

export function getCachedDailyClosingLiquiditySummary(queryClient: QueryClient, symbol: string) {
  const cachedWindow = queryClient.getQueryData<CachedDailyClosingWindow>(['analytics', 'daily-closing', symbol])
  return summarizeDailyClosingLiquidity(cachedWindow?.records ?? [])
}

export function useCachedDailyClosingLiquiditySummary(symbol: string) {
  const cachedWindow = useCachedDailyClosingWindow(symbol)
  return summarizeDailyClosingLiquidity(cachedWindow?.records ?? [])
}

/** Reads the daily-closing window Overview already prefetched; never triggers a request. */
export function useCachedDailyClosingWindow(symbol: string) {
  const queryClient = useQueryClient()
  return useSyncExternalStore(
    (onStoreChange) =>
      queryClient.getQueryCache().subscribe((event) => {
        const queryKey = event?.query.queryKey
        if (
          Array.isArray(queryKey) &&
          queryKey[0] === 'analytics' &&
          queryKey[1] === 'daily-closing' &&
          queryKey[2] === symbol
        ) {
          onStoreChange()
        }
      }),
    () => queryClient.getQueryData<CachedDailyClosingWindow>(['analytics', 'daily-closing', symbol]) ?? null,
    () => queryClient.getQueryData<CachedDailyClosingWindow>(['analytics', 'daily-closing', symbol]) ?? null,
  )
}

export function summarizeDailyClosingLiquidity(records: DailyClosingRecord[]): DailyClosingLiquiditySummary {
  const tradedVolumes = extractMetricSeries(records, 'traded_volume')
  const tradedValues = extractMetricSeries(records, 'traded_value')

  return {
    tradedVolumeP50: computePercentile(tradedVolumes, 0.5),
    tradedVolumeMax: computeMax(tradedVolumes),
    tradedValueP50: computePercentile(tradedValues, 0.5),
    tradedValueMax: computeMax(tradedValues),
  }
}

function extractMetricSeries(records: DailyClosingRecord[], metricKey: 'traded_volume' | 'traded_value') {
  return records
    .map((record) => record[metricKey])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .sort((left, right) => left - right)
}

function computePercentile(values: number[], percentile: number) {
  if (values.length === 0) {
    return null
  }

  if (values.length === 1) {
    return values[0]
  }

  const safePercentile = Math.min(1, Math.max(0, percentile))
  const index = (values.length - 1) * safePercentile
  const lowerIndex = Math.floor(index)
  const upperIndex = Math.ceil(index)

  if (lowerIndex === upperIndex) {
    return values[lowerIndex] ?? null
  }

  const lowerValue = values[lowerIndex]
  const upperValue = values[upperIndex]
  if (lowerValue === undefined || upperValue === undefined) {
    return null
  }

  return lowerValue + (upperValue - lowerValue) * (index - lowerIndex)
}

function computeMax(values: number[]) {
  if (values.length === 0) {
    return null
  }

  return values[values.length - 1] ?? null
}
