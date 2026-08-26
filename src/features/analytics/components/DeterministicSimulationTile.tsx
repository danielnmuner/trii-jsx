import { useEffect, useId, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { SnapshotRecord } from '../api/schemas'
import type { OrderPositionSummary } from '../lib/orderPosition'
import {
  ALERT_AMOUNT_THRESHOLD,
  buildFallbackScenario,
  computeNetProfit,
  DEFAULT_INVESTMENT_CAP,
  DEFAULT_PROFIT_TARGET,
  INVESTMENT_CAPS,
  PROFIT_TARGETS,
  resolveAskMaximum,
  resolveAskMinimum,
  resolveChartAskLossCutoff,
  resolveDefaultBidPrice,
  resolveRoundedPrice,
  solveOptimizedTargetScenario,
  STOP_LOSS_TARGETS,
  type SimulationScenario,
} from '../lib/deterministicSimulation'
import { formatInteger } from '../lib/formatters'

type DeterministicSimulationTileProps = {
  snapshot: SnapshotRecord
  positionSummary?: OrderPositionSummary
}

type PriceScenario = {
  price: number
  deltaValue: number
  deltaPct: number
}

type LossReviewScenario = {
  quantity: number
  levels: Array<{
    lossTarget: number
    askPrice: number
  }>
}

type ChartGeometry = {
  points: Array<{ x: number; y: number; key: string; scenario: PriceScenario }>
  linePath: string
  areaPath: string
  gridLines: number[]
}

type LossOverlay = {
  linePath: string
  areaPath: string
  pointKeys: Set<string>
}

type ChartSummary = {
  primary: string
  secondary: string
  tertiary?: string
}

const POINT_COUNT = 16
const CHART_WIDTH = 420
const CHART_HEIGHT = 110
const CHART_PADDING = { top: 22, right: 28, bottom: 18, left: 24 }

export function DeterministicSimulationTile({ snapshot, positionSummary }: DeterministicSimulationTileProps) {
  const bidGradientId = useId().replace(/:/g, '')
  const askGradientId = `${bidGradientId}-ask`
  const bidScenarios = useMemo(() => buildBidScenarios(snapshot), [snapshot])
  const askScenarios = useMemo(() => buildAskScenarios(snapshot), [snapshot])

  const defaultBidPrice = useMemo(() => resolveDefaultBidPrice(snapshot), [snapshot])
  const defaultBidIndex = useMemo(() => getDefaultIndex(bidScenarios, defaultBidPrice), [bidScenarios, defaultBidPrice])

  const [activeBidIndex, setActiveBidIndex] = useState(defaultBidIndex)
  const [hoveredAskIndex, setHoveredAskIndex] = useState<number | null>(null)
  const [activeTargetProfit, setActiveTargetProfit] = useState<(typeof PROFIT_TARGETS)[number]>(DEFAULT_PROFIT_TARGET)
  const [activeInvestmentCap, setActiveInvestmentCap] = useState<(typeof INVESTMENT_CAPS)[number]>(DEFAULT_INVESTMENT_CAP)

  useEffect(() => {
    setActiveBidIndex(defaultBidIndex)
  }, [defaultBidIndex, snapshot.symbol_captured_at, snapshot.captured_at, snapshot.best_bid_price, snapshot.microprice])

  const safeBidIndex = Math.min(activeBidIndex, Math.max(0, bidScenarios.length - 1))
  const activeBid = bidScenarios[safeBidIndex]

  const bidChart = buildChartGeometry(bidScenarios)
  const askChart = buildChartGeometry(askScenarios)
  const activeBidPoint = bidChart.points[safeBidIndex]

  const optimizedScenarios = useMemo(
    () =>
      PROFIT_TARGETS.map((targetProfit) =>
        solveOptimizedTargetScenario({
          bidPrice: activeBid?.price ?? 0,
          targetProfit,
          askMin: resolveAskMinimum(snapshot),
          askMax: resolveAskMaximum(snapshot),
          maxInvestmentAmount: activeInvestmentCap,
        }) ??
        buildFallbackScenario({
          bidPrice: activeBid?.price ?? 0,
          targetProfit,
          askMin: resolveAskMinimum(snapshot),
          askMax: resolveAskMaximum(snapshot),
          maxInvestmentAmount: activeInvestmentCap,
        }),
      ).filter((scenario): scenario is SimulationScenario => scenario !== null),
    [activeBid?.price, activeInvestmentCap, snapshot.best_bid_price, snapshot.microprice, snapshot.high_price],
  )

  const activeTargetScenario =
    optimizedScenarios.find((scenario) => scenario.targetProfit === activeTargetProfit) ?? optimizedScenarios[0]

  const lossReviewScenario = useMemo(
    () =>
      buildLossReviewScenario({
        quantity: activeTargetScenario?.quantity ?? 0,
        bidPrice: activeBid?.price ?? 0,
      }),
    [activeBid?.price, activeTargetScenario?.quantity],
  )

  useEffect(() => {
    if (!optimizedScenarios.some((scenario) => scenario.targetProfit === activeTargetProfit)) {
      setActiveTargetProfit(DEFAULT_PROFIT_TARGET)
    }
  }, [activeTargetProfit, optimizedScenarios])

  const optimizedAskIndex = getDefaultIndex(askScenarios, activeTargetScenario?.askPrice ?? 0)
  const safeAskIndex =
    hoveredAskIndex === null ? optimizedAskIndex : Math.min(hoveredAskIndex, Math.max(0, askScenarios.length - 1))
  const activeAsk = askScenarios[safeAskIndex]
  const activeAskPoint = askChart.points[safeAskIndex]

  if (!activeBid || !activeAsk || !activeBidPoint || !activeAskPoint || !activeTargetScenario) {
    return null
  }

  return (
    <section className="overview-tape__item overview-tape__item--market overview-tape__item--simulation" aria-label="Deterministic trade simulation">
      <div className="overview-sim">
        <PositionSnapshotCard snapshot={snapshot} positionSummary={positionSummary} />

        <div className="overview-sim__sectionDivider" aria-hidden="true" />

        <PriceChart
          title="Bid"
          axisStart={formatInteger(bidScenarios[0]?.price)}
          axisEnd={formatInteger(bidScenarios[bidScenarios.length - 1]?.price)}
          geometry={bidChart}
          activeIndex={safeBidIndex}
          activePoint={activeBidPoint}
          activeScenario={activeBid}
          gradientId={bidGradientId}
          onSelect={setActiveBidIndex}
          referencePrice={resolveRoundedPrice(snapshot.last_price)}
          summary={{
            primary: formatInteger(activeBid.price),
            secondary: `${formatSignedInteger(activeBid.deltaValue)} (${formatSignedPercent(activeBid.deltaPct)})`,
          }}
          hoverSelectable={false}
          focusSelectable={false}
          headerControls={
            <div className="overview-sim__targetSwitch" role="tablist" aria-label="Simulation target profit">
              {PROFIT_TARGETS.map((targetProfit) => {
                const isActive = targetProfit === activeTargetProfit
                return (
                  <button
                    key={targetProfit}
                    type="button"
                    className={['overview-sim__targetButton', isActive ? 'overview-sim__targetButton--active' : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setActiveTargetProfit(targetProfit)}
                    aria-pressed={isActive}
                  >
                    {formatCompactTarget(targetProfit)}
                  </button>
                )
              })}
            </div>
          }
        />

        <div className="overview-sim__sectionDivider" aria-hidden="true" />

        <PriceChart
          title="Ask"
          axisStart={formatInteger(askScenarios[0]?.price)}
          axisEnd={formatInteger(askScenarios[askScenarios.length - 1]?.price)}
          geometry={askChart}
          activeIndex={safeAskIndex}
          activePoint={activeAskPoint}
          activeScenario={activeAsk}
          gradientId={askGradientId}
          onSelect={setHoveredAskIndex}
          onLeave={() => setHoveredAskIndex(null)}
          clickSelectable={false}
          referencePrice={resolveRoundedPrice(snapshot.last_price)}
          optimizedAskPrice={activeTargetScenario.askPrice}
          lossCutoffPrice={resolveChartAskLossCutoff(activeBid.price)}
          summary={{
            primary: `${formatInteger(activeTargetScenario.askPrice)} (${formatInteger(activeTargetScenario.quantity)})`,
            secondary: `${formatSignedInteger(activeTargetScenario.askPrice - activeBid.price)} (${formatSignedPercent(
              activeBid.price > 0 ? ((activeTargetScenario.askPrice - activeBid.price) / activeBid.price) * 100 : 0,
            )})`,
          }}
          headerControls={
            <div className="overview-sim__targetSwitch" role="tablist" aria-label="Simulation max buy">
              {INVESTMENT_CAPS.map((investmentCap) => {
                const isActive = investmentCap === activeInvestmentCap
                return (
                  <button
                    key={investmentCap}
                    type="button"
                    className={['overview-sim__targetButton', isActive ? 'overview-sim__targetButton--active' : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setActiveInvestmentCap(investmentCap)}
                    aria-pressed={isActive}
                  >
                    {formatCompactAmount(investmentCap)}
                  </button>
                )
              })}
            </div>
          }
        />

        <div className="overview-sim__sectionDivider" aria-hidden="true" />

        <div className="overview-sim__tableCard">
          <table className="overview-sim__table overview-sim__table--detail">
            <tbody>
              {renderScenarioRows(activeTargetScenario)}
            </tbody>
          </table>
        </div>

        <div className="overview-sim__sectionDivider" aria-hidden="true" />

        <div className="overview-sim__tableCard">
          <table className="overview-sim__table overview-sim__table--detail">
            <tbody>
              {renderLossReviewRows(lossReviewScenario)}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function PositionSnapshotCard({
  snapshot,
  positionSummary,
}: {
  snapshot: SnapshotRecord
  positionSummary?: OrderPositionSummary
}) {
  const quantity = positionSummary?.availableQuantity ?? 0
  const weightedAveragePrice = positionSummary?.weightedAveragePrice ?? null
  const deltaValue = positionSummary?.deltaValue ?? null
  const deltaPct = positionSummary?.deltaPct ?? null
  const tone = deltaValue === null ? 'neutral' : deltaValue >= 0 ? 'positive' : 'negative'

  return (
    <div className="overview-sim__positionCard">
      <div className="overview-sim__positionHead">
        <span className="overview-sim__metricLabel">Inventory</span>
      </div>

      <div className="overview-sim__positionBody">
        <div className="overview-sim__positionBlock">
          <span className="overview-sim__positionCaption">Average</span>
          <strong className={`overview-sim__positionValue overview-sim__positionValue--${tone}`}>
            {weightedAveragePrice === null ? '--' : formatInteger(weightedAveragePrice)}
          </strong>
        </div>

        <div className="overview-sim__positionBlock">
          <span className="overview-sim__positionCaption">Qty</span>
          <strong className="overview-sim__positionValue">{formatInteger(quantity)}</strong>
        </div>
      </div>

      <div className={`overview-sim__positionDelta overview-sim__positionDelta--${tone}`}>
        {deltaValue === null || deltaPct === null ? '--' : `${formatSignedInteger(deltaValue)} (${formatSignedPercent(deltaPct)})`}
      </div>

      <div className="overview-sim__positionSub">vs last {formatInteger(snapshot.last_price)}</div>
    </div>
  )
}

function PriceChart({
  title,
  axisStart,
  axisEnd,
  geometry,
  activeIndex,
  activePoint,
  activeScenario,
  gradientId,
  onSelect,
  onLeave,
  headerControls,
  referencePrice,
  optimizedAskPrice,
  lossCutoffPrice,
  summary,
  clickSelectable = true,
  hoverSelectable = true,
  focusSelectable = true,
}: {
  title: string
  axisStart: string
  axisEnd: string
  geometry: ChartGeometry
  activeIndex: number
  activePoint: { x: number; y: number; key: string; scenario: PriceScenario }
  activeScenario: PriceScenario
  gradientId: string
  onSelect: (index: number) => void
  onLeave?: () => void
  headerControls?: ReactNode
  referencePrice?: number
  optimizedAskPrice?: number
  lossCutoffPrice?: number
  summary: ChartSummary
  clickSelectable?: boolean
  hoverSelectable?: boolean
  focusSelectable?: boolean
}) {
  const referenceX = useMemo(() => resolveReferenceX(geometry.points, referencePrice), [geometry.points, referencePrice])
  const optimizedAskX = useMemo(() => resolveReferenceX(geometry.points, optimizedAskPrice), [geometry.points, optimizedAskPrice])
  const lossOverlay = useMemo(() => buildLossOverlay(geometry.points, lossCutoffPrice), [geometry.points, lossCutoffPrice])

  return (
    <div className="overview-sim__chartCard" onMouseLeave={onLeave}>
      <div className="overview-sim__chartMeta">
        <div className="overview-sim__chartLead">
          <span className="overview-sim__chartLabel">{title}</span>
          {headerControls}
        </div>
        <div className="overview-sim__activeMeta">
          <strong className="overview-sim__activeMetaPrice">{summary.primary}</strong>
          <span className="overview-sim__activeMetaDelta">{summary.secondary}</span>
          {summary.tertiary ? <span className="overview-sim__activeMetaDelta">{summary.tertiary}</span> : null}
        </div>
      </div>

      <svg className="overview-sim__chart" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label={`${title} scenario chart`}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(0, 255, 255, 0.22)" />
            <stop offset="100%" stopColor="rgba(0, 255, 255, 0.02)" />
          </linearGradient>
        </defs>

        {geometry.gridLines.map((yValue) => (
          <line key={yValue} x1={CHART_PADDING.left} x2={CHART_WIDTH - CHART_PADDING.right} y1={yValue} y2={yValue} className="overview-sim__gridLine" />
        ))}

        {referenceX !== null ? (
          <g>
            <line
              x1={referenceX}
              x2={referenceX}
              y1={CHART_PADDING.top}
              y2={CHART_HEIGHT - CHART_PADDING.bottom}
              className="overview-sim__referenceLine"
            />
            <text className="overview-sim__referenceLabel" x={referenceX} y={CHART_PADDING.top - 6} textAnchor="middle">
              LP
            </text>
          </g>
        ) : null}

        {optimizedAskX !== null ? (
          <g>
            <line
              x1={optimizedAskX}
              x2={optimizedAskX}
              y1={CHART_PADDING.top}
              y2={CHART_HEIGHT - CHART_PADDING.bottom}
              className="overview-sim__optimizedLine"
            />
            <text className="overview-sim__optimizedLabel" x={optimizedAskX} y={CHART_PADDING.top - 6} textAnchor="middle">
              OPT
            </text>
          </g>
        ) : null}

        <path d={geometry.areaPath} className="overview-sim__areaPath" fill={`url(#${gradientId})`} />
        <path d={geometry.linePath} className="overview-sim__linePath" />

        {lossOverlay ? (
          <>
            <path d={lossOverlay.areaPath} className="overview-sim__lossAreaPath" />
            <path d={lossOverlay.linePath} className="overview-sim__lossLinePath" />
          </>
        ) : null}

        {geometry.points.map((point, index) => (
          <g key={point.key}>
            <line
              x1={point.x}
              x2={point.x}
              y1={CHART_PADDING.top}
              y2={CHART_HEIGHT - CHART_PADDING.bottom}
              className={`overview-sim__guideLine${index === activeIndex ? ' is-active' : ''}`}
            />
            <circle
              cx={point.x}
              cy={point.y}
              r={index === activeIndex ? 4.4 : 3.5}
              className={`overview-sim__point${lossOverlay?.pointKeys.has(point.key) ? ' is-loss' : ''}${index === activeIndex ? ' is-active' : ''}`}
            />
            <circle
              cx={point.x}
              cy={point.y}
              r={12}
              className="overview-sim__pointHit"
              tabIndex={0}
              aria-label={`${title} ${formatInteger(point.scenario.price)}`}
              onMouseEnter={hoverSelectable ? () => onSelect(index) : undefined}
              onFocus={focusSelectable ? () => onSelect(index) : undefined}
              onClick={clickSelectable ? () => onSelect(index) : undefined}
            />
          </g>
        ))}

        <g transform={`translate(${activePoint.x}, ${activePoint.y - 8})`}>
          <text className="overview-sim__activePrice" textAnchor="middle">
            {formatInteger(activeScenario.price)}
          </text>
        </g>

        <text className="overview-sim__axisValue" x={CHART_PADDING.left} y={CHART_HEIGHT - 4} textAnchor="start">
          {axisStart}
        </text>
        <text className="overview-sim__axisValue" x={CHART_WIDTH - CHART_PADDING.right} y={CHART_HEIGHT - 4} textAnchor="end">
          {axisEnd}
        </text>
      </svg>
    </div>
  )
}

function SimulationDetailRow({
  label,
  value,
  tone,
  caption,
}: {
  label: string
  value: string
  tone: 'positive' | 'negative' | 'neutral'
  caption?: string
}) {
  return (
    <tr>
      <th>{label}</th>
      <td className={`overview-sim__cell overview-sim__cell--${tone}`}>
        <span>{value}</span>
        {caption ? <small className={`overview-sim__cellCaption overview-sim__cellCaption--${tone}`}>{caption}</small> : null}
      </td>
    </tr>
  )
}

function buildBidScenarios(snapshot: SnapshotRecord) {
  const availablePrices = resolveAvailableRoundedPrices(snapshot)
  if (availablePrices.length === 0) {
    return []
  }

  const lowPrice = resolveRoundedPrice(snapshot.low_price) || Math.min(...availablePrices)
  const microPrice = resolveRoundedPrice(snapshot.microprice)
  const bestBidPrice = resolveRoundedPrice(snapshot.best_bid_price)
  const highBid = Math.max(
    microPrice,
    bestBidPrice,
    resolveRoundedPrice(snapshot.mid_price),
    resolveRoundedPrice(snapshot.last_price),
    ...availablePrices,
  )
  const defaultBid = bestBidPrice || Math.max(microPrice, bestBidPrice, resolveRoundedPrice(snapshot.last_price))

  if (!lowPrice || !highBid || highBid < lowPrice) {
    return []
  }

  const prices = buildPriceRange(lowPrice, highBid, POINT_COUNT, [defaultBid]).sort((left, right) => right - left)
  return prices.map((price) => ({
    price,
    deltaValue: highBid - price,
    deltaPct: lowPrice > 0 ? ((highBid - price) / lowPrice) * 100 : 0,
  }))
}

function buildAskScenarios(snapshot: SnapshotRecord) {
  const bestAskPrice = resolveRoundedPrice(snapshot.best_ask_price)
  const lowAsk = resolveAskMinimum(snapshot)
  const highAsk = resolveAskMaximum(snapshot)

  if (!lowAsk || !highAsk || highAsk < lowAsk) {
    return []
  }

  const prices = buildPriceRange(lowAsk, highAsk, POINT_COUNT, [bestAskPrice || lowAsk])
  return prices.map((price) => ({
    price,
    deltaValue: price - lowAsk,
    deltaPct: lowAsk > 0 ? ((price - lowAsk) / lowAsk) * 100 : 0,
  }))
}

function buildPriceRange(start: number, end: number, count: number, anchors: number[] = []) {
  if (count <= 1 || start === end) {
    return [start]
  }

  const values = new Set<number>(anchors.filter((value) => value >= start && value <= end))
  for (let index = 0; index < count; index += 1) {
    const ratio = index / (count - 1)
    values.add(Math.round(start + (end - start) * ratio))
  }

  const sorted = Array.from(values).sort((left, right) => left - right)
  if (sorted.length >= count) {
    return sorted
  }

  for (let value = start; value <= end && sorted.length < count; value += 1) {
    values.add(value)
  }

  return Array.from(values).sort((left, right) => left - right)
}
function buildChartGeometry(scenarios: PriceScenario[]): ChartGeometry {
  if (scenarios.length === 0) {
    return {
      points: [],
      linePath: '',
      areaPath: '',
      gridLines: [CHART_PADDING.top, (CHART_PADDING.top + (CHART_HEIGHT - CHART_PADDING.bottom)) / 2, CHART_HEIGHT - CHART_PADDING.bottom],
    }
  }

  const chartTop = CHART_PADDING.top
  const chartBottom = CHART_HEIGHT - CHART_PADDING.bottom
  const chartLeft = CHART_PADDING.left
  const chartRight = CHART_WIDTH - CHART_PADDING.right
  const minPrice = Math.min(...scenarios.map((scenario) => scenario.price))
  const maxPrice = Math.max(...scenarios.map((scenario) => scenario.price))
  const priceRange = Math.max(1, maxPrice - minPrice)

  const points = scenarios.map((scenario, index) => {
    const x = scenarios.length === 1 ? (chartLeft + chartRight) / 2 : chartLeft + (index / (scenarios.length - 1)) * (chartRight - chartLeft)
    const y = chartTop + ((maxPrice - scenario.price) / priceRange) * (chartBottom - chartTop)
    return {
      x,
      y,
      key: `${scenario.price}-${index}`,
      scenario,
    }
  })

  const linePath = buildSmoothPath(points.map((point) => ({ x: point.x, y: point.y })))
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${chartBottom} L ${points[0].x.toFixed(2)} ${chartBottom} Z`
  const gridLines = [chartTop, (chartTop + chartBottom) / 2, chartBottom]

  return {
    points,
    linePath,
    areaPath,
    gridLines,
  }
}

function buildSmoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) {
    return ''
  }

  if (points.length === 1) {
    return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
  }

  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`

  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index]
    const p1 = points[index]
    const p2 = points[index + 1]
    const p3 = points[index + 2] ?? p2

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }

  return path
}

function buildLossReviewScenario({
  quantity,
  bidPrice,
}: {
  quantity: number
  bidPrice: number
}): LossReviewScenario {
  const safeQuantity = Math.max(0, Math.round(quantity))

  return {
    quantity: safeQuantity,
    levels: STOP_LOSS_TARGETS.map((lossTarget) => ({
      lossTarget,
      askPrice: solveStopLossAskPrice({
        quantity: safeQuantity,
        bidPrice,
        lossTarget,
      }),
    })),
  }
}

function solveStopLossAskPrice({
  quantity,
  bidPrice,
  lossTarget,
}: {
  quantity: number
  bidPrice: number
  lossTarget: number
}) {
  if (quantity <= 0 || bidPrice <= 0 || lossTarget <= 0) {
    return 0
  }

  const targetProfit = -lossTarget
  const profitAtBid = computeNetProfit(quantity, bidPrice, bidPrice)

  if (profitAtBid <= targetProfit) {
    return bidPrice
  }

  let low = 0
  let high = bidPrice

  while (low < high) {
    const midpoint = Math.ceil((low + high) / 2)
    if (computeNetProfit(quantity, bidPrice, midpoint) <= targetProfit) {
      low = midpoint
    } else {
      high = midpoint - 1
    }
  }

  return Math.max(0, Math.round(low))
}

function resolveAvailableRoundedPrices(snapshot: SnapshotRecord) {
  return [
    snapshot.low_price,
    snapshot.best_bid_price,
    snapshot.mid_price,
    snapshot.microprice,
    snapshot.last_price,
    snapshot.best_ask_price,
    snapshot.high_price,
  ]
    .map((value) => resolveRoundedPrice(value))
    .filter((value) => value > 0)
}

function getDefaultIndex(scenarios: PriceScenario[], targetPrice: number) {
  if (!scenarios.length) {
    return 0
  }

  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY
  scenarios.forEach((scenario, index) => {
    const distance = Math.abs(scenario.price - targetPrice)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  })

  return bestIndex
}

function resolveReferenceX(
  points: Array<{ x: number; y: number; key: string; scenario: PriceScenario }>,
  referencePrice: number | undefined,
) {
  if (!points.length || !referencePrice) {
    return null
  }

  if (points.length === 1) {
    return points[0].x
  }

  const exactPoint = points.find((point) => point.scenario.price === referencePrice)
  if (exactPoint) {
    return exactPoint.x
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index]
    const right = points[index + 1]
    const minPrice = Math.min(left.scenario.price, right.scenario.price)
    const maxPrice = Math.max(left.scenario.price, right.scenario.price)

    if (referencePrice >= minPrice && referencePrice <= maxPrice) {
      const span = right.scenario.price - left.scenario.price
      if (span === 0) {
        return left.x
      }

      const ratio = (referencePrice - left.scenario.price) / span
      return left.x + ratio * (right.x - left.x)
    }
  }

  if (referencePrice < Math.min(...points.map((point) => point.scenario.price))) {
    return points[0].x
  }

  return points[points.length - 1].x
}

function buildLossOverlay(
  points: Array<{ x: number; y: number; key: string; scenario: PriceScenario }>,
  lossCutoffPrice: number | undefined,
): LossOverlay | null {
  if (!points.length || !lossCutoffPrice) {
    return null
  }

  const lossPoints = points.filter((point) => point.scenario.price < lossCutoffPrice)
  if (lossPoints.length === 0) {
    return null
  }

  const overlayPoints = lossPoints.map((point) => ({ x: point.x, y: point.y }))
  const lastLossIndex = points.findIndex((point) => point.key === lossPoints[lossPoints.length - 1]?.key)
  const nextPoint = lastLossIndex >= 0 ? points[lastLossIndex + 1] : undefined
  const lastLossPoint = lossPoints[lossPoints.length - 1]

  if (lastLossPoint && nextPoint && lastLossPoint.scenario.price < lossCutoffPrice && nextPoint.scenario.price > lossCutoffPrice) {
    const span = nextPoint.scenario.price - lastLossPoint.scenario.price
    if (span > 0) {
      const ratio = (lossCutoffPrice - lastLossPoint.scenario.price) / span
      overlayPoints.push({
        x: lastLossPoint.x + ratio * (nextPoint.x - lastLossPoint.x),
        y: lastLossPoint.y + ratio * (nextPoint.y - lastLossPoint.y),
      })
    }
  }

  if (overlayPoints.length < 2) {
    return null
  }

  const chartBottom = CHART_HEIGHT - CHART_PADDING.bottom
  const linePath = buildSmoothPath(overlayPoints)
  const areaPath = `${linePath} L ${overlayPoints[overlayPoints.length - 1].x.toFixed(2)} ${chartBottom} L ${overlayPoints[0].x.toFixed(2)} ${chartBottom} Z`

  return {
    linePath,
    areaPath,
    pointKeys: new Set(lossPoints.map((point) => point.key)),
  }
}

function formatSignedInteger(value: number) {
  const prefix = value >= 0 ? '+' : ''
  return `${prefix}${formatInteger(value)}`
}

function formatSignedPercent(value: number) {
  const prefix = value >= 0 ? '+' : ''
  return `${prefix}${value.toFixed(2)}%`
}

function formatCompactTarget(value: number) {
  return `+${Math.round(value / 1_000)}K`
}

function formatCompactAmount(value: number) {
  return `${Math.round(value / 1_000_000)}M`
}

function renderScenarioRows(scenario: SimulationScenario) {
  const exceedsAlertThreshold = scenario.buyTotal > ALERT_AMOUNT_THRESHOLD

  return [
    <SimulationDetailRow key="qty" label="Qty" value={formatInteger(scenario.quantity)} tone={scenario.isFeasible ? 'positive' : 'negative'} />,
    <SimulationDetailRow
      key="buy"
      label="Buy"
      value={formatInteger(scenario.buyTotal)}
      tone={scenario.buyTotal > ALERT_AMOUNT_THRESHOLD ? 'negative' : 'neutral'}
    />,
    <SimulationDetailRow
      key="sell"
      label="Sell"
      value={formatInteger(scenario.sellTotal)}
      tone={exceedsAlertThreshold ? 'negative' : 'neutral'}
    />,
    <SimulationDetailRow
      key="comm"
      label="Comm"
      value={formatInteger(scenario.commissionCost)}
      tone={exceedsAlertThreshold ? 'negative' : 'neutral'}
    />,
    <SimulationDetailRow
      key="total"
      label="Total"
      value={formatInteger(scenario.totalResult)}
      tone={exceedsAlertThreshold || scenario.totalResult < 0 ? 'negative' : 'positive'}
    />,
  ]
}

function renderLossReviewRows(scenario: LossReviewScenario) {
  return [
    <SimulationDetailRow key="qty" label="Qty" value={formatInteger(scenario.quantity)} tone={scenario.quantity > 0 ? 'positive' : 'negative'} />,
    ...scenario.levels.map((level) => (
      <SimulationDetailRow
        key={level.lossTarget}
        label={`-${Math.round(level.lossTarget / 1_000)}K`}
        value={formatInteger(level.askPrice)}
        tone="negative"
      />
    )),
  ]
}
