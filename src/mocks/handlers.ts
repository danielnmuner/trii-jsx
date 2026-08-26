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
    const fromTradingDate = url.searchParams.get('from_trading_date')
    const toTradingDate = url.searchParams.get('to_trading_date')
    const sinceCapturedAt = url.searchParams.get('since_captured_at')

    if (fromTradingDate || toTradingDate || sinceCapturedAt) {
      const fixtureEntries = Object.entries(zscoreOpportunitiesFixtures)
        .filter(([key]) => key.startsWith(`${symbol}:`))
        .map(([, payload]) => payload.result.records)
        .flat()
        .sort((left, right) => new Date(left.captured_at).getTime() - new Date(right.captured_at).getTime())

      const records = fixtureEntries.filter((record) => {
        const capturedAt = record.captured_at
        const tradingDay = record.trading_date ?? capturedAt.slice(0, 10)

        if (sinceCapturedAt) {
          return capturedAt > sinceCapturedAt
        }
        if (fromTradingDate && tradingDay < fromTradingDate) {
          return false
        }
        if (toTradingDate && tradingDay > toTradingDate) {
          return false
        }
        return true
      })

      return HttpResponse.json({
        status: 'ok',
        result: {
          symbol,
          trading_date: null,
          from_trading_date: fromTradingDate,
          to_trading_date: toTradingDate,
          since_captured_at: sinceCapturedAt,
          record_count: records.length,
          records,
        },
      })
    }

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
