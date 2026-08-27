import { describe, expect, it } from 'vitest'
import { summarizeDailyOrderPositionTimeline, summarizeOrderPosition } from './orderPosition'

describe('summarizeOrderPosition', () => {
  it('computes remaining quantity and weighted average price with FIFO', () => {
    const summary = summarizeOrderPosition(
      'TEST',
      [
        {
          symbol: 'TEST',
          normalized_status: 'approved',
          order_side: 'buy',
          filled_quantity: 10,
          price_per_share: 100,
          created_at: '2026-08-01T09:00:00-05:00',
          imported_at: null,
          created_at_symbol: null,
        },
        {
          symbol: 'TEST',
          normalized_status: 'approved',
          order_side: 'sell',
          filled_quantity: 5,
          price_per_share: 110,
          created_at: '2026-08-02T09:00:00-05:00',
          imported_at: null,
          created_at_symbol: null,
        },
        {
          symbol: 'TEST',
          normalized_status: 'approved',
          order_side: 'buy',
          filled_quantity: 20,
          price_per_share: 90,
          created_at: '2026-08-03T09:00:00-05:00',
          imported_at: null,
          created_at_symbol: null,
        },
        {
          symbol: 'TEST',
          normalized_status: 'approved',
          order_side: 'sell',
          filled_quantity: 4,
          price_per_share: 125,
          created_at: '2026-08-04T09:00:00-05:00',
          imported_at: null,
          created_at_symbol: null,
        },
      ],
      95,
    )

    expect(summary.availableQuantity).toBe(21)
    expect(summary.weightedAveragePrice).toBeCloseTo((100 + 20 * 90) / 21, 8)
    expect(summary.deltaValue).toBeCloseTo(95 - (100 + 20 * 90) / 21, 8)
    expect(summary.deltaPct).toBeCloseTo(((95 - (100 + 20 * 90) / 21) / ((100 + 20 * 90) / 21)) * 100, 8)
  })

  it('ignores non-approved rows and prevents negative inventory when sells exceed available lots', () => {
    const summary = summarizeOrderPosition(
      'TEST',
      [
        {
          symbol: 'TEST',
          normalized_status: 'pending',
          order_side: 'buy',
          filled_quantity: 50,
          price_per_share: 100,
          created_at: '2026-08-01T09:00:00-05:00',
          imported_at: null,
          created_at_symbol: null,
        },
        {
          symbol: 'TEST',
          normalized_status: 'approved',
          order_side: 'sell',
          filled_quantity: 5,
          price_per_share: 120,
          created_at: '2026-08-02T09:00:00-05:00',
          imported_at: null,
          created_at_symbol: null,
        },
      ],
      120,
    )

    expect(summary.availableQuantity).toBe(0)
    expect(summary.weightedAveragePrice).toBeNull()
    expect(summary.deltaValue).toBeNull()
    expect(summary.deltaPct).toBeNull()
  })
})

describe('summarizeDailyOrderPositionTimeline', () => {
  it('builds daily FIFO inventory, counts, and realized profit per trading date', () => {
    const timeline = summarizeDailyOrderPositionTimeline(
      'TEST',
      [
        {
          symbol: 'TEST',
          normalized_status: 'approved',
          order_side: 'buy',
          filled_quantity: 10,
          price_per_share: 100,
          created_at: '2026-08-01T09:00:00-05:00',
          imported_at: null,
          created_at_symbol: null,
        },
        {
          symbol: 'TEST',
          normalized_status: 'approved',
          order_side: 'sell',
          filled_quantity: 5,
          price_per_share: 110,
          created_at: '2026-08-02T09:00:00-05:00',
          imported_at: null,
          created_at_symbol: null,
        },
        {
          symbol: 'TEST',
          normalized_status: 'approved',
          order_side: 'buy',
          filled_quantity: 20,
          price_per_share: 90,
          created_at: '2026-08-03T09:00:00-05:00',
          imported_at: null,
          created_at_symbol: null,
        },
        {
          symbol: 'TEST',
          normalized_status: 'approved',
          order_side: 'sell',
          filled_quantity: 4,
          price_per_share: 125,
          created_at: '2026-08-04T09:00:00-05:00',
          imported_at: null,
          created_at_symbol: null,
        },
      ],
      [
        { tradingDate: '2026-08-01', lastPrice: 101 },
        { tradingDate: '2026-08-02', lastPrice: 111 },
        { tradingDate: '2026-08-03', lastPrice: 91 },
        { tradingDate: '2026-08-04', lastPrice: 95 },
      ],
    )

    expect(timeline['2026-08-01']).toMatchObject({
      availableQuantity: 10,
      weightedAveragePrice: 100,
      buyCount: 1,
      sellCount: 0,
      realizedProfit: 0,
    })
    expect(timeline['2026-08-01']?.buyOrders).toHaveLength(1)
    expect(timeline['2026-08-01']?.sellOrders).toHaveLength(0)

    expect(timeline['2026-08-02']).toMatchObject({
      availableQuantity: 5,
      weightedAveragePrice: 100,
      buyCount: 0,
      sellCount: 1,
      realizedProfit: 50,
    })
    expect(timeline['2026-08-02']?.sellOrders).toHaveLength(1)

    expect(timeline['2026-08-03']).toMatchObject({
      availableQuantity: 25,
      buyCount: 1,
      sellCount: 0,
      realizedProfit: 0,
    })
    expect(timeline['2026-08-03']?.weightedAveragePrice).toBeCloseTo(92, 8)

    expect(timeline['2026-08-04']).toMatchObject({
      availableQuantity: 21,
      buyCount: 0,
      sellCount: 1,
      realizedProfit: 100,
    })
    expect(timeline['2026-08-04']?.sellOrders?.[0]).toMatchObject({
      quantity: 4,
      price: 125,
      side: 'sell',
    })
    expect(timeline['2026-08-04']?.weightedAveragePrice).toBeCloseTo((100 + 20 * 90) / 21, 8)
    expect(timeline['2026-08-04']?.deltaValue).toBeCloseTo(95 - (100 + 20 * 90) / 21, 8)
  })
})
