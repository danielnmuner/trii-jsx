import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DeterministicSimulationTile } from './DeterministicSimulationTile'
import type { SnapshotRecord } from '../api/schemas'

const infeasibleProfitSnapshot: SnapshotRecord = {
  symbol: 'CORFICOLCF',
  captured_at: '2026-08-24T15:00:00-05:00',
  symbol_captured_at: 'CORFICOLCF#2026-08-24T15:00:00-05:00',
  last_price: 22720,
  previous_close: 21000,
  daily_change_amount: 1720,
  daily_change_percent: 8.19,
  best_bid_price: 22700,
  best_ask_price: 22720,
  high_price: 22720,
  low_price: 21260,
  spread_bps: 8.81,
  obi_l1: -0.05,
  obi_top_5: -0.42,
  microprice: 22709.53,
  mid_price: 22710,
  traded_volume: 189762,
  traded_value: 4202000000,
}

describe('DeterministicSimulationTile', () => {
  it('keeps the simulation visible when target profit is infeasible at the current high price', () => {
    render(<DeterministicSimulationTile snapshot={infeasibleProfitSnapshot} />)

    expect(screen.getByLabelText('Deterministic trade simulation')).toBeInTheDocument()
    expect(screen.getByLabelText('Bid scenario chart')).toBeInTheDocument()
    expect(screen.getByLabelText('Ask scenario chart')).toBeInTheDocument()
    expect(screen.getAllByText('Qty').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '15M' })).toBeInTheDocument()
  })
})
