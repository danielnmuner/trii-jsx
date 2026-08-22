import type { HistoricStat, SnapshotRecord } from '../api/schemas'

export function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a'
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value)
}

export function formatInteger(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a'
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a'
  }

  return `$ ${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(value)}`
}

export function formatMillions(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a'
  }

  return `${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value / 1_000_000)} M`
}

export function formatMillionsWhenLarge(
  value: number | null | undefined,
  options: { digits?: number; fallback?: 'integer' | 'number' } = {},
) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a'
  }

  if (Math.abs(value) < 1_000_000) {
    return options.fallback === 'number' ? formatNumber(value) : formatInteger(value)
  }

  return formatMillions(value, options.digits ?? 2)
}

export function formatPercentFromWhole(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a'
  }

  return `${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value / 100)}%`
}

export function formatPercentFromFraction(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a'
  }

  return `${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value * 100)}%`
}

export function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return 'n/a'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(date)
}

export function stringifyUnknown(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return JSON.stringify(value)
}

export function normalizeRows(records: Array<Record<string, unknown>>) {
  return records.map((record) =>
    Object.fromEntries(
      Object.entries(record).map(([key, value]) => [
        key,
        key === 'daily_change_percent' && typeof value === 'number' ? formatPercentFromWhole(value) : stringifyUnknown(value),
      ]),
    ),
  )
}

export function computeStatZScore(stat?: HistoricStat) {
  if (!stat?.stddev || stat.stddev === 0 || stat.latest_value === null || stat.latest_value === undefined) {
    return null
  }
  if (stat.mean === null || stat.mean === undefined) {
    return null
  }
  if ((stat.sample_count ?? 0) < 2) {
    return null
  }
  return (stat.latest_value - stat.mean) / stat.stddev
}

export function computeCumulativeVwap(snapshot: SnapshotRecord) {
  if (!snapshot.traded_value || !snapshot.traded_volume || snapshot.traded_volume === 0) {
    return null
  }
  return snapshot.traded_value / snapshot.traded_volume
}

export function formatMetricValue(metricKey: string, value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a'
  }

  if (metricKey === 'daily_change_percent') {
    return formatPercentFromWhole(value)
  }
  if (metricKey === 'spread_bps') {
    return `${formatNumber(value)} bps`
  }
  if (metricKey === 'spread') {
    return formatInteger(value)
  }
  if (metricKey === 'traded_value') {
    return formatMillions(value, 1)
  }
  if (metricKey === 'traded_volume' || metricKey === 'value_rate') {
    return formatMillionsWhenLarge(value, {
      digits: 2,
      fallback: metricKey === 'value_rate' ? 'number' : 'integer',
    })
  }
  if (metricKey === 'vwap_cumulative' || metricKey === 'mid_price' || metricKey === 'microprice') {
    return formatNumber(value)
  }
  if (metricKey === 'best_bid_price' || metricKey === 'best_ask_price' || metricKey === 'high_price' || metricKey === 'low_price') {
    return formatCurrency(value)
  }
  if (metricKey === 'last_price') {
    return formatNumber(value)
  }
  if (metricKey === 'obi_l1' || metricKey === 'obi_top_5' || metricKey === 'book_pressure_ratio') {
    return formatNumber(value)
  }

  return formatNumber(value)
}

export function formatBandDelta(metricKey: string, current: number | null | undefined, previous: number | null | undefined) {
  if (
    current === null ||
    current === undefined ||
    previous === null ||
    previous === undefined ||
    Number.isNaN(current) ||
    Number.isNaN(previous)
  ) {
    return 'No prior point'
  }

  const delta = current - previous

  if (metricKey === 'spread_bps') {
    return `${delta >= 0 ? '+' : ''}${formatNumber(delta)} bps`
  }

  return `${delta >= 0 ? '+' : ''}${formatNumber(delta)}`
}

export function formatBandDeltaWithRelative(
  metricKey: string,
  current: number | null | undefined,
  previous: number | null | undefined,
) {
  if (
    current === null ||
    current === undefined ||
    previous === null ||
    previous === undefined ||
    Number.isNaN(current) ||
    Number.isNaN(previous)
  ) {
    return 'No prior point'
  }

  const absolute = formatBandDelta(metricKey, current, previous)
  if (previous === 0) {
    return absolute
  }

  const relative = ((current - previous) / previous) * 100
  return `${absolute} (${relative >= 0 ? '+' : ''}${formatNumber(relative)}%)`
}

export function formatSampleCount(value: number | null | undefined) {
  if (!value || Number.isNaN(value) || value <= 0) {
    return ''
  }

  return formatInteger(value)
}
