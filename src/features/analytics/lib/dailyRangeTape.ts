import type { DailyClosingRecord, SnapshotRecord } from '../api/schemas'
import { isHistoricMonitoringGapDate } from './analyticsDataPolicy'

/** Most recent valid trading days used for the historic distribution. */
export const DAILY_RANGE_WINDOW_DAYS = 60
/** Below this many valid days the distribution is not shown. */
export const DAILY_RANGE_MIN_DAYS = 20

export type DailyRangeSectionKey = 'below2' | 'below1' | 'above1' | 'above2' | 'above3'

export type DailyRangeSection = {
  key: DailyRangeSectionKey
  label: string
  from: number
  to: number
  /** Historic days whose range fell inside this section. */
  dayCount: number
}

export type DailyRangeStats = {
  sampleSize: number
  /** Reference "typical day": the median daily range. Sections and ticks are anchored on it. */
  median: number
  mean: number
  /** Sample standard deviation of the daily range. */
  stdDev: number
  /** Tape end: median + 3σ (or the largest historic range when bigger). */
  scaleMax: number
  sections: DailyRangeSection[]
  ticks: Array<{ value: number; label: string }>
}

export type DailyRangeStatsResult =
  | { status: 'ready'; stats: DailyRangeStats }
  | { status: 'insufficient'; sampleSize: number }

export type TodayRange = {
  range: number
  offHigh: number
  offLow: number
  /** last − previous close; null when the previous close is unknown. */
  change: number | null
}

/**
 * Distribution of the daily range (high − low, in COP) over the most recent valid trading days
 * strictly before `beforeTradingDate`. Days with missing or inconsistent prices, monitoring gaps
 * and duplicates are discarded so they never count as a zero range.
 */
export function computeDailyRangeStats(
  records: DailyClosingRecord[],
  beforeTradingDate: string | null,
): DailyRangeStatsResult {
  const rangeByDate = new Map<string, number>()

  for (const record of records) {
    const tradingDate = record.trading_date
    const high = record.high_price
    const low = record.low_price

    if (!tradingDate || (beforeTradingDate && tradingDate >= beforeTradingDate)) {
      continue
    }
    if (isHistoricMonitoringGapDate(tradingDate)) {
      continue
    }
    if (!isFiniteNumber(high) || !isFiniteNumber(low) || high < low || low <= 0) {
      continue
    }

    rangeByDate.set(tradingDate, high - low)
  }

  const ranges = [...rangeByDate.entries()]
    .sort(([left], [right]) => (left < right ? 1 : left > right ? -1 : 0))
    .slice(0, DAILY_RANGE_WINDOW_DAYS)
    .map(([, range]) => range)

  if (ranges.length < DAILY_RANGE_MIN_DAYS) {
    return { status: 'insufficient', sampleSize: ranges.length }
  }

  const mean = ranges.reduce((sum, value) => sum + value, 0) / ranges.length
  const variance = ranges.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (ranges.length - 1)
  const stdDev = Math.sqrt(variance)
  const median = computeMedian(ranges)
  const scaleMax = Math.max(median + 3 * stdDev, ...ranges)

  // Daily ranges are right-skewed (a few very large days pull the mean up), so the median is the
  // reference for a typical day and the σ steps are measured from it.
  const bounds = [
    Math.max(0, median - stdDev),
    median,
    median + stdDev,
    median + 2 * stdDev,
  ]
  const sectionDefinitions: Array<{ key: DailyRangeSectionKey; label: string; from: number; to: number }> = [
    { key: 'below2', label: '< −1σ', from: 0, to: bounds[0] },
    { key: 'below1', label: '−1σ to med', from: bounds[0], to: bounds[1] },
    { key: 'above1', label: 'med to +1σ', from: bounds[1], to: bounds[2] },
    { key: 'above2', label: '+1σ to +2σ', from: bounds[2], to: bounds[3] },
    { key: 'above3', label: '> +2σ', from: bounds[3], to: scaleMax },
  ]
  const sections = sectionDefinitions
    .filter((section) => section.to > section.from)
    .map((section, index, list) => ({
      ...section,
      dayCount: ranges.filter((range) =>
        index === list.length - 1 ? range >= section.from : range >= section.from && range < section.to,
      ).length,
    }))

  const ticks = [
    { value: median - stdDev, label: '−1σ' },
    { value: median, label: 'med' },
    { value: median + stdDev, label: '+1σ' },
    { value: median + 2 * stdDev, label: '+2σ' },
    { value: median + 3 * stdDev, label: '+3σ' },
  ].filter((tick) => tick.value > 0)

  return {
    status: 'ready',
    stats: { sampleSize: ranges.length, median, mean, stdDev, scaleMax, sections, ticks },
  }
}

function computeMedian(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

/**
 * Today's range so far from the latest snapshot. The last price widens the range when it is
 * outside the reported high/low (the indicators can lag the last trade by a few seconds).
 */
export function computeTodayRange(snapshot: SnapshotRecord): TodayRange | null {
  const last = snapshot.last_price
  const reportedHigh = snapshot.high_price
  const reportedLow = snapshot.low_price

  if (!isFiniteNumber(last) || !isFiniteNumber(reportedHigh) || !isFiniteNumber(reportedLow) || reportedHigh < reportedLow) {
    return null
  }

  const high = Math.max(reportedHigh, last)
  const low = Math.min(reportedLow, last)
  const previousClose = snapshot.previous_close

  return {
    range: high - low,
    offHigh: high - last,
    offLow: last - low,
    change: isFiniteNumber(previousClose) ? last - previousClose : null,
  }
}

/** Position on the tape, 0–1, clamped; `overflow` is true when the range is past the tape end. */
export function resolveTapePosition(value: number, stats: DailyRangeStats) {
  const ratio = stats.scaleMax > 0 ? value / stats.scaleMax : 0
  return { ratio: Math.min(1, Math.max(0, ratio)), overflow: ratio > 1 }
}

export function resolveRangeSection(value: number, stats: DailyRangeStats) {
  return (
    stats.sections.find((section, index) =>
      index === stats.sections.length - 1 ? value >= section.from : value >= section.from && value < section.to,
    ) ?? stats.sections[0]
  )
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
