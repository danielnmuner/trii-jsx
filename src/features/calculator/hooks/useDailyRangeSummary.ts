import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { SnapshotRecord } from '../../analytics/api/schemas'
import { ANALYTICS_DAILY_CLOSING_CACHE_MS } from '../../analytics/config'
import { fetchDailyClosingWindow } from '../../analytics/hooks/useAnalytics'
import { getBogotaDateKey } from '../../analytics/lib/colombiaBusinessCalendar'
import { computeDailyRangeStats, computeTodayRange } from '../../analytics/lib/dailyRangeTape'

export type DailyRangeSummary = {
  /** High − low of the latest session for this stock (COP), when known. */
  dayRange: number | null
  /** Trading day of that range, and whether it is today in Bogota. */
  dayKey: string | null
  isToday: boolean
  /** Typical daily range: the median of the historic ranges, same figure as Overview's range tape. */
  typicalRange: number | null
}

/**
 * Today's range and the typical daily range for one stock. Shares the daily-closing cache with
 * Overview and Historic (same query key, 24 h), so it only requests data that is not cached yet.
 */
export function useDailyRangeSummary(symbol: string, snapshot: SnapshotRecord | null): DailyRangeSummary {
  const historyQuery = useQuery({
    queryKey: ['analytics', 'daily-closing', symbol],
    queryFn: () => fetchDailyClosingWindow(symbol),
    enabled: Boolean(symbol),
    staleTime: ANALYTICS_DAILY_CLOSING_CACHE_MS,
    gcTime: ANALYTICS_DAILY_CLOSING_CACHE_MS,
  })

  return useMemo(() => {
    const dayKey = snapshot ? getBogotaDateKey(snapshot.captured_at) : null
    const today = snapshot ? computeTodayRange(snapshot) : null
    const stats = historyQuery.data ? computeDailyRangeStats(historyQuery.data.records, dayKey) : null
    return {
      dayRange: today?.range ?? null,
      dayKey,
      isToday: dayKey !== null && dayKey === getBogotaDateKey(new Date()),
      typicalRange: stats?.status === 'ready' ? stats.stats.median : null,
    }
  }, [historyQuery.data, snapshot])
}
