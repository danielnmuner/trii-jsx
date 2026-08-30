import { getJson } from '../../../shared/api/http'
import { ANALYTICS_DAILY_CLOSING_LIMIT, ANALYTICS_SNAPSHOT_LIMIT, ANALYTICS_ZSCORE_LIMIT } from '../config'
import {
  analyticsCatalogResponseSchema,
  analyticsHistoricStatsResponseSchema,
  analyticsSnapshotResponseSchema,
  dailyClosingResponseSchema,
  sessionVectorHeadResponseSchema,
  sessionVectorResponseSchema,
  sessionVectorSegmentsResponseSchema,
  zscoreOpportunityResponseSchema,
} from './schemas'

type FetchZscoreOpportunitiesParams = {
  symbol: string
  tradingDate?: string
  fromTradingDate?: string
  toTradingDate?: string
  sinceCapturedAt?: string
  limit?: number
}

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

export async function fetchZscoreOpportunities({
  symbol,
  tradingDate,
  fromTradingDate,
  toTradingDate,
  sinceCapturedAt,
  limit = ANALYTICS_ZSCORE_LIMIT,
}: FetchZscoreOpportunitiesParams) {
  const query = new URLSearchParams({
    symbol,
    limit: String(limit),
  })

  if (tradingDate) {
    query.set('trading_date', tradingDate)
  }
  if (fromTradingDate) {
    query.set('from_trading_date', fromTradingDate)
  }
  if (toTradingDate) {
    query.set('to_trading_date', toTradingDate)
  }
  if (sinceCapturedAt) {
    query.set('since_captured_at', sinceCapturedAt)
  }

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

export async function fetchSessionVector(symbol: string, tradingDate: string) {
  const query = new URLSearchParams({
    symbol,
    trading_date: tradingDate,
  })
  const payload = await getJson(`/analytics/session-vector?${query.toString()}`)
  return sessionVectorResponseSchema.parse(payload)
}

export async function fetchSessionVectorHead(symbol: string, tradingDate: string) {
  const query = new URLSearchParams({
    symbol,
    trading_date: tradingDate,
  })
  const payload = await getJson(`/analytics/session-vector/head?${query.toString()}`)
  return sessionVectorHeadResponseSchema.parse(payload)
}

export async function fetchSessionVectorSegments(symbol: string, tradingDate: string, fromSegment: number) {
  const query = new URLSearchParams({
    symbol,
    trading_date: tradingDate,
    from_segment: String(fromSegment),
  })
  const payload = await getJson(`/analytics/session-vector/segments?${query.toString()}`)
  return sessionVectorSegmentsResponseSchema.parse(payload)
}
