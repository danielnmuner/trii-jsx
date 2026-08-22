import { http, HttpResponse } from 'msw'
import {
  analyticsCatalogFixture,
  analyticsHistoricStatsFixtures,
  analyticsSnapshotFixtures,
  dailyClosingFixtures,
  zscoreOpportunitiesFixtures,
} from './fixtures'

export const handlers = [
  http.get('/api/analytics/catalog', () => HttpResponse.json(analyticsCatalogFixture)),
  http.get('/api/analytics/snapshot', ({ request }) => {
    const url = new URL(request.url)
    const symbol = url.searchParams.get('symbol')?.toUpperCase()
    const payload = symbol ? analyticsSnapshotFixtures[symbol as keyof typeof analyticsSnapshotFixtures] : null

    if (!payload) {
      return HttpResponse.json({ message: 'Symbol not found' }, { status: 404 })
    }

    return HttpResponse.json(payload)
  }),
  http.get('/api/analytics/historic-stats', ({ request }) => {
    const url = new URL(request.url)
    const symbol = url.searchParams.get('symbol')?.toUpperCase()
    const payload = symbol ? analyticsHistoricStatsFixtures[symbol as keyof typeof analyticsHistoricStatsFixtures] : null

    if (!payload) {
      return HttpResponse.json({ message: 'Symbol not found' }, { status: 404 })
    }

    return HttpResponse.json(payload)
  }),
  http.get('/api/analytics/zscore-opportunities', ({ request }) => {
    const url = new URL(request.url)
    const symbol = url.searchParams.get('symbol')?.toUpperCase() ?? 'NUCO'
    const tradingDate = url.searchParams.get('trading_date') ?? '2026-08-21'
    const payload = zscoreOpportunitiesFixtures[`${symbol}:${tradingDate}`]

    if (!payload) {
      return HttpResponse.json({
        status: 'ok',
        result: { symbol, trading_date: tradingDate, record_count: 0, records: [] },
      })
    }

    return HttpResponse.json(payload)
  }),
  http.get('/api/analytics/daily-closing', ({ request }) => {
    const url = new URL(request.url)
    const symbol = url.searchParams.get('symbol')?.toUpperCase() ?? 'NUCO'
    const payload = dailyClosingFixtures[symbol]

    if (!payload) {
      return HttpResponse.json({
        status: 'ok',
        result: { symbol, trading_date: null, record_count: 0, records: [] },
      })
    }

    return HttpResponse.json(payload)
  }),
]
