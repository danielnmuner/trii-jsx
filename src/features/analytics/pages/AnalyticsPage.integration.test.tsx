import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, vi } from 'vitest'
import { AnalyticsPage } from './AnalyticsPage'
import { analyticsSnapshotFixtures } from '../../../mocks/fixtures'
import { server } from '../../../mocks/server'
import { renderWithProviders } from '../../../test/render'

// The fixtures are captured on Friday 2026-08-21 at 14:30 Bogota. Start the clock shortly after
// (Date only, still ticking in real time so animations and polling keep working), so the overview
// treats them as today's session regardless of the real date.
const FIXTURE_NOW = new Date('2026-08-21T14:45:00-05:00')

// Full page renders are heavy (first render includes a cold module load): allow more than 5s.
describe('AnalyticsPage', { timeout: 20_000 }, () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })
    vi.setSystemTime(FIXTURE_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('shows the current tabs and renders symbol cards from mocked API data', async () => {
    renderWithProviders(<AnalyticsPage />)

    expect(await screen.findByRole('tab', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Historic' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Paperwork' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Benchmark Stats' })).not.toBeInTheDocument()

    expect((await screen.findAllByText('NUCO')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('ISA')).length).toBeGreaterThan(0)
  })

  it('never shows or requests data for an inactive issuer', async () => {
    const requestedSymbols = new Set<string>()
    const onRequest = ({ request }: { request: Request }) => {
      const symbol = new URL(request.url).searchParams.get('symbol')
      if (symbol) {
        requestedSymbols.add(symbol.toUpperCase())
      }
    }
    server.events.on('request:start', onRequest)

    try {
      renderWithProviders(<AnalyticsPage />)

      expect((await screen.findAllByText('NUCO')).length).toBeGreaterThan(0)
      await waitFor(() => expect(requestedSymbols.has('NUCO')).toBe(true))

      // The issuers fixture lists INACTIVE with is_active: false.
      expect(requestedSymbols.has('INACTIVE')).toBe(false)
      expect(screen.queryByText('INACTIVE')).not.toBeInTheDocument()
    } finally {
      server.events.removeListener('request:start', onRequest)
    }
  })

  it('shows the daily range tape with today range against the historic distribution', async () => {
    // 25 weekdays before the fixture day cycling 500 / 600 / 700 COP ranges: the median stays 600
    // even if a Colombian holiday in the period is discarded.
    server.use(
      http.get('/api/analytics/daily-closing', ({ request }) => {
        const symbol = new URL(request.url).searchParams.get('symbol') ?? 'NUCO'
        const records = buildBusinessDays('2026-08-20', 25).map((tradingDate, index) => ({
          symbol,
          trading_date: tradingDate,
          source_captured_at: `${tradingDate}T15:01:00-05:00`,
          high_price: 40_000 + [500, 600, 700][index % 3],
          low_price: 40_000,
          last_price: 40_200,
          previous_close: 40_100,
        }))
        return HttpResponse.json({
          status: 'ok',
          result: { symbol, trading_date: records[0]?.trading_date ?? null, record_count: records.length, records },
        })
      }),
    )

    renderWithProviders(<AnalyticsPage />)

    const tapes = await screen.findAllByLabelText('Daily range versus history', {}, { timeout: 5000 })
    const nucoCard = tapes.find((tape) => tape.closest('article')?.textContent?.includes('NUCO'))
    expect(nucoCard).toBeDefined()

    const tape = within(nucoCard as HTMLElement)

    // Today's range = high − low of NUCO's current fixture snapshot (widened by the last price).
    const current = analyticsSnapshotFixtures.NUCO.result.current_snapshot
    const high = Math.max(current.high_price ?? 0, current.last_price ?? 0)
    const low = Math.min(current.low_price ?? Infinity, current.last_price ?? Infinity)
    expect(tape.getByText(new Intl.NumberFormat('en-US').format(high - low))).toBeInTheDocument()
    // The median of the historic ranges is on the scale, with the σ steps labelled above it.
    expect(tape.getAllByText('600').length).toBeGreaterThan(0)
    expect(tape.getByText('+1σ')).toBeInTheDocument()
  })

  it('keeps the last successful overview visible when a later sync fails', async () => {
    const { queryClient } = renderWithProviders(<AnalyticsPage />)

    expect((await screen.findAllByText('NUCO')).length).toBeGreaterThan(0)

    server.use(
      http.get('/api/analytics/snapshot', () => HttpResponse.json({ message: 'Service Unavailable' }, { status: 503 })),
      http.get('/api/analytics/historic-stats', () => HttpResponse.json({ message: 'Service Unavailable' }, { status: 503 })),
    )

    await queryClient.invalidateQueries({ queryKey: ['analytics', 'symbol-feed'] })

    await waitFor(() => {
      expect(screen.queryByText('Snapshot Request Failed')).not.toBeInTheDocument()
      expect(screen.getAllByText('NUCO').length).toBeGreaterThan(0)
    })
  })
})

/** `count` weekdays going back from `lastDate` (inclusive), newest first. */
function buildBusinessDays(lastDate: string, count: number) {
  const dates: string[] = []
  const cursor = new Date(`${lastDate}T12:00:00Z`)
  while (dates.length < count) {
    const weekday = cursor.getUTCDay()
    if (weekday !== 0 && weekday !== 6) {
      dates.push(cursor.toISOString().slice(0, 10))
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return dates
}
