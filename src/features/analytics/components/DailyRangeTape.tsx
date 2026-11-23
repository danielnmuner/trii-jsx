import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { SnapshotRecord } from '../api/schemas'
import { getBogotaDateKey } from '../lib/colombiaBusinessCalendar'
import { useCachedDailyClosingWindow } from '../lib/dailyClosingLiquidity'
import {
  computeDailyRangeStats,
  computeTodayRange,
  resolveTapePosition,
  type DailyRangeStats,
  type TodayRange,
} from '../lib/dailyRangeTape'
import { formatNumber } from '../lib/formatters'

type DailyRangeTapeProps = {
  symbol: string
  snapshot: SnapshotRecord
}

/**
 * Header measuring tape: today's high − low laid over the historic distribution of daily ranges (COP).
 * Purely informational. Reads only data already loaded: the cached daily-closing window and the
 * latest snapshot, so it adds no API calls.
 */
export function DailyRangeTape({ symbol, snapshot }: DailyRangeTapeProps) {
  const cachedWindow = useCachedDailyClosingWindow(symbol)
  const todayKey = getBogotaDateKey(snapshot.captured_at)
  const statsResult = useMemo(
    () => (cachedWindow ? computeDailyRangeStats(cachedWindow.records, todayKey) : null),
    [cachedWindow, todayKey],
  )
  const today = computeTodayRange(snapshot)

  if (!statsResult) {
    return <RangeNotice reason="loading history" />
  }
  if (statsResult.status === 'insufficient') {
    return <RangeNotice reason={`${statsResult.sampleSize} of 20 days needed`} />
  }
  if (!today) {
    return <RangeNotice reason="no prices today yet" />
  }

  return <RangeTape stats={statsResult.stats} today={today} />
}

function RangeTape({ stats, today }: { stats: DailyRangeStats; today: TodayRange }) {
  const todayPosition = resolveTapePosition(today.range, stats)
  // Today's range recolors the same σ sections from 0 up to high − low (no extra band). Its left
  // edge is the day's low and the recolored end its high, so the last price sits at its distance
  // from the low.
  const lastPosition = resolveTapePosition(today.offLow, stats)
  const pctOfMedian = stats.median > 0 ? (today.range / stats.median) * 100 : null
  const tapeRef = useRef<HTMLDivElement>(null)
  const tapeWidth = useElementWidth(tapeRef)
  // The last-price line crosses the σ label row: hide any σ label it would run through.
  const isSigmaClear = (tickValue: number) =>
    tapeWidth === 0 || Math.abs((tickValue / stats.scaleMax - lastPosition.ratio) * tapeWidth) > SIGMA_CLEARANCE_PX
  const markerAlign = lastPosition.ratio < 0.06 ? 'start' : lastPosition.ratio > 0.94 ? 'end' : 'center'
  const todayClip = `inset(0 ${((1 - todayPosition.ratio) * 100).toFixed(3)}% 0 0)`
  const renderSections = (variant: 'history' | 'today') =>
    stats.sections.map((item) => (
      <span
        key={`${variant}-${item.key}`}
        className={`range-tape__section range-tape__section--${variant}-${item.key}`}
        style={{
          left: `${(item.from / stats.scaleMax) * 100}%`,
          width: `${((item.to - item.from) / stats.scaleMax) * 100}%`,
        }}
      />
    ))

  return (
    <div className="overview-card__headlineVariation" aria-label="Daily range versus history">
      <span className="overview-card__headlineVariationIcon" aria-hidden="true" />
      <span className="overview-card__headlineVariationLabel">Range</span>
      <strong className="overview-card__headlineVariationValue">{cop(today.range)}</strong>
      {pctOfMedian !== null ? (
        <span className="overview-card__headlineVariationNote">{formatNumber(pctOfMedian, 0)}%</span>
      ) : null}

      <div className="range-tape" aria-hidden="true" ref={tapeRef}>
        <div className="range-tape__markerRow">
          <span
            className={`range-tape__markerValue range-tape__markerValue--${markerAlign}`}
            style={{ left: `${lastPosition.ratio * 100}%` }}
          >
            {cop(today.offLow)}
          </span>
        </div>
        <div className="range-tape__sigmas">
          {stats.ticks
            .filter((tick) => tick.label !== 'med')
            .map((tick) => (
              <span
                key={tick.label}
                className="range-tape__sigma"
                style={{ left: `${(tick.value / stats.scaleMax) * 100}%`, visibility: isSigmaClear(tick.value) ? undefined : 'hidden' }}
              >
                {tick.label}
              </span>
            ))}
        </div>
        <div className="range-tape__track">
          {renderSections('history')}
          <div className="range-tape__todayLayer" style={{ clipPath: todayClip }}>
            {renderSections('today')}
          </div>
          <span className="range-tape__lastLine" style={{ left: `${lastPosition.ratio * 100}%` }} />
          {todayPosition.overflow ? <span className="range-tape__overflow">›</span> : null}
        </div>
        <div className="range-tape__ticks">
          {stats.ticks.map((tick) => (
            <span
              key={tick.label}
              className={`range-tape__tick${tick.label === 'med' ? ' range-tape__tick--median' : ''}`}
              style={{ left: `${(tick.value / stats.scaleMax) * 100}%` }}
            >
              {cop(tick.value)}
            </span>
          ))}
        </div>
      </div>

      <span className="overview-card__headlineVariationLast">
        <span className="overview-card__headlineVariationLastDot" aria-hidden="true" />
        −{cop(today.offHigh)} hi · +{cop(today.offLow)} lo
      </span>
    </div>
  )
}

function RangeNotice({ reason }: { reason: string }) {
  return (
    <div className="overview-card__headlineVariation overview-card__headlineVariation--notice">
      <span className="overview-card__headlineVariationLabel">Range</span>
      <span className="overview-card__headlineVariationNote">{reason}</span>
    </div>
  )
}

/** Minimum horizontal gap (px) between the last-price line and a σ label before the label hides. */
const SIGMA_CLEARANCE_PX = 12

function useElementWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') {
      return
    }

    const update = () => setWidth(element.getBoundingClientRect().width)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return width
}

function cop(value: number) {
  return formatNumber(Math.round(value), 0)
}
