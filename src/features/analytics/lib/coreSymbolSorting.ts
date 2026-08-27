import type { AnalyticsSymbolFeed, ZscoreOpportunityRecord } from '../api/schemas'
import type { OrderPositionSummary } from './orderPosition'
import {
  DEFAULT_INVESTMENT_CAP,
  DEFAULT_PROFIT_TARGET,
  resolveDefaultProfitRiskSpan,
  resolveDefaultProfitScenario,
} from './deterministicSimulation'
import { computeStatZScore } from './formatters'
import { extractApprovedPositionSummary } from './positionSummary'

export const coreSortPresets = [
  { key: 'manual', label: 'Manual' },
  { key: 'held', label: 'Held' },
  { key: 'value', label: 'Most Traded' },
  { key: 'profit', label: 'Profit' },
  { key: 'flow_z', label: 'Flow Z' },
  { key: 'up', label: 'Up %' },
  { key: 'down', label: 'Down %' },
  { key: 'tight', label: 'Tight' },
  { key: 'wide', label: 'Wide' },
  { key: 'recent', label: 'Recent' },
] as const

export type CoreSortIntent = (typeof coreSortPresets)[number]['key']

type RankCoreSymbolsArgs = {
  baseOrder: string[]
  latestBySymbol: Record<string, AnalyticsSymbolFeed | undefined>
  orderPositionsBySymbol?: Record<string, OrderPositionSummary | undefined>
  intent: CoreSortIntent
}

export function rankCoreSymbols({
  baseOrder,
  latestBySymbol,
  orderPositionsBySymbol,
  intent,
}: RankCoreSymbolsArgs) {
  if (intent === 'manual') {
    return baseOrder
  }

  const baseIndex = new Map(baseOrder.map((symbol, index) => [symbol, index]))
  const profitScenariosBySymbol =
    intent === 'profit'
      ? Object.fromEntries(
          baseOrder.map((symbol) => [
            symbol,
            resolveProfitScenario(latestBySymbol[symbol]),
          ]),
        )
      : undefined
  const profitRiskBySymbol =
    intent === 'profit'
      ? Object.fromEntries(
          baseOrder.map((symbol) => [
            symbol,
            resolveProfitRisk(latestBySymbol[symbol]),
          ]),
        )
      : undefined

  return [...baseOrder].sort((left, right) => {
    const compareByIntent = compareSymbolsByIntent({
      left,
      right,
      latestBySymbol,
      orderPositionsBySymbol,
      intent,
      profitScenariosBySymbol,
      profitRiskBySymbol,
    })

    if (compareByIntent !== 0) {
      return compareByIntent
    }

    return (baseIndex.get(left) ?? 0) - (baseIndex.get(right) ?? 0)
  })
}

function compareSymbolsByIntent({
  left,
  right,
  latestBySymbol,
  orderPositionsBySymbol,
  intent,
  profitScenariosBySymbol,
  profitRiskBySymbol,
}: {
  left: string
  right: string
  latestBySymbol: Record<string, AnalyticsSymbolFeed | undefined>
  orderPositionsBySymbol?: Record<string, OrderPositionSummary | undefined>
  intent: Exclude<CoreSortIntent, 'manual'>
  profitScenariosBySymbol?: Record<string, ReturnType<typeof resolveDefaultProfitScenario> | undefined>
  profitRiskBySymbol?: Record<string, number | undefined>
}) {
  const leftSnapshot = latestBySymbol[left]?.current_snapshot
  const rightSnapshot = latestBySymbol[right]?.current_snapshot

  if (intent === 'held') {
    return compareNumbersDesc(
      resolveHeldInvestmentValue(orderPositionsBySymbol?.[left]),
      resolveHeldInvestmentValue(orderPositionsBySymbol?.[right]),
    )
  }

  if (intent === 'up') {
    return compareNumbersDesc(
      leftSnapshot?.daily_change_percent,
      rightSnapshot?.daily_change_percent,
    )
  }

  if (intent === 'down') {
    return compareNumbersAsc(
      leftSnapshot?.daily_change_percent,
      rightSnapshot?.daily_change_percent,
    )
  }

  if (intent === 'tight') {
    return compareNumbersAsc(leftSnapshot?.spread_bps, rightSnapshot?.spread_bps)
  }

  if (intent === 'recent') {
    return compareTimestampsDesc(leftSnapshot?.captured_at, rightSnapshot?.captured_at)
  }

  if (intent === 'value') {
    return compareNumbersDesc(leftSnapshot?.traded_value, rightSnapshot?.traded_value)
  }

  if (intent === 'profit') {
    const leftScenario = profitScenariosBySymbol?.[left]
    const rightScenario = profitScenariosBySymbol?.[right]
    const leftQualified = isProfitQualified(leftScenario)
    const rightQualified = isProfitQualified(rightScenario)

    if (leftQualified !== rightQualified) {
      return leftQualified ? -1 : 1
    }

    if (leftQualified && rightQualified) {
      const riskComparison = compareNumbersAsc(profitRiskBySymbol?.[left], profitRiskBySymbol?.[right])
      if (riskComparison !== 0) {
        return riskComparison
      }

      return compareNumbersAsc(leftScenario?.quantity, rightScenario?.quantity)
    }

    return 0
  }

  if (intent === 'flow_z') {
    return compareNumbersDesc(
      resolveFlowSignalZScore(latestBySymbol[left]),
      resolveFlowSignalZScore(latestBySymbol[right]),
    )
  }

  return compareNumbersDesc(leftSnapshot?.spread_bps, rightSnapshot?.spread_bps)
}

export function collectFlowSignalSymbols({
  symbols,
  latestBySymbol,
}: {
  symbols: string[]
  latestBySymbol: Record<string, AnalyticsSymbolFeed | undefined>
}) {
  return symbols.filter((symbol) => hasPositiveFlowSignal(latestBySymbol[symbol]))
}

export function resolveAvailableQuantity(
  snapshot: AnalyticsSymbolFeed['current_snapshot'] | undefined,
  zscoreRecord: ZscoreOpportunityRecord | undefined,
) {
  const snapshotSummary = extractApprovedPositionSummary(
    (snapshot as Record<string, unknown> | undefined)?.approved_position_summary,
  )
  if (typeof snapshotSummary?.available_quantity === 'number') {
    return snapshotSummary.available_quantity
  }

  const zscoreSummary = extractApprovedPositionSummary(
    (zscoreRecord as Record<string, unknown> | undefined)?.approved_position_summary,
  )

  return typeof zscoreSummary?.available_quantity === 'number' ? zscoreSummary.available_quantity : 0
}

export function resolveHeldInvestmentValue(positionSummary: OrderPositionSummary | undefined) {
  if (!positionSummary) {
    return 0
  }

  const quantity =
    typeof positionSummary.availableQuantity === 'number' && Number.isFinite(positionSummary.availableQuantity)
      ? positionSummary.availableQuantity
      : 0
  const average =
    typeof positionSummary.weightedAveragePrice === 'number' && Number.isFinite(positionSummary.weightedAveragePrice)
      ? positionSummary.weightedAveragePrice
      : 0

  if (quantity <= 0 || average <= 0) {
    return 0
  }

  return quantity * average
}

function compareNumbersDesc(left: number | null | undefined, right: number | null | undefined) {
  return normalizeNumberDesc(right) - normalizeNumberDesc(left)
}

function compareNumbersAsc(left: number | null | undefined, right: number | null | undefined) {
  return normalizeNumber(left) - normalizeNumber(right)
}

function normalizeNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.POSITIVE_INFINITY
}

function normalizeNumberDesc(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY
}

function compareTimestampsDesc(left: string | null | undefined, right: string | null | undefined) {
  return normalizeTimestamp(right) - normalizeTimestamp(left)
}

function normalizeTimestamp(value: string | null | undefined) {
  if (!value) {
    return Number.NEGATIVE_INFINITY
  }

  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY
}

export function resolveFlowSignalZScore(feed: AnalyticsSymbolFeed | undefined) {
  const tradedVolumeZ = computeStatZScore(feed?.current_stats?.traded_volume)
  const tradedValueZ = computeStatZScore(feed?.current_stats?.traded_value)
  return Math.max(
    typeof tradedVolumeZ === 'number' && Number.isFinite(tradedVolumeZ) ? tradedVolumeZ : Number.NEGATIVE_INFINITY,
    typeof tradedValueZ === 'number' && Number.isFinite(tradedValueZ) ? tradedValueZ : Number.NEGATIVE_INFINITY,
  )
}

export function hasPositiveFlowSignal(feed: AnalyticsSymbolFeed | undefined) {
  return resolveFlowSignalZScore(feed) > 1.8
}

function isProfitQualified(scenario: ReturnType<typeof resolveDefaultProfitScenario> | undefined) {
  return Boolean(scenario && scenario.totalResult >= DEFAULT_PROFIT_TARGET)
}

function resolveProfitScenario(feed: AnalyticsSymbolFeed | undefined) {
  if (!feed?.current_snapshot) {
    return undefined
  }

  return resolveDefaultProfitScenario(
    feed.current_snapshot,
    DEFAULT_PROFIT_TARGET,
    DEFAULT_INVESTMENT_CAP,
  )
}

function resolveProfitRisk(feed: AnalyticsSymbolFeed | undefined) {
  if (!feed?.current_snapshot) {
    return undefined
  }

  return resolveDefaultProfitRiskSpan(feed.current_snapshot)
}
