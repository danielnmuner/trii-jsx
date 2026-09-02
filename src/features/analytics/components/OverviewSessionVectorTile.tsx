import { useMemo, useState, type MouseEvent } from 'react'
import type { SessionVectorManifest, SessionVectorSegment } from '../api/schemas'
import { formatInteger, formatNumber } from '../lib/formatters'

type SessionVectorWindow = {
  symbol: string
  tradingDate: string
  samplingSeconds: number
  samplesPerSegment: number
  segmentCount: number
  manifest: SessionVectorManifest | null
  segments: SessionVectorSegment[]
}

type OverviewSessionVectorTileProps = {
  dataset?: SessionVectorWindow | null
  referenceHigh?: number | null
  referenceLow?: number | null
}

type SessionVectorPoint = {
  index: number
  lastPrice: number | null
  microPrice: number | null
  midPrice: number | null
  vwap: number | null
}

type SessionVectorHoverRow = {
  expression: string
  detail: string
  values: string
  tone: 'positive' | 'negative' | 'neutral'
}

type SessionVectorHoverPoint = SessionVectorPoint & {
  x: number
  lastY: number | null
  midY: number | null
  vwapY: number | null
}

type SessionGuide = {
  key: string
  y: number
  tone: 'high' | 'mid' | 'low'
}

const WINDOW_OPTIONS = [8, 4, 2, 1] as const

const CHART_WIDTH = 260
const CHART_HEIGHT = 94
const CHART_PADDING = { top: 8, right: 6, bottom: 10, left: 4 }

export function OverviewSessionVectorTile({
  dataset,
  referenceHigh = null,
  referenceLow = null,
}: OverviewSessionVectorTileProps) {
  const [windowHours, setWindowHours] = useState<(typeof WINDOW_OPTIONS)[number]>(8)
  const chart = useMemo(
    () => buildSessionVectorChart(dataset, windowHours, referenceHigh, referenceLow),
    [dataset, windowHours, referenceHigh, referenceLow],
  )
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const hoveredPoint =
    hoveredIndex === null ? null : chart.interactivePoints.find((point) => point.index === hoveredIndex) ?? null

  if (!dataset || chart.points.length === 0) {
    return (
      <section className="overview-tape__item overview-tape__item--session-vector" aria-label="Session vector">
        <div className="overview-session__header">
          <div className="overview-session__titleBlock">
            <span className="overview-tape__label">Session Vector</span>
          </div>
        </div>
        <div className="overview-session__chartWrap">
          <div className="overview-session__windowTabs" role="tablist" aria-label="Session vector window">
            {WINDOW_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={`overview-session__windowTab${windowHours === option ? ' overview-session__windowTab--active' : ''}`}
                onClick={() => {
                  setWindowHours(option)
                  setHoveredIndex(null)
                }}
                aria-pressed={windowHours === option}
              >
                {option}H
              </button>
            ))}
          </div>
          <div className="overview-session__empty">No intraday vector</div>
        </div>
      </section>
    )
  }

  return (
    <section className="overview-tape__item overview-tape__item--session-vector" aria-label="Session vector">
      <div className="overview-session__header">
        <div className="overview-session__titleBlock">
          <span className="overview-tape__label">Session Vector</span>
        </div>
      </div>

      <div className="overview-session__chartWrap">
        <div className="overview-session__windowTabs" role="tablist" aria-label="Session vector window">
          {WINDOW_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`overview-session__windowTab${windowHours === option ? ' overview-session__windowTab--active' : ''}`}
              onClick={() => {
                setWindowHours(option)
                setHoveredIndex(null)
              }}
              aria-pressed={windowHours === option}
            >
              {option}H
            </button>
          ))}
        </div>
        <div className="overview-session__legend" aria-label="Session vector legend">
          <span className="overview-session__legendItem">
            <span className="overview-session__legendSwatch overview-session__legendSwatch--last" />
            <span>Last</span>
          </span>
          <span className="overview-session__legendItem">
            <span className="overview-session__legendSwatch overview-session__legendSwatch--mid" />
            <span>Mid</span>
          </span>
          <span className="overview-session__legendItem">
            <span className="overview-session__legendSwatch overview-session__legendSwatch--vwap" />
            <span>VWAP</span>
          </span>
        </div>
        <svg
          className="overview-session__chart"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          onMouseMove={(event) => handleChartPointerMove(event, chart.interactivePoints, setHoveredIndex)}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {chart.guides.map((guide) => (
            <line
              key={guide.key}
              x1={CHART_PADDING.left}
              y1={guide.y}
              x2={CHART_WIDTH - CHART_PADDING.right}
              y2={guide.y}
              className={`overview-session__guide overview-session__guide--${guide.tone}`}
            />
          ))}
          {hoveredPoint ? (
            <>
              <line
                x1={hoveredPoint.x}
                y1={CHART_PADDING.top}
                x2={hoveredPoint.x}
                y2={CHART_HEIGHT - CHART_PADDING.bottom}
                className="overview-session__focusLine"
              />
              {hoveredPoint.vwapY !== null ? (
                <circle cx={hoveredPoint.x} cy={hoveredPoint.vwapY} r="1.05" className="overview-session__focusDot overview-session__focusDot--vwap" />
              ) : null}
              {hoveredPoint.midY !== null ? (
                <circle cx={hoveredPoint.x} cy={hoveredPoint.midY} r="1.08" className="overview-session__focusDot overview-session__focusDot--mid" />
              ) : null}
              {hoveredPoint.lastY !== null ? (
                <circle cx={hoveredPoint.x} cy={hoveredPoint.lastY} r="1.18" className="overview-session__focusDot overview-session__focusDot--last" />
              ) : null}
            </>
          ) : null}
          <path d={chart.vwapPath} className="overview-session__path overview-session__path--vwap" />
          <path d={chart.midPath} className="overview-session__path overview-session__path--mid" />
          <path d={chart.lastPath} className="overview-session__path overview-session__path--last" />
        </svg>
        {hoveredPoint ? (
          <div className="overview-session__hoverCard">
            <div className="overview-session__hoverMeta">
              <span>{formatSessionClock(dataset?.manifest?.session_start, dataset?.tradingDate, hoveredPoint.index, dataset?.samplingSeconds ?? 30)}</span>
              <span>#{formatNumber(hoveredPoint.index, 0)}</span>
            </div>
            {buildHoverRows(hoveredPoint).map((row) => (
              <div key={row.expression} className="overview-session__hoverRow">
                <span className={`overview-session__hoverExpression overview-session__hoverExpression--${row.tone}`}>{row.expression}</span>
                <span className={`overview-session__hoverDetail overview-session__hoverDetail--${row.tone}`}>{row.detail}</span>
                <span className="overview-session__hoverValues">{row.values}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="overview-session__footer">
        <span>{chart.startLabel}</span>
        <span>{formatNumber(chart.pointCount, 0)} pts</span>
        <span>{chart.endLabel}</span>
      </div>
    </section>
  )
}

function buildSessionVectorChart(
  dataset?: SessionVectorWindow | null,
  windowHours = 8,
  referenceHigh: number | null = null,
  referenceLow: number | null = null,
) {
  const points = flattenSessionVectorPoints(dataset)
  const visiblePoints = selectWindowPoints(points, dataset, windowHours)
  const numericValues = visiblePoints.flatMap((point) =>
    [point.lastPrice, point.midPrice, point.vwap].filter((value): value is number => typeof value === 'number' && !Number.isNaN(value)),
  )
  const guideLowValue =
    numericValues.length > 0
      ? Math.min(...numericValues)
      : typeof referenceLow === 'number' && !Number.isNaN(referenceLow)
        ? referenceLow
        : 0
  const guideHighValue =
    numericValues.length > 0
      ? Math.max(...numericValues)
      : typeof referenceHigh === 'number' && !Number.isNaN(referenceHigh)
        ? referenceHigh
        : 1
  const rawDomain = guideHighValue - guideLowValue
  const domainPadding = rawDomain > 0 ? rawDomain * 0.18 : Math.max(Math.abs(guideHighValue || 1) * 0.008, 1)
  const minValue = guideLowValue - domainPadding
  const maxValue = guideHighValue + domainPadding
  const domain = maxValue - minValue || 1
  const innerWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right
  const innerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom
  const firstIndex = visiblePoints[0]?.index ?? 0
  const lastPosition = Math.max(visiblePoints.length - 1, 0)

  const pointOrderByIndex = new Map<number, number>()
  visiblePoints.forEach((point, order) => {
    pointOrderByIndex.set(point.index, order)
  })

  const scaleX = (pointIndex: number) => {
    const order = pointOrderByIndex.get(pointIndex) ?? 0
    return CHART_PADDING.left + (lastPosition <= 0 ? 0 : (order / lastPosition) * innerWidth)
  }
  const scaleY = (value: number) =>
    CHART_PADDING.top + innerHeight - ((value - minValue) / domain) * innerHeight

  const guides = buildGuides(scaleY, guideLowValue, guideHighValue)
  const interactivePoints = visiblePoints.map((point) => ({
    ...point,
    x: scaleX(point.index),
    lastY: typeof point.lastPrice === 'number' ? scaleY(point.lastPrice) : null,
    midY: typeof point.midPrice === 'number' ? scaleY(point.midPrice) : null,
    vwapY: typeof point.vwap === 'number' ? scaleY(point.vwap) : null,
  }))

  return {
    points: visiblePoints,
    interactivePoints,
    pointCount: visiblePoints.length,
    lastPath: buildLinePath(visiblePoints, scaleX, scaleY, (point) => point.lastPrice),
    midPath: buildLinePath(visiblePoints, scaleX, scaleY, (point) => point.midPrice),
    vwapPath: buildLinePath(visiblePoints, scaleX, scaleY, (point) => point.vwap),
    guides,
    latestLastPrice: findLatest(visiblePoints, 'lastPrice'),
    latestMidPrice: findLatest(visiblePoints, 'midPrice'),
    latestVwap: findLatest(visiblePoints, 'vwap'),
    startLabel: formatSessionClock(
      dataset?.manifest?.session_start,
      dataset?.tradingDate,
      firstIndex,
      dataset?.samplingSeconds ?? 30,
    ),
    endLabel: formatSessionClock(
      dataset?.manifest?.session_start,
      dataset?.tradingDate,
      visiblePoints.at(-1)?.index ?? firstIndex,
      dataset?.samplingSeconds ?? 30,
    ),
  }
}

function selectWindowPoints(
  points: SessionVectorPoint[],
  dataset?: SessionVectorWindow | null,
  windowHours = 8,
) {
  if (points.length === 0) {
    return points
  }

  const latestIndex = points.at(-1)?.index ?? 0
  const samplesPerHour = Math.max(1, Math.round(3600 / (dataset?.samplingSeconds ?? 30)))
  const windowSamples = windowHours * samplesPerHour
  const firstVisibleIndex = Math.max(0, latestIndex - windowSamples + 1)
  const visiblePoints = points.filter((point) => point.index >= firstVisibleIndex)
  return visiblePoints.length > 0 ? visiblePoints : points
}

function buildGuides(
  scaleY: (value: number) => number,
  minValue: number,
  maxValue: number,
): SessionGuide[] {
  const fallbackMid = minValue + (maxValue - minValue) / 2
  return [
    { key: 'high', y: scaleY(maxValue), tone: 'high' },
    { key: 'mid', y: scaleY(fallbackMid), tone: 'mid' },
    { key: 'low', y: scaleY(minValue), tone: 'low' },
  ]
}

function flattenSessionVectorPoints(dataset?: SessionVectorWindow | null) {
  if (!dataset) {
    return [] as SessionVectorPoint[]
  }

  const byIndex = new Map<number, SessionVectorPoint>()

  for (const segment of dataset.segments) {
    const seriesLength = Math.max(
      segment.microprice_series.length,
      segment.last_price_series.length,
      segment.mid_price_series.length,
      segment.vwap_series.length,
    )

    for (let offset = 0; offset < seriesLength; offset += 1) {
      const index = segment.from_sample_index + offset
      byIndex.set(index, {
        index,
        lastPrice: sanitizeNumber(segment.last_price_series[offset]),
        microPrice: sanitizeNumber(segment.microprice_series[offset]),
        midPrice: sanitizeNumber(segment.mid_price_series[offset]),
        vwap: sanitizeNumber(segment.vwap_series[offset]),
      })
    }
  }

  return [...byIndex.values()].sort((left, right) => left.index - right.index)
}

function handleChartPointerMove(
  event: MouseEvent<SVGSVGElement>,
  points: SessionVectorHoverPoint[],
  setHoveredIndex: (value: number | null) => void,
) {
  if (points.length === 0) {
    setHoveredIndex(null)
    return
  }

  const bounds = event.currentTarget.getBoundingClientRect()
  if (bounds.width <= 0) {
    setHoveredIndex(null)
    return
  }

  const relativeX = ((event.clientX - bounds.left) / bounds.width) * CHART_WIDTH
  let nearestPoint = points[0]
  let nearestDistance = Math.abs(points[0].x - relativeX)

  for (let index = 1; index < points.length; index += 1) {
    const candidate = points[index]
    const distance = Math.abs(candidate.x - relativeX)
    if (distance < nearestDistance) {
      nearestPoint = candidate
      nearestDistance = distance
    }
  }

  setHoveredIndex(nearestPoint.index)
}

function buildHoverRows(point: SessionVectorPoint): SessionVectorHoverRow[] {
  return [
    buildHoverRow('Micro', point.microPrice, 'Mid', point.midPrice),
    buildHoverRow('Mid', point.midPrice, 'VWAP', point.vwap),
    buildHoverRow('Last', point.lastPrice, 'VWAP', point.vwap),
  ]
}

function buildHoverRow(
  leftLabel: string,
  leftValue: number | null,
  rightLabel: string,
  rightValue: number | null,
): SessionVectorHoverRow {
  const comparison = buildComparisonContext(leftValue, rightValue)
  const relation = deriveComparisonRelation(comparison)
  const tone = deriveComparisonTone(comparison?.delta ?? null)

  return {
    expression: `${leftLabel.toUpperCase()} ${relation} ${rightLabel.toUpperCase()}`,
    detail: formatComparisonDelta(comparison),
    values: `${formatInteger(leftValue)} ${relation} ${formatInteger(rightValue)}`,
    tone,
  }
}

function buildComparisonContext(left: number | null, right: number | null) {
  if (left === null || right === null) {
    return null
  }

  return {
    delta: left - right,
    percent: right === 0 ? null : ((left - right) / right) * 100,
  }
}

function deriveComparisonRelation(comparison: { delta: number } | null) {
  if (!comparison) {
    return '~'
  }

  if (comparison.delta > 0) {
    return '>'
  }

  if (comparison.delta < 0) {
    return '<'
  }

  return '='
}

function deriveComparisonTone(delta: number | null) {
  if (delta === null || Number.isNaN(delta)) {
    return 'neutral' as const
  }

  if (delta > 0) {
    return 'positive' as const
  }

  if (delta < 0) {
    return 'negative' as const
  }

  return 'neutral' as const
}

function formatComparisonDelta(comparison: { delta: number; percent: number | null } | null) {
  if (!comparison) {
    return 'n/a'
  }

  const absolute = `${comparison.delta >= 0 ? '+' : '-'}${formatInteger(Math.abs(comparison.delta))}`
  if (comparison.percent === null || Number.isNaN(comparison.percent)) {
    return absolute
  }

  return `${absolute} (${comparison.percent >= 0 ? '+' : '-'}${formatNumber(Math.abs(comparison.percent))}%)`
}

function buildLinePath(
  points: SessionVectorPoint[],
  scaleX: (pointIndex: number) => number,
  scaleY: (value: number) => number,
  accessor: (point: SessionVectorPoint) => number | null,
) {
  let currentPath = ''
  let needsMove = true

  for (const point of points) {
    const value = accessor(point)
    if (value === null) {
      needsMove = true
      continue
    }

    const command = needsMove || currentPath.length === 0 ? 'M' : 'L'
    currentPath += `${command}${scaleX(point.index).toFixed(2)} ${scaleY(value).toFixed(2)} `
    needsMove = false
  }

  return currentPath.trim()
}

function findLatest(points: SessionVectorPoint[], key: keyof Omit<SessionVectorPoint, 'index'>) {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = points[index][key]
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return value
    }
  }

  return null
}

function sanitizeNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null
  }

  return value
}

function formatSessionClock(
  sessionStart: string | null | undefined,
  tradingDate: string | undefined,
  pointIndex: number,
  samplingSeconds: number,
) {
  const start = resolveSessionBoundary(sessionStart, tradingDate, '08:30:00-05:00')
  if (!start || Number.isNaN(start.getTime())) {
    return 'n/a'
  }

  const date = new Date(start.getTime() + pointIndex * samplingSeconds * 1000)

  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function resolveSessionBoundary(
  value: string | null | undefined,
  tradingDate: string | undefined,
  fallbackTime: string,
) {
  if (value) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) {
      return date
    }
  }

  if (!tradingDate) {
    return null
  }

  const date = new Date(`${tradingDate}T${fallbackTime}`)
  return Number.isNaN(date.getTime()) ? null : date
}
