import { fireEvent, screen, waitFor } from '@testing-library/react'
import { AnalyticsPage } from './AnalyticsPage'
import { renderWithProviders } from '../../../test/render'

describe('AnalyticsPage', () => {
  it('loads the overview and renders symbol cards from mocked API data', async () => {
    renderWithProviders(<AnalyticsPage />)

    expect(await screen.findByRole('heading', { name: 'Analytics' })).toBeInTheDocument()
    expect((await screen.findAllByText('NUCO')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('ISA')).length).toBeGreaterThan(0)
  })

  it('loads z-score opportunities automatically when the tab is opened', async () => {
    renderWithProviders(<AnalyticsPage />)

    fireEvent.click(await screen.findByRole('tab', { name: 'Z-Score Opportunities' }))

    await waitFor(() => {
      expect(screen.getByText('snapshot_checksum')).toBeInTheDocument()
      expect(screen.getByText('checksum-1')).toBeInTheDocument()
    })
  })
})
