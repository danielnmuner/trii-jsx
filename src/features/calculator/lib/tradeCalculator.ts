import { TRII_PRO_COMMISSION_RATE, VAT_RATE } from '../../paperwork/lib/analytics'

/**
 * Commission per order with Trii Pro (50% of trii's standard fee), plus 19% VAT on it:
 * - 0.125% of the gross amount, with a minimum of $6.250 (standard: 0.25%, minimum $12.500);
 * - the minimum applies up to $5.000.000 gross, where 0.125% reaches $6.250.
 * So each order costs max(0.125% × gross, $6.250) × 1.19, i.e. at least $7.437,50.
 * Checked against real orders: a $4.194.000 sale was charged $7.437,50, larger ones 0.14875%.
 */
export const COMMISSION_RATE = TRII_PRO_COMMISSION_RATE
export const COMMISSION_VAT_RATE = VAT_RATE
export const MIN_COMMISSION_BASE = 6_250
/** Effective cost per order above the minimum, as a fraction of the gross amount: 0.14875%. */
export const EFFECTIVE_COMMISSION_RATE = COMMISSION_RATE * (1 + COMMISSION_VAT_RATE)
/** Minimum cost per order including VAT: $7.437,50. */
export const MIN_COMMISSION_TOTAL = MIN_COMMISSION_BASE * (1 + COMMISSION_VAT_RATE)
/** Gross amount where the percentage fee reaches the minimum: $5.000.000. */
export const MIN_COMMISSION_THRESHOLD = MIN_COMMISSION_BASE / COMMISSION_RATE

export type SizeMode = 'shares' | 'amount'

export type TradeInput = {
  buyPrice: number
  sellPrice: number
  sizeMode: SizeMode
  /** Number of shares when sizeMode is 'shares'. */
  shares?: number
  /** Cash to invest (commission included) when sizeMode is 'amount'. */
  amount?: number
}

export type OrderCost = {
  gross: number
  commissionBase: number
  commissionVat: number
  commission: number
  /** True when the order pays the minimum fee instead of the percentage. */
  minimumApplied: boolean
}

export type TradeResult = {
  shares: number
  /** Cash left over from the invested amount (amount mode only, else 0). */
  leftoverCash: number
  buy: OrderCost & { total: number }
  sell: OrderCost & { net: number }
  totalCommissions: number
  netProfit: number
  /** Net profit over the total paid for the purchase, in %. */
  returnPct: number
  netProfitPerShare: number
  /** Sell price at which the net profit is exactly zero. */
  breakEvenSellPrice: number
}

export type TradeValidation = { ok: true; result: TradeResult } | { ok: false; reason: string }

export function computeOrderCost(gross: number): OrderCost {
  const percentageBase = gross * COMMISSION_RATE
  const minimumApplied = percentageBase < MIN_COMMISSION_BASE
  const commissionBase = minimumApplied ? MIN_COMMISSION_BASE : percentageBase
  const commissionVat = commissionBase * COMMISSION_VAT_RATE
  return { gross, commissionBase, commissionVat, commission: commissionBase + commissionVat, minimumApplied }
}

/** Total paid to buy `shares` at `buyPrice`, commission included. */
function buyTotalFor(shares: number, buyPrice: number) {
  const cost = computeOrderCost(shares * buyPrice)
  return cost.gross + cost.commission
}

/** Whole shares an amount buys once the buy commission is paid out of that same amount. */
export function sharesForAmount(amount: number, buyPrice: number) {
  if (!(amount > 0) || !(buyPrice > 0)) {
    return 0
  }
  // Two regimes: the minimum fee (small orders) and the percentage (large ones). Take the best
  // candidate of each that fits, then nudge for floating-point edges.
  const candidates = [
    Math.floor((amount - MIN_COMMISSION_TOTAL) / buyPrice + 1e-9),
    Math.floor(amount / (buyPrice * (1 + EFFECTIVE_COMMISSION_RATE)) + 1e-9),
  ].filter((shares) => shares >= 1 && buyTotalFor(shares, buyPrice) <= amount + 1e-6)
  let shares = Math.max(0, ...candidates)
  while (shares > 0 && buyTotalFor(shares, buyPrice) > amount + 1e-6) {
    shares -= 1
  }
  while (buyTotalFor(shares + 1, buyPrice) <= amount + 1e-6) {
    shares += 1
  }
  return shares
}

/** Gross sale needed so that, after the sell commission, `net` pesos are received. */
function grossForNetProceeds(net: number) {
  const aboveMinimum = net / (1 - EFFECTIVE_COMMISSION_RATE)
  return aboveMinimum >= MIN_COMMISSION_THRESHOLD ? aboveMinimum : net + MIN_COMMISSION_TOTAL
}

export function computeTrade(input: TradeInput): TradeValidation {
  const { buyPrice, sellPrice } = input
  if (!isPositive(buyPrice)) {
    return { ok: false, reason: 'Ingresa el precio de compra' }
  }
  if (!isPositive(sellPrice)) {
    return { ok: false, reason: 'Ingresa el precio de venta' }
  }

  let shares: number
  if (input.sizeMode === 'amount') {
    if (!isPositive(input.amount)) {
      return { ok: false, reason: 'Ingresa el monto a invertir' }
    }
    shares = sharesForAmount(input.amount as number, buyPrice)
    if (shares < 1) {
      return { ok: false, reason: 'El monto no alcanza para una acción más la comisión' }
    }
  } else {
    if (!isPositive(input.shares) || !Number.isInteger(input.shares)) {
      return { ok: false, reason: 'Ingresa un número entero de acciones' }
    }
    shares = input.shares as number
  }

  const buyCost = computeOrderCost(buyPrice * shares)
  const buyTotal = buyCost.gross + buyCost.commission
  const sellCost = computeOrderCost(sellPrice * shares)
  const sellNet = sellCost.gross - sellCost.commission
  const netProfit = sellNet - buyTotal

  return {
    ok: true,
    result: {
      shares,
      leftoverCash: input.sizeMode === 'amount' ? (input.amount as number) - buyTotal : 0,
      buy: { ...buyCost, total: buyTotal },
      sell: { ...sellCost, net: sellNet },
      totalCommissions: buyCost.commission + sellCost.commission,
      netProfit,
      returnPct: (netProfit / buyTotal) * 100,
      netProfitPerShare: netProfit / shares,
      breakEvenSellPrice: grossForNetProceeds(buyTotal) / shares,
    },
  }
}

/** Sell price at which the same position reaches `targetNetProfit` (0 gives the break-even). */
export function sellPriceForNetProfit(result: TradeResult, targetNetProfit: number) {
  return grossForNetProceeds(targetNetProfit + result.buy.total) / result.shares
}

export type ScenarioComparison = {
  leader: 'A' | 'B' | null
  /** How much more net result the leader leaves (COP, ≥ 0). */
  difference: number
  /** Difference relative to the other scenario's net result, when that one is a gain. */
  differencePct: number | null
  /** Sell price the trailing scenario needs to match the leader's net result. */
  catchUpSellPrice: number | null
  /** How much that is above the trailing scenario's current sell price (COP and %). */
  catchUpRise: number | null
  catchUpRisePct: number | null
  /** Equivalent range: the trailing move needed from its buy price (COP and %)… */
  catchUpMove: number | null
  catchUpMovePct: number | null
  /** …versus the leader's own move from buy to sell (COP and %). */
  leaderMove: number | null
  leaderMovePct: number | null
  returnLeader: 'A' | 'B' | null
}

type ComparedScenario = { result: TradeResult; buyPrice: number; sellPrice: number }

/** Compares two complete scenarios by net result and works out what the trailing one needs. */
export function compareScenarios(a: ComparedScenario, b: ComparedScenario): ScenarioComparison {
  const difference = a.result.netProfit - b.result.netProfit
  const leader = Math.abs(difference) < 0.5 ? null : difference > 0 ? 'A' : 'B'
  const returnGap = a.result.returnPct - b.result.returnPct
  const returnLeader = Math.abs(returnGap) < 1e-9 ? null : returnGap > 0 ? 'A' : 'B'

  if (leader === null) {
    return {
      leader,
      difference: 0,
      differencePct: null,
      catchUpSellPrice: null,
      catchUpRise: null,
      catchUpRisePct: null,
      catchUpMove: null,
      catchUpMovePct: null,
      leaderMove: null,
      leaderMovePct: null,
      returnLeader,
    }
  }

  const ahead = leader === 'A' ? a : b
  const behind = leader === 'A' ? b : a
  const catchUpSellPrice = sellPriceForNetProfit(behind.result, ahead.result.netProfit)
  return {
    leader,
    difference: Math.abs(difference),
    differencePct: behind.result.netProfit > 0 ? (Math.abs(difference) / behind.result.netProfit) * 100 : null,
    catchUpSellPrice,
    catchUpRise: catchUpSellPrice - behind.sellPrice,
    catchUpRisePct: (catchUpSellPrice / behind.sellPrice - 1) * 100,
    catchUpMove: catchUpSellPrice - behind.buyPrice,
    catchUpMovePct: (catchUpSellPrice / behind.buyPrice - 1) * 100,
    leaderMove: ahead.sellPrice - ahead.buyPrice,
    leaderMovePct: (ahead.sellPrice / ahead.buyPrice - 1) * 100,
    returnLeader,
  }
}

function isPositive(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}
