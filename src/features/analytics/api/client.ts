import { getJson } from '../../../shared/api/http'
import { ANALYTICS_DAILY_CLOSING_LIMIT, ANALYTICS_SNAPSHOT_LIMIT, ANALYTICS_ZSCORE_LIMIT } from '../config'
import {
  analyticsCatalogResponseSchema,
  analyticsHistoricStatsResponseSchema,
  analyticsSnapshotResponseSchema,
  dailyClosingResponseSchema,
  zscoreOpportunityResponseSchema,
} from './schemas'

export async function fetchAnalyticsCatalog() {
  const payload = await getJson('/analytics/catalog')
  return analyticsCatalogResponseSchema.parse(payload)
}

export async function fetchAnalyticsSnapshot(symbol: string, limit = ANALYTICS_SNAPSHOT_LIMIT) {
  const query = new URLSearchParams({
    symbol,
    limit: String(limit),
  })
  const payload = await getJson(`/analytics/snapshot?${query.toString()}`)
  return analyticsSnapshotResponseSchema.parse(payload)
}

export async function fetchAnalyticsHistoricStats(symbol: string) {
  const payload = await getJson(`/analytics/historic-stats?symbol=${encodeURIComponent(symbol)}`)
  return analyticsHistoricStatsResponseSchema.parse(payload)
}

export async function fetchZscoreOpportunities(
  symbol: string,
  tradingDate: string,
  limit = ANALYTICS_ZSCORE_LIMIT,
) {
  const query = new URLSearchParams({
    symbol,
    trading_date: tradingDate,
    limit: String(limit),
  })
  const payload = await getJson(`/analytics/zscore-opportunities?${query.toString()}`)
  return zscoreOpportunityResponseSchema.parse(payload)
}

export async function fetchDailyClosingSnapshots(symbol: string, limit = ANALYTICS_DAILY_CLOSING_LIMIT) {
  const query = new URLSearchParams({
    symbol,
    limit: String(limit),
  })
  const payload = await getJson(`/analytics/daily-closing?${query.toString()}`)
  return dailyClosingResponseSchema.parse(payload)
}
