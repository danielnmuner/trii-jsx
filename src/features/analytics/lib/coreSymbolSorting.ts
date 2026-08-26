import type { AnalyticsSymbolFeed, ZscoreOpportunityRecord } from '../api/schemas'
import { computeStatZScore } from './formatters'
import { extractApprovedPositionSummary } from './positionSummary'

export const coreSortPresets = [
  { key: 'manual', label: 'Manual' },
  { key: 'held', label: 'Held' },
  { key: 'value', label: 'Most Traded' },
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
  intent: CoreSortIntent
}

export function rankCoreSymbols({
  baseOrder,
  latestBySymbol,
  intent,
}: RankCoreSymbolsArgs) {
  if (intent === 'manual' || intent === 'held') {
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
