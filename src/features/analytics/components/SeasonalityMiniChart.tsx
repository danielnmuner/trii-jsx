import { useEffect, useMemo, useState } from 'react'
import type { SeasonalityProfile } from '../api/schemas'

type SeasonalityMiniChartProps = {
  profile?: SeasonalityProfile
  capturedAt?: string | null
}

const weekdayOrder = ['1', '2', '3', '4', '5'] as const

const weekdayMeta: Record<(typeof weekdayOrder)[number], { short: string; label: string }> = {
  '1': { short: 'M', label: 'Monday' },
  '2': { short: 'T', label: 'Tuesday' },
  '3': { short: 'W', label: 'Wednesday' },
  '4': { short: 'T', label: 'Thursday' },
  '5': { short: 'F', label: 'Friday' },
}

export function SeasonalityMiniChart({ profile, capturedAt }: SeasonalityMiniChartProps) {
  const weeklyProfile = profile?.weekly_profile ?? {}
  const availableDays = useMemo(
    () =>
      weekdayOrder.filter((weekday) => {
        const hours = weeklyProfile[weekday]?.hours ?? {}
        return Object.keys(hours).length > 0
      }),
    [weeklyProfile],
  )

  const defaultDay = useMemo(() => {
    const snapshotWeekday = resolveWeekdayKey(capturedAt)
    if (snapshotWeekday && availableDays.includes(snapshotWeekday)) {
      return snapshotWeekday
    }
    return availableDays[0]
  }, [availableDays, capturedAt])

  const [activeDay, setActiveDay] = useState<(typeof weekdayOrder)[number] | undefined>(defaultDay)

  useEffect(() => {
    if (!defaultDay) {
      setActiveDay(undefined)
      return
    }

    setActiveDay((currentValue) => (currentValue && availableDays.some((value) => value === currentValue) ? currentValue : defaultDay))
  }, [availableDays, defaultDay])

  if (!profile || availableDays.length === 0 || !activeDay) {
    return (
      <section className="overview-tape__item overview-tape__item--seasonality" aria-label="Seasonality profile">
        <div className="overview-seasonality__topline">
          <div className="overview-seasonality__titleBlock">
            <span className="overview-tape__label">Seasonality</span>
            <span className="overview-seasonality__metricLabel">Accumulated Volume</span>
          </div>
        </div>
        <div className="overview-seasonality__empty">No weekly profile</div>
      </section>
    )
  }

  const activeProfile = weeklyProfile[activeDay]
  const allHourKeys = collectAllHourKeys(profile)
  const bucketKeys = buildContinuousBucketKeys(allHourKeys, profile?.bucket_granularity_minutes ?? 30)
  const activeHours = activeProfile?.hours ?? {}
  const buckets = bucketKeys.map((time) => ({
    time,
    accumulatedVolume: sanitizeNumber(activeHours[time]?.accumulated_volume),
  }))

  const totalDeltaSamples = bucketKeys.reduce((sum, time) => sum + sanitizeNumber(activeHours[time]?.delta_samples), 0)
  const maxAccumulatedVolume = Math.max(...buckets.map((bucket) => bucket.accumulatedVolume), 0)

  return (
    <section className="overview-tape__item overview-tape__item--seasonality" aria-label="Seasonality profile">
      <div className="overview-seasonality__topline">
        <div className="overview-seasonality__titleBlock">
          <span className="overview-tape__label">Seasonality</span>
          <span className="overview-seasonality__metricLabel">Accumulated Volume</span>
        </div>
        <div className="overview-seasonality__activeMeta">
          <span className="overview-seasonality__active-day">{weekdayMeta[activeDay].label}</span>
          <span className="overview-seasonality__active-samples">{new Intl.NumberFormat('en-US').format(totalDeltaSamples)}</span>
        </div>
      </div>

      <div
        className="overview-seasonality__chart"
        aria-label="Accumulated volume seasonality histogram"
        style={{ gridTemplateColumns: `repeat(${Math.max(buckets.length, 1)}, minmax(0, 1fr))` }}
      >
        {buckets.map((bucket) => {
          const height = maxAccumulatedVolume <= 0 ? 8 : Math.max((bucket.accumulatedVolume / maxAccumulatedVolume) * 100, 8)
          return (
            <div key={bucket.time} className="overview-seasonality__bar-group">
              <div
                className="overview-seasonality__bar-track"
                title={`${bucket.time} · Vol ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(bucket.accumulatedVolume)}`}
                aria-label={`${bucket.time} accumulated volume ${bucket.accumulatedVolume}`}
              >
                <div className="overview-seasonality__bar" style={{ height: `${height}%` }} />
              </div>
            </div>
          )
        })}
      </div>

      <div className="overview-seasonality__weekday-switch" role="tablist" aria-label="Seasonality weekday">
        {weekdayOrder.map((weekday) => {
          const isEnabled = availableDays.includes(weekday)
          const isActive = weekday === activeDay
          const meta = weekdayMeta[weekday]
          return (
            <button
              key={weekday}
              type="button"
              className={[
                'overview-seasonality__weekday',
                isActive ? 'overview-seasonality__weekday--active' : '',
                isEnabled ? 'overview-seasonality__weekday--enabled' : 'overview-seasonality__weekday--disabled',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setActiveDay(weekday)}
              disabled={!isEnabled}
              aria-pressed={isActive}
              title={meta.label}
            >
              {meta.short}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function sanitizeNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 0
  }
  return value
}

function resolveWeekdayKey(value: string | null | undefined): (typeof weekdayOrder)[number] | undefined {
  if (!value) {
    return undefined
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }

  const weekdayLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    weekday: 'long',
  })
    .format(date)
    .toLowerCase()

  switch (weekdayLabel) {
    case 'monday':
      return '1'
    case 'tuesday':
      return '2'
    case 'wednesday':
      return '3'
    case 'thursday':
      return '4'
    case 'friday':
      return '5'
    default:
      return undefined
  }
}

function collectAllHourKeys(profile?: SeasonalityProfile) {
  const hourKeys = new Set<string>()

  Object.values(profile?.weekly_profile ?? {}).forEach((weekday) => {
    Object.keys(weekday.hours ?? {}).forEach((key) => hourKeys.add(key))
  })

  Object.keys(profile?.pending_day?.hours ?? {}).forEach((key) => hourKeys.add(key))

  return [...hourKeys].sort((left, right) => left.localeCompare(right))
}

function buildContinuousBucketKeys(hourKeys: string[], granularityMinutes: number) {
  if (hourKeys.length === 0) {
    return []
  }

  const timestamps = hourKeys
    .map(parseHourKeyToMinutes)
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right)

  if (timestamps.length === 0) {
    return []
  }

  const step = granularityMinutes > 0 ? granularityMinutes : 30
  const buckets: string[] = []

  for (let minute = timestamps[0]; minute <= timestamps[timestamps.length - 1]; minute += step) {
    buckets.push(formatMinutesToHourKey(minute))
  }

  return buckets
}

function parseHourKeyToMinutes(value: string) {
  const [hourRaw, minuteRaw] = value.split(':')
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null
  }

  return hour * 60 + minute
}

function formatMinutesToHourKey(totalMinutes: number) {
  const hour = Math.floor(totalMinutes / 60)
  const minute = totalMinutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}
