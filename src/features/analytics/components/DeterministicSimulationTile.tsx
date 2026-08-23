import { useEffect, useId, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { SnapshotRecord } from '../api/schemas'
import { formatInteger } from '../lib/formatters'

type DeterministicSimulationTileProps = {
  snapshot: SnapshotRecord
}

type PriceScenario = {
  price: number
  deltaValue: number
  deltaPct: number
}

type TableScenario = {
  targetProfit: number
  quantity: number
  buyTotal: number
  sellNet: number
  commissionCost: number
  buyOutOfRange: boolean
}

type LossScenario = {
  lossTarget: number
  triggerPrice: number
  deltaValue: number
  deltaPct: number
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

const MIN_INVESTMENT = 5_000_000
const MAX_INVESTMENT = 15_000_000
const PROFIT_TARGETS = [100_000, 200_000, 300_000] as const
const LOSS_TARGETS = [50_000, 100_000, 150_000] as const
const POINT_COUNT = 8
const CHART_WIDTH = 420
const CHART_HEIGHT = 110
const CHART_PADDING = { top: 22, right: 28, bottom: 18, left: 24 }

export function DeterministicSimulationTile({ snapshot }: DeterministicSimulationTileProps) {
  const bidGradientId = useId().replace(/:/g, '')
  const askGradientId = `${bidGradientId}-ask`
  const bidScenarios = useMemo(() => buildBidScenarios(snapshot), [snapshot])
  const askScenarios = useMemo(() => buildAskScenarios(snapshot), [snapshot])

  const defaultBidPrice = useMemo(
    () =>
      resolveRoundedPrice(snapshot.best_bid_price) ||
      Math.max(resolveRoundedPrice(snapshot.microprice), resolveRoundedPrice(snapshot.best_bid_price)),
    [snapshot.best_bid_price, snapshot.microprice],
  )
  const defaultAskPrice = useMemo(() => {
    const bestAskPrice = resolveRoundedPrice(snapshot.best_ask_price)
    return bestAskPrice || resolveRoundedPrice(snapshot.microprice)
  }, [snapshot.best_ask_price, snapshot.microprice])

  const defaultBidIndex = useMemo(() => getDefaultIndex(bidScenarios, defaultBidPrice), [bidScenarios, defaultBidPrice])
  const defaultAskIndex = useMemo(() => getDefaultIndex(askScenarios, defaultAskPrice), [askScenarios, defaultAskPrice])

  const [activeBidIndex, setActiveBidIndex] = useState(defaultBidIndex)
  const [activeAskIndex, setActiveAskIndex] = useState(defaultAskIndex)
  const [activeTargetProfit, setActiveTargetProfit] = useState<(typeof PROFIT_TARGETS)[number]>(PROFIT_TARGETS[0])

  useEffect(() => {
    setActiveBidIndex(defaultBidIndex)
  }, [defaultBidIndex, snapshot.symbol_captured_at, snapshot.captured_at, snapshot.best_bid_price, snapshot.microprice])

  useEffect(() => {
    setActiveAskIndex(defaultAskIndex)
  }, [defaultAskIndex, snapshot.symbol_captured_at, snapshot.captured_at, snapshot.best_ask_price, snapshot.microprice, snapshot.high_price])

  const safeBidIndex = Math.min(activeBidIndex, Math.max(0, bidScenarios.length - 1))
  const safeAskIndex = Math.min(activeAskIndex, Math.max(0, askScenarios.length - 1))
  const activeBid = bidScenarios[safeBidIndex]
  const activeAsk = askScenarios[safeAskIndex]

  const bidChart = buildChartGeometry(bidScenarios)
  const askChart = buildChartGeometry(askScenarios)
  const activeBidPoint = bidChart.points[safeBidIndex]
  const activeAskPoint = askChart.points[safeAskIndex]

  const tableScenarios = useMemo(
    () =>
      PROFIT_TARGETS.map((targetProfit) =>
        buildTableScenario({
          bidPrice: activeBid?.price ?? 0,
          askPrice: activeAsk?.price ?? 0,
          targetProfit,
        }),
      ),
    [activeAsk?.price, activeBid?.price],
  )

  const activeTargetScenario =
    tableScenarios.find((scenario) => scenario.targetProfit === activeTargetProfit) ?? tableScenarios[0]

  const lossScenarios = useMemo(
    () =>
      LOSS_TARGETS.map((lossTarget) =>
        buildLossScenario({
          bidPrice: activeBid?.price ?? 0,
          quantity: activeTargetScenario?.quantity ?? 0,
          lossTarget,
        }),
      ).filter((scenario): scenario is LossScenario => scenario !== null),
    [activeBid?.price, activeTargetScenario?.quantity],
  )

  useEffect(() => {
    if (!tableScenarios.some((scenario) => scenario.targetProfit === activeTargetProfit)) {
      setActiveTargetProfit(PROFIT_TARGETS[0])
    }
  }, [activeTargetProfit, tableScenarios])

  if (!activeBid || !activeAsk || !activeBidPoint || !activeAskPoint || !activeTargetScenario) {
    return null
  }

  return (
    <section className="overview-tape__item overview-tape__item--market overview-tape__item--simulation" aria-label="Deterministic trade simulation">
      <div className="overview-sim">
        <div className="overview-sim__charts">
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

          <div className="overview-sim__chartDivider" aria-hidden="true" />

          <PriceChart
            title="Ask"
            axisStart={formatInteger(askScenarios[0]?.price)}
            axisEnd={formatInteger(askScenarios[askScenarios.length - 1]?.price)}
            geometry={askChart}
            activeIndex={safeAskIndex}
            activePoint={activeAskPoint}
            activeScenario={activeAsk}
            gradientId={askGradientId}
            onSelect={setActiveAskIndex}
            referencePrice={resolveRoundedPrice(snapshot.last_price)}
            lossCutoffPrice={activeBid.price}
          />
        </div>

        <div className="overview-sim__tableDivider" aria-hidden="true" />

        <div className="overview-sim__tableShell">
          <div className="overview-sim__tables">
            <table className="overview-sim__table overview-sim__table--detail">
              <tbody>
                <SimulationDetailRow
                  label="Qty"
                  value={formatInteger(activeTargetScenario.quantity)}
                  tone={activeTargetScenario.buyOutOfRange ? 'negative' : 'positive'}
                />
                <SimulationDetailRow
                  label="Buy"
                  value={formatInteger(activeTargetScenario.buyTotal)}
                  tone={activeTargetScenario.buyOutOfRange ? 'negative' : 'neutral'}
                />
                <SimulationDetailRow
                  label="Sell"
                  value={formatInteger(activeTargetScenario.sellNet)}
                  tone="neutral"
                />
                <SimulationDetailRow
                  label="Comm"
                  value={formatInteger(activeTargetScenario.commissionCost)}
                  tone="neutral"
                />
              </tbody>
            </table>

            <table className="overview-sim__table overview-sim__table--detail">
              <tbody>
                {lossScenarios.map((scenario) => (
                  <SimulationDetailRow
                    key={scenario.lossTarget}
                    label={formatCompactLossTarget(scenario.lossTarget)}
                    value={formatInteger(scenario.triggerPrice)}
                    tone="negative"
                    caption={`${formatSignedInteger(scenario.deltaValue)} | ${formatSignedPercent(scenario.deltaPct)}`}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
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
  headerControls,
  referencePrice,
  lossCutoffPrice,
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
  headerControls?: ReactNode
  referencePrice?: number
  lossCutoffPrice?: number
}) {
  const referenceX = useMemo(() => resolveReferenceX(geometry.points, referencePrice), [geometry.points, referencePrice])
  const lossOverlay = useMemo(() => buildLossOverlay(geometry.points, lossCutoffPrice), [geometry.points, lossCutoffPrice])

  return (
    <div className="overview-sim__chartCard">
      <div className="overview-sim__chartMeta">
        <div className="overview-sim__chartLead">
          <span className="overview-sim__chartLabel">{title}</span>
          {headerControls}
        </div>
        <div className="overview-sim__activeMeta">
          <strong className="overview-sim__activeMetaPrice">{formatInteger(activeScenario.price)}</strong>
          <span className="overview-sim__activeMetaDelta">{`${formatSignedInteger(activeScenario.deltaValue)} (${formatSignedPercent(activeScenario.deltaPct)})`}</span>
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
              onMouseEnter={() => onSelect(index)}
              onFocus={() => onSelect(index)}
              onClick={() => onSelect(index)}
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
  const lowPrice = resolveRoundedPrice(snapshot.low_price)
  const microPrice = resolveRoundedPrice(snapshot.microprice)
  const bestBidPrice = resolveRoundedPrice(snapshot.best_bid_price)
  const highBid = Math.max(microPrice, bestBidPrice, resolveRoundedPrice(snapshot.mid_price), resolveRoundedPrice(snapshot.last_price))
  const defaultBid = bestBidPrice || Math.max(microPrice, bestBidPrice)

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
  const microPrice = resolveRoundedPrice(snapshot.microprice)
  const bestAskPrice = resolveRoundedPrice(snapshot.best_ask_price)
  const lowAsk = Math.min(
    ...[bestAskPrice, microPrice, resolveRoundedPrice(snapshot.mid_price), resolveRoundedPrice(snapshot.last_price)].filter(
      (value) => value > 0,
    ),
  )
  const highAsk = resolveRoundedPrice(snapshot.high_price)

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

function buildTableScenario({
  bidPrice,
  askPrice,
  targetProfit,
}: {
  bidPrice: number
  askPrice: number
  targetProfit: number
}): TableScenario {
  if (bidPrice <= 0 || askPrice <= 0) {
    return {
      targetProfit,
      quantity: 0,
      buyTotal: 0,
      sellNet: 0,
      commissionCost: 0,
      buyOutOfRange: true,
    }
  }

  const minimumQuantity = Math.max(1, Math.ceil(MIN_INVESTMENT / bidPrice))
  const targetQuantity = solveQuantityForTarget({ bidPrice, askPrice, targetProfit })
  const quantity = Math.max(minimumQuantity, targetQuantity)
  const buyCost = quantity * bidPrice
  const sellValue = quantity * askPrice
  const buyCommission = calculateCommission(buyCost)
  const sellCommission = calculateCommission(sellValue)
  const buyTotal = buyCost + buyCommission
  const sellNet = sellValue - sellCommission
  const commissionCost = buyCommission + sellCommission

  return {
    targetProfit,
    quantity,
    buyTotal,
    sellNet,
    commissionCost,
    buyOutOfRange: buyCost < MIN_INVESTMENT || buyCost > MAX_INVESTMENT,
  }
}

function solveQuantityForTarget({
  bidPrice,
  askPrice,
  targetProfit,
}: {
  bidPrice: number
  askPrice: number
  targetProfit: number
}) {
  if (bidPrice <= 0 || askPrice <= bidPrice) {
    return 1
  }

  let low = 1
  let high = 1

  while (computeNetProfit(high, bidPrice, askPrice) < targetProfit && high < 2_000_000) {
    high *= 2
  }

  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (computeNetProfit(mid, bidPrice, askPrice) >= targetProfit) {
      high = mid
    } else {
      low = mid + 1
    }
  }

  return Math.max(1, low)
}

function buildLossScenario({
  bidPrice,
  quantity,
  lossTarget,
}: {
  bidPrice: number
  quantity: number
  lossTarget: number
}): LossScenario | null {
  if (bidPrice <= 0 || quantity <= 0) {
    return null
  }

  const profitAtBid = computeNetProfit(quantity, bidPrice, bidPrice)

  if (profitAtBid <= -lossTarget) {
    return {
      triggerPrice: bidPrice,
      lossTarget,
      deltaValue: 0,
      deltaPct: 0,
    }
  }

  let low = 0
  let high = bidPrice

  for (let iteration = 0; iteration < 36; iteration += 1) {
    const midpoint = (low + high) / 2
    const profit = computeNetProfit(quantity, bidPrice, midpoint)
    if (profit <= -lossTarget) {
      low = midpoint
    } else {
      high = midpoint
    }
  }

  const triggerPrice = Math.max(1, Math.round(high))
  const deltaValue = triggerPrice - bidPrice
  const deltaPct = bidPrice > 0 ? (deltaValue / bidPrice) * 100 : 0

  return {
    triggerPrice,
    lossTarget,
    deltaValue,
    deltaPct,
  }
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

function calculateCommission(amount: number) {
  if (amount <= 0) {
    return 0
  }

  if (amount <= 5_000_000) {
    return 14_875
  }

  return amount * 0.0025 * 1.19
}

function computeNetProfit(quantity: number, buyPrice: number, sellPrice: number) {
  const buyAmount = quantity * buyPrice
  const sellAmount = quantity * sellPrice
  const buyCommission = calculateCommission(buyAmount)
  const sellCommission = calculateCommission(sellAmount)
  return sellAmount - sellCommission - buyAmount - buyCommission
}

function resolveRoundedPrice(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 0
  }

  return Math.max(1, Math.round(value))
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

function formatCompactLossTarget(value: number) {
  return `-${Math.round(value / 1_000)}K`
}
