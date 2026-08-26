import type { AnalyticsSymbolFeed, DailyClosingRecord, ZscoreOpportunityRecord } from '../api/schemas'
import { getBogotaDateKey, isBogotaTradingSessionInstant, isColombiaBusinessDateKey } from './colombiaBusinessCalendar'

export function isCleanAnalyticsCapture(value: string | Date) {
  return isBogotaTradingSessionInstant(value)
}

export function sanitizeAnalyticsSymbolFeed(feed: AnalyticsSymbolFeed) {
  const cleanSnapshots = buildCleanSnapshotTimeline(feed)
  const targetTradingDate = resolveOverviewTradingDate()
  if (!targetTradingDate) {
    return null
  }
  const eligibleSnapshots = cleanSnapshots.filter((snapshot) => {
    const snapshotTradingDate = resolveSnapshotTradingDate(snapshot)
    return snapshotTradingDate === targetTradingDate
  })

  const currentSnapshot = eligibleSnapshots[eligibleSnapshots.length - 1]

  if (!currentSnapshot) {
    return null
  }

  const currentSnapshotKey = currentSnapshot.symbol_captured_at ?? `${currentSnapshot.symbol}-${currentSnapshot.captured_at}`
  const currentIndex = eligibleSnapshots.findIndex((snapshot) => {
    const snapshotKey = snapshot.symbol_captured_at ?? `${snapshot.symbol}-${snapshot.captured_at}`
    return snapshotKey === currentSnapshotKey
  })
  const previousSnapshot = currentIndex > 0 ? eligibleSnapshots[currentIndex - 1] : null

  return {
    ...feed,
    current_snapshot: currentSnapshot,
    previous_snapshot: previousSnapshot,
    snapshots: eligibleSnapshots,
  }
}

export function filterZscoreOpportunityRecords(records: ZscoreOpportunityRecord[]) {
  return records.filter((record) => isCleanAnalyticsCapture(record.captured_at))
}

export function filterDailyClosingRecords(records: DailyClosingRecord[]) {
  return records.filter((record) => {
    const capturedAt = record.source_captured_at ?? `${record.trading_date}T15:00:00-05:00`
    return isColombiaBusinessDateKey(record.trading_date) && isCleanAnalyticsCapture(capturedAt)
  })
}

function buildCleanSnapshotTimeline(feed: AnalyticsSymbolFeed) {
  const uniqueSnapshots = new Map<string, AnalyticsSymbolFeed['current_snapshot']>()

  for (const snapshot of [feed.current_snapshot, feed.previous_snapshot, ...feed.snapshots]) {
    if (!snapshot || !isCleanAnalyticsCapture(snapshot.captured_at)) {
      continue
    }

    const key =
      typeof snapshot.symbol_captured_at === 'string'
        ? snapshot.symbol_captured_at
        : `${snapshot.symbol}-${snapshot.captured_at}`
    uniqueSnapshots.set(key, snapshot)
  }

  return [...uniqueSnapshots.values()].sort(
    (left, right) => new Date(left.captured_at).getTime() - new Date(right.captured_at).getTime(),
  )
}

function resolveSnapshotTradingDate(snapshot: AnalyticsSymbolFeed['current_snapshot']) {
  if (typeof snapshot.trading_date === 'string' && snapshot.trading_date.trim().length > 0) {
    return snapshot.trading_date
  }

  return getBogotaDateKey(snapshot.captured_at)
}

function resolveOverviewTradingDate(reference = new Date()) {
  const bogotaDate = getBogotaDateKey(reference)
  if (!bogotaDate) {
    return null
  }

  if (!isColombiaBusinessDateKey(bogotaDate) || getBogotaSecondsFromMidnight(reference) < 8 * 60 * 60 + 30 * 60) {
    return findPreviousBusinessDateKey(bogotaDate)
  }

  return bogotaDate
}

function findPreviousBusinessDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))

  do {
    date.setUTCDate(date.getUTCDate() - 1)
  } while (!isColombiaBusinessDateKey(toDateKey(date)))

  return toDateKey(date)
}

function getBogotaSecondsFromMidnight(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return Number.NaN
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const hour = Number(parts.find((part) => part.type === 'hour')?.value)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value)
  const second = Number(parts.find((part) => part.type === 'second')?.value)

  if ([hour, minute, second].some((part) => Number.isNaN(part))) {
    return Number.NaN
  }

  return hour * 60 * 60 + minute * 60 + second
}

function toDateKey(date: Date) {
  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${date.getUTCDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}
