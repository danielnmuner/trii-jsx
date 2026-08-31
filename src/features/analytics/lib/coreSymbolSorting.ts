import type { AnalyticsSymbolFeed, ZscoreOpportunityRecord } from '../api/schemas'
import type { OrderPositionSummary } from './orderPosition'
import { computeCumulativeVwap } from './formatters'
import { extractApprovedPositionSummary } from './positionSummary'

export const coreSortPresets = [
  { key: 'manual', label: 'Manual' },
  { key: 'value', label: 'Most Traded' },
  { key: 'up', label: 'Up %' },
  { key: 'down', label: 'Down %' },
  { key: 'tight', label: 'Tight' },
  { key: 'wide', label: 'Wide' },
] as const

export type CoreSortIntent = (typeof coreSortPresets)[number]['key']

type RankCoreSymbolsArgs = {
  baseOrder: string[]
  latestBySymbol: Record<string, AnalyticsSymbolFeed | undefined>
  intent: CoreSortIntent
}

export function rankCoreSymbols({
  baseOrder,
  latestBySymbol,
  intent,
}: RankCoreSymbolsArgs) {
  if (intent === 'manual') {
    return baseOrder
  }

  const baseIndex = new Map(baseOrder.map((symbol, index) => [symbol, index]))

  return [...baseOrder].sort((left, right) => {
    const compareByIntent = compareSymbolsByIntent({
      left,
      right,
      latestBySymbol,
      intent,
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
  intent,
}: {
  left: string
  right: string
  latestBySymbol: Record<string, AnalyticsSymbolFeed | undefined>
  intent: Exclude<CoreSortIntent, 'manual'>
}) {
  const leftSnapshot = latestBySymbol[left]?.current_snapshot
  const rightSnapshot = latestBySymbol[right]?.current_snapshot

  if (intent === 'up') {
    return compareLastVsVwapRelativeDesc(leftSnapshot, rightSnapshot)
  }

  if (intent === 'down') {
    return compareLastVsVwapRelativeAsc(leftSnapshot, rightSnapshot)
  }

  if (intent === 'tight') {
    return compareNumbersAsc(leftSnapshot?.spread_bps, rightSnapshot?.spread_bps)
  }

  if (intent === 'value') {
    return compareNumbersDesc(leftSnapshot?.traded_value, rightSnapshot?.traded_value)
  }

  return compareNumbersDesc(leftSnapshot?.spread_bps, rightSnapshot?.spread_bps)
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

export function resolveOwnedInvestmentValue(positionSummary: OrderPositionSummary | undefined) {
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

function compareLastVsVwapRelativeDesc(
  leftSnapshot: AnalyticsSymbolFeed['current_snapshot'] | undefined,
  rightSnapshot: AnalyticsSymbolFeed['current_snapshot'] | undefined,
) {
  const leftRelative = resolveLastVsVwapRelative(leftSnapshot)
  const rightRelative = resolveLastVsVwapRelative(rightSnapshot)
  const leftMatches = typeof leftRelative === 'number' && leftRelative > 0
  const rightMatches = typeof rightRelative === 'number' && rightRelative > 0

  if (leftMatches && !rightMatches) {
    return -1
  }

  if (!leftMatches && rightMatches) {
    return 1
  }

  if (leftMatches && rightMatches) {
    return compareNumbersDesc(leftRelative, rightRelative)
  }

  return 0
}

function compareLastVsVwapRelativeAsc(
  leftSnapshot: AnalyticsSymbolFeed['current_snapshot'] | undefined,
  rightSnapshot: AnalyticsSymbolFeed['current_snapshot'] | undefined,
) {
  const leftRelative = resolveLastVsVwapRelative(leftSnapshot)
  const rightRelative = resolveLastVsVwapRelative(rightSnapshot)
  const leftMatches = typeof leftRelative === 'number' && leftRelative < 0
  const rightMatches = typeof rightRelative === 'number' && rightRelative < 0

  if (leftMatches && !rightMatches) {
    return -1
  }

  if (!leftMatches && rightMatches) {
    return 1
  }

  if (leftMatches && rightMatches) {
    return compareNumbersAsc(leftRelative, rightRelative)
  }

  return 0
}

function resolveLastVsVwapRelative(snapshot: AnalyticsSymbolFeed['current_snapshot'] | undefined) {
  if (!snapshot) {
    return null
  }

  const lastPrice = snapshot.last_price
  const vwap = computeCumulativeVwap(snapshot)

  if (
    lastPrice === null ||
    lastPrice === undefined ||
    Number.isNaN(lastPrice) ||
    vwap === null ||
    vwap === undefined ||
    Number.isNaN(vwap) ||
    vwap === 0
  ) {
    return null
  }

  return ((lastPrice - vwap) / vwap) * 100
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
