import {
  EFFECTIVE_COMMISSION_RATE,
  MIN_COMMISSION_THRESHOLD,
  MIN_COMMISSION_TOTAL,
  compareScenarios,
  computeOrderCost,
  computeTrade,
  sellPriceForNetProfit,
  sharesForAmount,
} from './tradeCalculator'

describe('trade calculator', () => {
  it('charges 0.125% + 19% VAT above $5.000.000 and a $6.250 + VAT minimum below', () => {
    expect(EFFECTIVE_COMMISSION_RATE).toBeCloseTo(0.0014875, 12)
    expect(MIN_COMMISSION_TOTAL).toBeCloseTo(7_437.5, 9)
    expect(MIN_COMMISSION_THRESHOLD).toBeCloseTo(5_000_000, 6)

    const small = computeOrderCost(1_000_000)
    expect(small).toMatchObject({ commissionBase: 6_250, minimumApplied: true })
    expect(small.commissionVat).toBeCloseTo(1_187.5, 9)
    expect(small.commission).toBeCloseTo(7_437.5, 9)

    const large = computeOrderCost(10_000_000)
    expect(large.minimumApplied).toBe(false)
    expect(large.commissionBase).toBeCloseTo(12_500, 9)
    expect(large.commission).toBeCloseTo(14_875, 9)
  })

  it.each([
    // Real trii orders (sep14.csv): gross → commission charged.
    [4_194_000, 7_437.5],
    [10_692_000, 15_904.35],
    [16_440_000, 24_454.5],
    [34_971_250, 52_019.734375],
  ])('matches the commission trii charged on a real %s order', (gross, charged) => {
    expect(computeOrderCost(gross).commission).toBeCloseTo(charged, 2)
  })

  it('computes a full round trip by number of shares', () => {
    // 4,000 ECOPETROL bought at 2,500 and sold at 2,530 (above the minimum on both sides).
    const outcome = computeTrade({ buyPrice: 2_500, sellPrice: 2_530, sizeMode: 'shares', shares: 4_000 })
    if (!outcome.ok) throw new Error(outcome.reason)
    const r = outcome.result

    expect(r.buy.gross).toBe(10_000_000)
    expect(r.buy.commission).toBeCloseTo(14_875, 6)
    expect(r.buy.total).toBeCloseTo(10_014_875, 6)
    expect(r.sell.gross).toBe(10_120_000)
    expect(r.sell.commission).toBeCloseTo(15_053.5, 6)
    expect(r.sell.net).toBeCloseTo(10_104_946.5, 6)
    expect(r.netProfit).toBeCloseTo(90_071.5, 6)
    expect(r.totalCommissions).toBeCloseTo(29_928.5, 6)
    expect(r.returnPct).toBeCloseTo((90_071.5 / 10_014_875) * 100, 9)
  })

  it('applies the minimum fee to small orders', () => {
    // 100 shares at 2,500 = $250.000 gross: the fee is the $7.437,50 minimum, not 0.14875%.
    const outcome = computeTrade({ buyPrice: 2_500, sellPrice: 2_530, sizeMode: 'shares', shares: 100 })
    if (!outcome.ok) throw new Error(outcome.reason)
    expect(outcome.result.buy.commission).toBeCloseTo(7_437.5, 9)
    expect(outcome.result.sell.commission).toBeCloseTo(7_437.5, 9)
    expect(outcome.result.netProfit).toBeCloseTo(3_000 - 2 * 7_437.5, 9)
  })

  it.each([
    ['small (minimum fee)', 100],
    ['large (percentage fee)', 4_000],
  ])('finds the break-even sell price for a %s order', (_, shares) => {
    const outcome = computeTrade({ buyPrice: 2_500, sellPrice: 2_510, sizeMode: 'shares', shares })
    if (!outcome.ok) throw new Error(outcome.reason)
    const atBreakEven = computeTrade({ buyPrice: 2_500, sellPrice: outcome.result.breakEvenSellPrice, sizeMode: 'shares', shares })
    if (!atBreakEven.ok) throw new Error(atBreakEven.reason)
    expect(atBreakEven.result.netProfit).toBeCloseTo(0, 6)
  })

  it('break-even for a small order covers both minimum fees', () => {
    // 100 × 2,500 = $250.000 + $7.437,50 paid; the sale must also cover another $7.437,50.
    const outcome = computeTrade({ buyPrice: 2_500, sellPrice: 2_510, sizeMode: 'shares', shares: 100 })
    if (!outcome.ok) throw new Error(outcome.reason)
    expect(outcome.result.breakEvenSellPrice).toBeCloseTo(2_648.75, 9)
  })

  it.each([
    // amount, price, expected shares
    [1_000_000, 2_500, 397], // minimum fee: (1.000.000 − 7.437,50) / 2.500 = 397,02
    [10_000_000, 2_500, 3_994], // percentage fee: 10.000.000 / (2.500 × 1,0014875) = 3.994,06
    [5_010_000, 2_500, 2_001], // just above the $5.000.000 threshold
  ])('sizes %s COP at %s per share into %s shares, commission paid from the amount', (amount, price, expected) => {
    expect(sharesForAmount(amount, price)).toBe(expected)
    const outcome = computeTrade({ buyPrice: price, sellPrice: price, sizeMode: 'amount', amount })
    if (!outcome.ok) throw new Error(outcome.reason)
    expect(outcome.result.buy.total).toBeLessThanOrEqual(amount)
    // One more share would not fit.
    const oneMore = computeOrderCost((expected + 1) * price)
    expect(oneMore.gross + oneMore.commission).toBeGreaterThan(amount)
  })

  it('finds the sell price for a target net result (0 = break-even)', () => {
    for (const shares of [100, 4_000]) {
      const outcome = computeTrade({ buyPrice: 2_500, sellPrice: 2_530, sizeMode: 'shares', shares })
      if (!outcome.ok) throw new Error(outcome.reason)
      expect(sellPriceForNetProfit(outcome.result, 0)).toBeCloseTo(outcome.result.breakEvenSellPrice, 9)
      expect(sellPriceForNetProfit(outcome.result, outcome.result.netProfit)).toBeCloseTo(2_530, 9)
    }
  })

  it('compares two scenarios and says what the trailing one needs to catch up', () => {
    const a = computeTrade({ buyPrice: 2_500, sellPrice: 2_530, sizeMode: 'amount', amount: 10_000_000 })
    const b = computeTrade({ buyPrice: 9_600, sellPrice: 9_720, sizeMode: 'amount', amount: 10_000_000 })
    if (!a.ok || !b.ok) throw new Error('expected complete scenarios')

    const comparison = compareScenarios(
      { result: a.result, buyPrice: 2_500, sellPrice: 2_530 },
      { result: b.result, buyPrice: 9_600, sellPrice: 9_720 },
    )
    expect(comparison.leader).toBe('B')
    expect(comparison.difference).toBeCloseTo(b.result.netProfit - a.result.netProfit, 9)
    expect(comparison.differencePct).toBeCloseTo((comparison.difference / a.result.netProfit) * 100, 9)

    // Selling A at the catch-up price leaves exactly B's net result.
    const caughtUp = computeTrade({
      buyPrice: 2_500,
      sellPrice: comparison.catchUpSellPrice as number,
      sizeMode: 'amount',
      amount: 10_000_000,
    })
    if (!caughtUp.ok) throw new Error(caughtUp.reason)
    expect(caughtUp.result.netProfit).toBeCloseTo(b.result.netProfit, 6)
    expect(comparison.catchUpRise).toBeCloseTo((comparison.catchUpSellPrice as number) - 2_530, 9)
    // Equivalent range: the trailing stock's move from its buy price vs the leader's move.
    expect(comparison.catchUpMove).toBeCloseTo((comparison.catchUpSellPrice as number) - 2_500, 9)
    expect(comparison.catchUpMovePct).toBeCloseTo(((comparison.catchUpSellPrice as number) / 2_500 - 1) * 100, 9)
    expect(comparison.leaderMove).toBe(120)
    expect(comparison.leaderMovePct).toBeCloseTo(1.25, 9)
  })

  it('catches up correctly when the trailing order is small (minimum fee)', () => {
    const a = computeTrade({ buyPrice: 2_500, sellPrice: 2_530, sizeMode: 'shares', shares: 1_000 })
    const b = computeTrade({ buyPrice: 9_600, sellPrice: 9_900, sizeMode: 'shares', shares: 1_000 })
    if (!a.ok || !b.ok) throw new Error('expected complete scenarios')
    const comparison = compareScenarios(
      { result: a.result, buyPrice: 2_500, sellPrice: 2_530 },
      { result: b.result, buyPrice: 9_600, sellPrice: 9_900 },
    )
    const caughtUp = computeTrade({ buyPrice: 2_500, sellPrice: comparison.catchUpSellPrice as number, sizeMode: 'shares', shares: 1_000 })
    if (!caughtUp.ok) throw new Error(caughtUp.reason)
    expect(caughtUp.result.netProfit).toBeCloseTo(b.result.netProfit, 6)
  })

  it('reports a tie without a catch-up price', () => {
    const a = computeTrade({ buyPrice: 2_500, sellPrice: 2_530, sizeMode: 'shares', shares: 100 })
    if (!a.ok) throw new Error(a.reason)
    const same = { result: a.result, buyPrice: 2_500, sellPrice: 2_530 }
    const comparison = compareScenarios(same, same)
    expect(comparison).toMatchObject({ leader: null, difference: 0, catchUpSellPrice: null })
  })

  it('reports a loss when selling below break-even', () => {
    const outcome = computeTrade({ buyPrice: 2_500, sellPrice: 2_500, sizeMode: 'shares', shares: 100 })
    if (!outcome.ok) throw new Error(outcome.reason)
    expect(outcome.result.netProfit).toBeLessThan(0)
    expect(outcome.result.netProfit).toBeCloseTo(-outcome.result.totalCommissions, 6)
  })

  it('rejects incomplete or invalid input with a reason', () => {
    expect(computeTrade({ buyPrice: 0, sellPrice: 2_500, sizeMode: 'shares', shares: 10 })).toEqual({ ok: false, reason: 'Ingresa el precio de compra' })
    expect(computeTrade({ buyPrice: 2_500, sellPrice: Number.NaN, sizeMode: 'shares', shares: 10 })).toEqual({ ok: false, reason: 'Ingresa el precio de venta' })
    expect(computeTrade({ buyPrice: 2_500, sellPrice: 2_510, sizeMode: 'shares', shares: 1.5 })).toEqual({
      ok: false,
      reason: 'Ingresa un número entero de acciones',
    })
    // $9.000 cannot cover one $2.500 share plus the $7.437,50 minimum fee.
    expect(computeTrade({ buyPrice: 2_500, sellPrice: 2_510, sizeMode: 'amount', amount: 9_000 })).toEqual({
      ok: false,
      reason: 'El monto no alcanza para una acción más la comisión',
    })
  })
})
