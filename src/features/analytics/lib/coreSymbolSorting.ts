import type { AnalyticsSymbolFeed, ZscoreOpportunityRecord } from '../api/schemas'
import { extractApprovedPositionSummary } from './positionSummary'

export const coreSortPresets = [
  { key: 'manual', label: 'Manual' },
  { key: 'held', label: 'Held' },
  { key: 'value', label: 'Most Traded' },
  { key: 'up', label: 'Up %' },
  { key: 'down', label: 'Down %' },
  { key: 'tight', label: 'Tight' },
  { key: 'wide', label: 'Wide' },
  { key: 'recent', label: 'Recent' },
] as const

export type CoreSortIntent = (typeof coreSortPresets)[number]['key']

type RankCoreSymbolsArgs = {
  baseOrder: string[]
  latestBySymbol: Record<string, AnalyticsSymbolFeed['current_snapshot'] | undefined>
  latestZscoreBySymbol: Record<string, ZscoreOpportunityRecord | undefined>
  intent: CoreSortIntent
}

export function rankCoreSymbols({
  baseOrder,
  latestBySymbol,
  latestZscoreBySymbol,
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
      latestZscoreBySymbol,
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
  latestZscoreBySymbol,
  intent,
}: {
  left: string
  right: string
  latestBySymbol: Record<string, AnalyticsSymbolFeed['current_snapshot'] | undefined>
  latestZscoreBySymbol: Record<string, ZscoreOpportunityRecord | undefined>
  intent: Exclude<CoreSortIntent, 'manual'>
}) {
  if (intent === 'held') {
    const leftQuantity = resolveAvailableQuantity(latestBySymbol[left], latestZscoreBySymbol[left])
    const rightQuantity = resolveAvailableQuantity(latestBySymbol[right], latestZscoreBySymbol[right])
    const leftHasInventory = leftQuantity > 0 ? 1 : 0
    const rightHasInventory = rightQuantity > 0 ? 1 : 0

    if (leftHasInventory !== rightHasInventory) {
      return rightHasInventory - leftHasInventory
    }

    return rightQuantity - leftQuantity
  }

  if (intent === 'up') {
    return compareNumbersDesc(
      latestBySymbol[left]?.daily_change_percent,
      latestBySymbol[right]?.daily_change_percent,
    )
  }

  if (intent === 'down') {
    return compareNumbersAsc(
      latestBySymbol[left]?.daily_change_percent,
      latestBySymbol[right]?.daily_change_percent,
    )
  }

  if (intent === 'tight') {
    return compareNumbersAsc(latestBySymbol[left]?.spread_bps, latestBySymbol[right]?.spread_bps)
  }

  if (intent === 'recent') {
    return compareTimestampsDesc(latestBySymbol[left]?.captured_at, latestBySymbol[right]?.captured_at)
  }

  if (intent === 'value') {
    return compareNumbersDesc(latestBySymbol[left]?.traded_value, latestBySymbol[right]?.traded_value)
  }

  return compareNumbersDesc(latestBySymbol[left]?.spread_bps, latestBySymbol[right]?.spread_bps)
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
