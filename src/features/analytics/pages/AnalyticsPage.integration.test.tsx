import { fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, vi } from 'vitest'
import { AnalyticsPage } from './AnalyticsPage'
import { server } from '../../../mocks/server'
import { renderWithProviders } from '../../../test/render'

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-08-22T10:00:00-05:00').getTime())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads the overview and renders symbol cards from mocked API data', async () => {
    renderWithProviders(<AnalyticsPage />)

    expect(await screen.findByRole('heading', { name: 'Analytics' })).toBeInTheDocument()
    expect((await screen.findAllByText('NUCO')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('ISA')).length).toBeGreaterThan(0)
  })

  it('loads z-score opportunities automatically when the tab is opened', async () => {
    renderWithProviders(<AnalyticsPage />)

    fireEvent.click(await screen.findByRole('tab', { name: 'Opportunities' }))

    await waitFor(() => {
      expect(screen.getAllByText('48H').length).toBeGreaterThan(0)
      expect(screen.getAllByLabelText(/z-score opportunity chart/i).length).toBe(10)
      expect(screen.getAllByText(/\(6\)/i).length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getAllByRole('button', { name: '24H' })[0])

    await waitFor(() => {
      expect(screen.getAllByText(/\(2\)/i).length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getAllByRole('button', { name: '6H' })[0])

    await waitFor(() => {
      expect(screen.getAllByLabelText(/z-score opportunity chart/i).length).toBe(10)
      expect(screen.getAllByRole('button', { name: '6H' })[0]).toHaveClass('zscore-toolbar__chip--active')
      expect(screen.getAllByText('No records in selected window').length).toBeGreaterThan(0)
    })
  })

  it('copies an AI prompt when a z-score point is clicked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    renderWithProviders(<AnalyticsPage />)

    fireEvent.click(await screen.findByRole('tab', { name: 'Opportunities' }))

    const copyTargets = await screen.findAllByTestId('zscore-copy-hit')
    fireEvent.click(copyTargets[0])

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1)
      expect(writeText.mock.calls[0]?.[0]).toContain('Responde exclusivamente usando estas tres secciones')
      expect(writeText.mock.calls[0]?.[0]).toContain('1. Analisis cuantitativo')
      expect(writeText.mock.calls[0]?.[0]).toContain('Evento completo en formato legible:')
    })
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
