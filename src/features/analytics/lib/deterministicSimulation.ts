import type { SnapshotRecord } from '../api/schemas'

export type SimulationScenario = {
  targetProfit: number
  quantity: number
  askPrice: number
  buyTotal: number
  sellTotal: number
  commissionCost: number
  totalResult: number
  isFeasible: boolean
}

export const PROFIT_TARGETS = [100_000, 200_000, 300_000] as const
export const DEFAULT_PROFIT_TARGET = PROFIT_TARGETS[0]
export const INVESTMENT_CAPS = [5_000_000, 10_000_000, 15_000_000] as const
export const DEFAULT_INVESTMENT_CAP = INVESTMENT_CAPS[1]
export const STOP_LOSS_TARGETS = [50_000, 100_000, 150_000, 200_000] as const
export const ALERT_AMOUNT_THRESHOLD = 15_000_000
export const MIN_INVESTMENT_AMOUNT = 5_000_000
export const TRII_PRO_VARIABLE_RATE = 0.0014875

const MAX_QUANTITY_SEARCH = 2_000_000

export function resolveRoundedPrice(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 0
  }

  return Math.max(1, Math.round(value))
}

export function resolveDefaultBidPrice(snapshot: SnapshotRecord) {
  const bestBidPrice = resolveRoundedPrice(snapshot.best_bid_price)
  if (bestBidPrice > 0) {
    return bestBidPrice
  }

  return Math.max(
    resolveRoundedPrice(snapshot.microprice),
    resolveRoundedPrice(snapshot.last_price),
    resolveRoundedPrice(snapshot.mid_price),
  )
}

export function resolveAskMinimum(snapshot: SnapshotRecord) {
  const candidates = [
    snapshot.best_bid_price,
    snapshot.microprice,
    snapshot.last_price,
    snapshot.best_ask_price,
    snapshot.mid_price,
    snapshot.low_price,
    snapshot.high_price,
  ]
    .map((value) => resolveRoundedPrice(value))
    .filter((value) => value > 0)

  if (candidates.length === 0) {
    return 0
  }

  return Math.min(...candidates)
}

export function resolveAskMaximum(snapshot: SnapshotRecord) {
  const candidates = [
    snapshot.high_price,
    snapshot.best_ask_price,
    snapshot.microprice,
    snapshot.last_price,
    snapshot.mid_price,
    snapshot.best_bid_price,
    snapshot.low_price,
  ]
    .map((value) => resolveRoundedPrice(value))
    .filter((value) => value > 0)

  if (candidates.length === 0) {
    return 0
  }

  return Math.max(...candidates)
}

export function resolveChartAskLossCutoff(bidPrice: number) {
  if (bidPrice <= 0) {
    return 0
  }

  const breakEvenAsk = (bidPrice * (1 + TRII_PRO_VARIABLE_RATE)) / (1 - TRII_PRO_VARIABLE_RATE)
  return Math.max(bidPrice, Math.ceil(breakEvenAsk))
}

export function resolveDefaultProfitRiskSpan(snapshot: SnapshotRecord) {
  const bidPrice = resolveDefaultBidPrice(snapshot)
  const askMin = resolveAskMinimum(snapshot)
  const askMax = resolveAskMaximum(snapshot)

  if (bidPrice <= 0 || askMin <= 0 || askMax <= askMin) {
    return Number.POSITIVE_INFINITY
  }

  const lossCutoffPrice = resolveChartAskLossCutoff(bidPrice)
  const boundedLossEnd = Math.min(lossCutoffPrice, askMax)
  const redSpan = Math.max(0, boundedLossEnd - askMin)
  const totalSpan = Math.max(1, askMax - askMin)

  return redSpan / totalSpan
}

export function calculateCommission(amount: number) {
  if (amount <= 0) {
    return 0
  }

  if (amount <= 5_000_000) {
    return 14_875 * 0.5
  }

  return amount * TRII_PRO_VARIABLE_RATE
}

export function computeNetProfit(quantity: number, bidPrice: number, askPrice: number) {
  const buyAmount = quantity * bidPrice
  const buyCommission = calculateCommission(buyAmount)
  const sellAmount = quantity * askPrice
  const sellCommission = calculateCommission(sellAmount)
  return sellAmount - sellCommission - buyAmount - buyCommission
}

export function buildScenarioTotals({
  targetProfit,
  quantity,
  bidPrice,
  askPrice,
  isFeasible,
}: {
  targetProfit: number
  quantity: number
  bidPrice: number
  askPrice: number
  isFeasible: boolean
}): SimulationScenario {
  if (quantity <= 0) {
    return {
      targetProfit,
      quantity: 0,
      askPrice,
      buyTotal: 0,
      sellTotal: 0,
      commissionCost: 0,
      totalResult: Math.min(-1, Math.round(computeNetProfit(1, bidPrice, askPrice))),
      isFeasible,
    }
  }

  const buyTotal = quantity * bidPrice
  const buyCommission = calculateCommission(buyTotal)
  const sellTotal = quantity * askPrice
  const sellCommission = calculateCommission(sellTotal)
  const commissionCost = buyCommission + sellCommission
  const totalResult = sellTotal - buyTotal - commissionCost

  return {
    targetProfit,
    quantity,
    askPrice,
    buyTotal,
    sellTotal,
    commissionCost,
    totalResult,
    isFeasible,
  }
}

export function buildFallbackScenario({
  bidPrice,
  targetProfit,
  askMin,
  askMax,
  maxInvestmentAmount,
}: {
  bidPrice: number
  targetProfit: number
  askMin: number
  askMax: number
  maxInvestmentAmount: number
}): SimulationScenario | null {
  if (bidPrice <= 0) {
    return null
  }

  const boundedCap = Math.max(bidPrice, maxInvestmentAmount)
  const quantity = Math.max(1, Math.floor(boundedCap / bidPrice))
  const askPrice = Math.max(askMin, askMax, bidPrice)

  return buildScenarioTotals({
    targetProfit,
    quantity,
    bidPrice,
    askPrice,
    isFeasible: false,
  })
}

export function solveOptimizedTargetScenario({
  bidPrice,
  targetProfit,
  askMin,
  askMax,
  maxInvestmentAmount,
}: {
  bidPrice: number
  targetProfit: number
  askMin: number
  askMax: number
  maxInvestmentAmount: number
}): SimulationScenario | null {
  const baseScenario = solveMinimumQuantityBaseScenario({
    bidPrice,
    targetProfit,
    askMin,
    askMax,
  })

  if (!baseScenario) {
    return null
  }

  return (
    refineScenarioWithinInvestmentRange({
      baseScenario,
      bidPrice,
      targetProfit,
      askMin,
      maxInvestmentAmount,
    }) ?? baseScenario
  )
}

export function resolveDefaultProfitScenario(
  snapshot: SnapshotRecord,
  targetProfit = DEFAULT_PROFIT_TARGET,
  maxInvestmentAmount = DEFAULT_INVESTMENT_CAP,
) {
  const bidPrice = resolveDefaultBidPrice(snapshot)
  const askMin = resolveAskMinimum(snapshot)
  const askMax = resolveAskMaximum(snapshot)

  return (
    solveOptimizedTargetScenario({
      bidPrice,
      targetProfit,
      askMin,
      askMax,
      maxInvestmentAmount,
    }) ??
    buildFallbackScenario({
      bidPrice,
      targetProfit,
      askMin,
      askMax,
      maxInvestmentAmount,
    })
  )
}

function solveMinimumQuantityBaseScenario({
  bidPrice,
  targetProfit,
  askMin,
  askMax,
}: {
  bidPrice: number
  targetProfit: number
  askMin: number
  askMax: number
}) {
  if (bidPrice <= 0 || askMin <= 0 || askMax <= 0 || askMax < askMin || askMax <= bidPrice) {
    return null
  }

  let lowQuantity = 1
  let highQuantity = 1

  while (highQuantity < MAX_QUANTITY_SEARCH && computeNetProfit(highQuantity, bidPrice, askMax) < targetProfit) {
    highQuantity *= 2
  }

  if (computeNetProfit(highQuantity, bidPrice, askMax) < targetProfit) {
    return null
  }

  while (lowQuantity < highQuantity) {
    const midpoint = Math.floor((lowQuantity + highQuantity) / 2)
    if (computeNetProfit(midpoint, bidPrice, askMax) >= targetProfit) {
      highQuantity = midpoint
    } else {
      lowQuantity = midpoint + 1
    }
  }

  const quantity = lowQuantity
  const askPrice = solveMinimumAsk({
    quantity,
    bidPrice,
    targetProfit,
    askMin,
    askMax,
  })

  if (askPrice === null) {
    return null
  }

  return buildScenarioTotals({
    targetProfit,
    quantity,
    bidPrice,
    askPrice,
    isFeasible: true,
  })
}

function refineScenarioWithinInvestmentRange({
  baseScenario,
  bidPrice,
  targetProfit,
  askMin,
  maxInvestmentAmount,
}: {
  baseScenario: SimulationScenario
  bidPrice: number
  targetProfit: number
  askMin: number
  maxInvestmentAmount: number
}) {
  if (!baseScenario.isFeasible || bidPrice <= 0 || askMin <= 0 || maxInvestmentAmount < MIN_INVESTMENT_AMOUNT) {
    return null
  }

  for (let askPrice = askMin; askPrice <= baseScenario.askPrice; askPrice += 1) {
    const candidate = solveFixedAskTargetScenario({
      bidPrice,
      askPrice,
      targetProfit,
    })

    if (!candidate.isFeasible) {
      continue
    }

    if (candidate.buyTotal < MIN_INVESTMENT_AMOUNT || candidate.buyTotal > maxInvestmentAmount) {
      continue
    }

    return candidate
  }

  return null
}

function solveMinimumAsk({
  quantity,
  bidPrice,
  targetProfit,
  askMin,
  askMax,
}: {
  quantity: number
  bidPrice: number
  targetProfit: number
  askMin: number
  askMax: number
}) {
  let low = askMin
  let high = askMax

  if (computeNetProfit(quantity, bidPrice, high) < targetProfit) {
    return null
  }

  while (low < high) {
    const midpoint = Math.floor((low + high) / 2)
    if (computeNetProfit(quantity, bidPrice, midpoint) >= targetProfit) {
      high = midpoint
    } else {
      low = midpoint + 1
    }
  }

  return low
}

function solveFixedAskTargetScenario({
  bidPrice,
  askPrice,
  targetProfit,
}: {
  bidPrice: number
  askPrice: number
  targetProfit: number
}): SimulationScenario {
  if (bidPrice <= 0 || askPrice <= 0 || askPrice <= bidPrice) {
    return buildScenarioTotals({
      targetProfit,
      quantity: 0,
      bidPrice,
      askPrice,
      isFeasible: false,
    })
  }

  let lowQuantity = 1
  let highQuantity = 1

  while (highQuantity < MAX_QUANTITY_SEARCH && computeNetProfit(highQuantity, bidPrice, askPrice) < targetProfit) {
    highQuantity *= 2
  }

  if (computeNetProfit(highQuantity, bidPrice, askPrice) < targetProfit) {
    return buildScenarioTotals({
      targetProfit,
      quantity: 0,
      bidPrice,
      askPrice,
      isFeasible: false,
    })
  }

  while (lowQuantity < highQuantity) {
    const midpoint = Math.floor((lowQuantity + highQuantity) / 2)
    if (computeNetProfit(midpoint, bidPrice, askPrice) >= targetProfit) {
      highQuantity = midpoint
    } else {
      lowQuantity = midpoint + 1
    }
  }

  return buildScenarioTotals({
    targetProfit,
    quantity: lowQuantity,
    bidPrice,
    askPrice,
    isFeasible: true,
  })
}
