import { http, HttpResponse } from 'msw'
import {
  analyticsCatalogFixture,
  analyticsHistoricStatsFixtures,
  analyticsSnapshotFixtures,
  dailyClosingFixture,
  zscoreOpportunitiesFixture,
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
  http.get('/api/analytics/zscore-opportunities', () => HttpResponse.json(zscoreOpportunitiesFixture)),
  http.get('/api/analytics/daily-closing', () => HttpResponse.json(dailyClosingFixture)),
]
