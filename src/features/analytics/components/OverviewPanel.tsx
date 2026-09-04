import { useEffect, useState, type ReactNode } from 'react'
import type { AnalyticsSymbolFeed, HistoricStat } from '../api/schemas'
import type { OrderPositionSummary } from '../lib/orderPosition'
import { DeterministicSimulationTile } from './DeterministicSimulationTile'
import { OverviewSessionVectorTile, type SessionVectorHoverSnapshot } from './OverviewSessionVectorTile'
import { SeasonalityMiniChart } from './SeasonalityMiniChart'
import { SymbolIdentity } from './SymbolIdentity'
import { deriveFreshnessTone, formatFreshnessTimestamp } from '../lib/freshness'
import { buildOverviewQualitativeOpenAiUrl } from '../lib/overviewOpenAiPrompt'
import { useSessionVectorAvailableDays, useSessionVectorDay } from '../hooks/useAnalytics'
import { resolveSessionVectorTradingDate } from '../lib/analyticsDataPolicy'
import {
  computeCumulativeVwap,
  formatBandDelta,
  formatMetricValue,
  formatPercentFromWhole,
  formatSampleCount,
} from '../lib/formatters'

type OverviewPanelProps = {
  snapshots: AnalyticsSymbolFeed[]
  orderPositionsBySymbol?: Record<string, OrderPositionSummary | undefined>
}

type TapeTone = 'positive' | 'negative' | 'neutral'
type BadgeTone = 'fresh' | 'stale'
type ZScoreTone = 'ask' | 'bid' | 'neutral'

type TapeItemData = {
  key: string
  className: string
  label?: string
  primary?: string
  secondary?: string
  badge?: string
  badgeTone?: BadgeTone
  zScore?: string
  inline?: string
  inlineTone?: TapeTone
  secondaryTone?: TapeTone
  pairs?: Array<{
    label: string
    value: string
    valueTone?: TapeTone
    secondary?: string
    inline?: string
    inlineTone?: TapeTone
    secondaryTone?: TapeTone
    zScore?: string
    zScoreTone?: ZScoreTone
  }>
  signalMatrix?: {
    dynamicLabel?: string
    rows: Array<{
      label?: string
      expression: string
      values: ReactNode
      detail?: ReactNode
      tone: TapeTone
      highlightValues?: boolean
      highlightDetail?: boolean
      dynamicDetail?: ReactNode
      dynamicValues?: ReactNode
      dynamicTone?: TapeTone
    }>
  }
  zScoreTone?: ZScoreTone
}

export function OverviewPanel({
  snapshots,
  orderPositionsBySymbol = {},
}: OverviewPanelProps) {
  return (
    <section className="overview-stack" aria-label="Market overview">
      {snapshots.map((snapshot) => {
        return (
          <OverviewSnapshotCard
            key={snapshot.symbol}
            snapshot={snapshot}
            orderPositionSummary={orderPositionsBySymbol[snapshot.symbol]}
          />
        )
      })}
    </section>
  )
}

function OverviewSnapshotCard({
  snapshot,
  orderPositionSummary,
}: {
  snapshot: AnalyticsSymbolFeed
  orderPositionSummary?: OrderPositionSummary
}) {
  const [sessionHover, setSessionHover] = useState<SessionVectorHoverSnapshot | null>(null)
  const [selectedSessionVectorDate, setSelectedSessionVectorDate] = useState<string | null>(null)
  const current = snapshot.current_snapshot
  const currentStats = snapshot.current_stats
  const liveSessionVectorTradingDate = resolveSessionVectorTradingDate(snapshot)
  const sessionVectorDaysQuery = useSessionVectorAvailableDays(snapshot.symbol, liveSessionVectorTradingDate, true)
  const availableSessionVectorDates = sessionVectorDaysQuery.data?.availableDates ?? []

  useEffect(() => {
    const nextDefaultTradingDate = availableSessionVectorDates[0] ?? null
    if (!nextDefaultTradingDate) {
      if (selectedSessionVectorDate !== null) {
        setSelectedSessionVectorDate(null)
      }
      return
    }

    if (!selectedSessionVectorDate || !availableSessionVectorDates.includes(selectedSessionVectorDate)) {
      setSelectedSessionVectorDate(nextDefaultTradingDate)
    }
  }, [availableSessionVectorDates, selectedSessionVectorDate])

  const activeSessionVectorDate = selectedSessionVectorDate ?? availableSessionVectorDates[0] ?? null
  const sessionVectorQuery = useSessionVectorDay(
    snapshot.symbol,
    activeSessionVectorDate,
    liveSessionVectorTradingDate,
    Boolean(activeSessionVectorDate),
  )
  const sampleCount = resolveSampleCount(currentStats)
  const currentVwap = computeCumulativeVwap(current)
  const currentSpread = deriveSpread(current.best_ask_price, current.best_bid_price)
  const marketTone: TapeTone =
    current.last_price !== null &&
    current.last_price !== undefined &&
    current.previous_close !== null &&
    current.previous_close !== undefined
      ? current.last_price >= current.previous_close
        ? 'positive'
        : 'negative'
      : 'neutral'

  const freshnessLabel = formatFreshnessTimestamp(current.captured_at)
  const freshnessTone = deriveFreshnessTone(current.captured_at)
  const sampleLabel = formatSampleCount(sampleCount)
  const headerMeta = sampleLabel ? `${freshnessLabel} (${sampleLabel})` : freshnessLabel
  const openAiUrl = buildOverviewQualitativeOpenAiUrl(snapshot)
  const tradedVolumeZScore = buildZScoreContext(currentStats.traded_volume)
  const tradedValueZScore = buildZScoreContext(currentStats.traded_value)
  const isCrossedBook = isBestBidCrossingAsk(current.best_bid_price, current.best_ask_price)

  const topItems: TapeItemData[] = [
    buildTacticalReadItem(current, currentStats, currentVwap, currentSpread, sessionHover),
    {
      key: 'session_vector',
      className: 'overview-tape__item overview-tape__item--session-vector-slot',
    },
  ]

  return (
    <article className="overview-card">
      <header className="overview-card__header">
        <div className="overview-card__title">
          <h3>
            <a
              href={openAiUrl}
              target="_blank"
              rel="noreferrer"
              className="overview-card__titleLink"
              aria-label={`Open ChatGPT qualitative analysis for ${snapshot.symbol}`}
              title={`Open ChatGPT qualitative analysis for ${snapshot.symbol}`}
            >
              <SymbolIdentity symbol={snapshot.symbol} />
            </a>
          </h3>
          <div className="overview-card__headlineQuote">
            <strong className={`overview-card__headlinePrice overview-card__headlinePrice--${marketTone}`}>
              {formatMetricValue('last_price', current.last_price)}
            </strong>
            <span className={`overview-card__headlineDelta overview-card__headlineDelta--${marketTone}`}>
              {formatBandDelta('last_price', current.last_price, current.previous_close)}
              {current.daily_change_percent === null || current.daily_change_percent === undefined
                ? ''
                : ` (${formatPercentFromWhole(current.daily_change_percent)})`}
            </span>
          </div>
          <div className="overview-card__headlineBook">
            <span className={`overview-tape__badge overview-tape__badge--${isCrossedBook ? 'stale' : 'fresh'}`}>
              {isCrossedBook ? 'Stop' : 'Normal'}
            </span>
            <div className="overview-card__headlineBookQuote">
              <span className="overview-card__headlineBookLabel overview-card__headlineBookLabel--ask">Ask</span>
              <strong className="overview-card__headlineBookValue overview-card__headlineBookValue--ask">
                {formatMetricValue('best_ask_price', current.best_ask_price)}
              </strong>
            </div>
            <div className="overview-card__headlineBookQuote">
              <span className="overview-card__headlineBookLabel overview-card__headlineBookLabel--bid">Bid</span>
              <strong className="overview-card__headlineBookValue overview-card__headlineBookValue--bid">
                {formatMetricValue('best_bid_price', current.best_bid_price)}
              </strong>
            </div>
            <div className="overview-card__headlineRange" aria-label="Daily range">
              <div className="overview-card__headlineRangeItem overview-card__headlineRangeItem--high">
                <span className="overview-card__headlineRangeIcon" aria-hidden="true" />
                <span className="overview-card__headlineRangeLabel">High</span>
                <strong className="overview-card__headlineRangeValue">{formatMetricValue('high_price', current.high_price)}</strong>
              </div>
              <div className="overview-card__headlineRangeItem overview-card__headlineRangeItem--low">
                <span className="overview-card__headlineRangeIcon" aria-hidden="true" />
                <span className="overview-card__headlineRangeLabel">Low</span>
                <strong className="overview-card__headlineRangeValue">{formatMetricValue('low_price', current.low_price)}</strong>
              </div>
            </div>
            <div className="overview-card__headlineFlow" aria-label="Trading flow">
              <div className="overview-card__headlineFlowItem">
                <span className="overview-card__headlineFlowIcon" aria-hidden="true" />
                <span className="overview-card__headlineFlowLabel">Vol</span>
                <strong className="overview-card__headlineFlowValue">
                  {formatMetricValue('traded_volume', current.traded_volume)}
                </strong>
                {tradedVolumeZScore.zScore ? (
                  <span className="overview-card__headlineFlowZscore">{tradedVolumeZScore.zScore}</span>
                ) : null}
              </div>
              <div className="overview-card__headlineFlowItem">
                <span className="overview-card__headlineFlowIcon" aria-hidden="true" />
                <span className="overview-card__headlineFlowLabel">TV</span>
                <strong className="overview-card__headlineFlowValue">
                  {formatMetricValue('traded_value', current.traded_value)}
                </strong>
                {tradedValueZScore.zScore ? (
                  <span className="overview-card__headlineFlowZscore">{tradedValueZScore.zScore}</span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        <span className={`overview-card__meta overview-card__meta--${freshnessTone}`}>{headerMeta}</span>
      </header>

      <div className="overview-tape overview-tape--microstructure" role="group" aria-label={`${snapshot.symbol} microstructure tape`}>
        <div className="overview-tape__row overview-tape__row--microstructure">
          {topItems.map((item) =>
            item.key === 'session_vector' ? (
              <OverviewSessionVectorTile
                key={item.key}
                dataset={sessionVectorQuery.data}
                referenceHigh={current.high_price ?? null}
                referenceLow={current.low_price ?? null}
                availableTradingDates={availableSessionVectorDates}
                selectedTradingDate={activeSessionVectorDate}
                onTradingDateChange={setSelectedSessionVectorDate}
                isLoading={sessionVectorDaysQuery.isLoading || (sessionVectorQuery.isLoading && !sessionVectorQuery.data)}
                onHoverChange={setSessionHover}
              />
            ) : (
              <TapeItem key={item.key} item={item} />
            ),
          )}
        </div>
      </div>

      <div className="overview-tape overview-tape--market" role="group" aria-label={`${snapshot.symbol} market tape`}>
        <div className="overview-tape__row overview-tape__row--market">
          <SeasonalityMiniChart profile={snapshot.seasonality_profile} capturedAt={current.captured_at} />
          <DeterministicSimulationTile snapshot={current} positionSummary={orderPositionSummary} />
        </div>
      </div>
    </article>
  )
}

function TapeItem({ item }: { item: TapeItemData }) {
  if (item.signalMatrix) {
    const hasDynamic = Boolean(item.signalMatrix.dynamicLabel)
    return (
      <section className={item.className}>
        <div className="overview-signal">
          <div className="overview-signal__legend" aria-label="Signal legend">
            <span className="overview-signal__legendItem">
              <span className="overview-signal__legendSwatch overview-signal__legendSwatch--last" aria-hidden="true" />
              <span>Last</span>
            </span>
            <span className="overview-signal__legendItem">
              <span className="overview-signal__legendSwatch overview-signal__legendSwatch--mid" aria-hidden="true" />
              <span>Mid</span>
            </span>
            <span className="overview-signal__legendItem">
              <span className="overview-signal__legendSwatch overview-signal__legendSwatch--vwap" aria-hidden="true" />
              <span>VWAP</span>
            </span>
          </div>
          <div
            className={`overview-signal__matrix${hasDynamic ? ' overview-signal__matrix--compare' : ''}`}
            role="table"
            aria-label="Tactical signal matrix"
          >
            {hasDynamic ? (
              <div className="overview-signal__compareHeader" role="row">
                <span className="overview-signal__compareHeaderSpacer" aria-hidden="true" />
                <span className="overview-signal__compareHeaderLabel" role="columnheader">
                  Now
                </span>
                <span className="overview-signal__compareHeaderLabel overview-signal__compareHeaderLabel--dynamic" role="columnheader">
                  {item.signalMatrix.dynamicLabel}
                </span>
              </div>
            ) : null}
            {item.signalMatrix.rows.map((row) => (
              <div
                key={row.label ?? row.expression}
                className={`overview-signal__row${row.dynamicDetail && row.dynamicValues ? ' overview-signal__row--compare' : ''}`}
                role="row"
              >
                <span className={`overview-signal__expression overview-signal__expression--${row.tone}`} role="cell">
                  {row.expression}
                </span>
                {row.dynamicDetail && row.dynamicValues ? (
                  <>
                    <div className="overview-signal__compareBlock" role="cell">
                      <span
                        className={`overview-signal__delta overview-signal__delta--${row.tone}${row.highlightDetail ? ' overview-signal__delta--highlight' : ''}`}
                      >
                        {row.detail ?? ''}
                      </span>
                      <span className={`overview-signal__values${row.highlightValues ? ' overview-signal__values--highlight' : ''}`}>{row.values}</span>
                    </div>
                    <div className="overview-signal__compareBlock overview-signal__compareBlock--dynamic" role="cell">
                      <span className={`overview-signal__delta overview-signal__delta--${row.dynamicTone ?? 'neutral'}`}>{row.dynamicDetail}</span>
                      <span className="overview-signal__values">{row.dynamicValues}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <span
                      className={`overview-signal__delta overview-signal__delta--${row.tone}${row.highlightDetail ? ' overview-signal__delta--highlight' : ''}`}
                      role="cell"
                    >
                      {row.detail ?? ''}
                    </span>
                    <span
                      className={`overview-signal__values${row.highlightValues ? ' overview-signal__values--highlight' : ''}`}
                      role="cell"
                    >
                      {row.values}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  }

  if (item.pairs) {
    return (
      <section className={item.className}>
        {item.badge ? (
          <div className="overview-tape__pairBadgeRow">
            <span className={`overview-tape__badge overview-tape__badge--${item.badgeTone ?? 'fresh'}`}>{item.badge}</span>
          </div>
        ) : null}
        {item.pairs.map((pair) => (
          <div key={pair.label} className="overview-tape__pair">
            <span className="overview-tape__pair-label">{pair.label}</span>
            <div className="overview-tape__pair-main-row">
              <strong className={`overview-tape__pair-value overview-tape__pair-value--${pair.valueTone ?? 'neutral'}`}>
                {pair.value}
              </strong>
              {pair.zScore ? (
                <div className="overview-tape__pair-zstack">
                  <span className={`overview-tape__zscore overview-tape__zscore--${pair.zScoreTone ?? 'neutral'}`}>
                    {pair.zScore}
                  </span>
                </div>
              ) : null}
            </div>
            {pair.inline ? (
              <div className={`overview-tape__sub overview-tape__sub--inline overview-tape__sub--${pair.secondaryTone ?? 'neutral'}`}>
                <span>{pair.secondary ?? 'No prior point'}</span>
                <span className={`overview-tape__inline-tone overview-tape__inline-tone--${pair.inlineTone ?? 'neutral'}`}>
                  {pair.inline}
                </span>
              </div>
            ) : pair.secondary ? (
              <div className={`overview-tape__sub overview-tape__sub--${pair.secondaryTone ?? 'neutral'}`}>{pair.secondary}</div>
            ) : null}
          </div>
        ))}
      </section>
    )
  }

  return (
    <section className={item.className}>
      {item.label ? (
        <div className="overview-tape__eyebrow">
          <span className="overview-tape__dot" />
          <span className="overview-tape__label">{item.label}</span>
        </div>
      ) : null}

      <div className="overview-tape__main-row">
        <strong className="overview-tape__main">{item.primary ?? 'n/a'}</strong>
        {item.zScore ? (
          <div className="overview-tape__zstack">
            <span className={`overview-tape__zscore overview-tape__zscore--${item.zScoreTone ?? 'neutral'}`}>
              {item.zScore}
            </span>
          </div>
        ) : null}
      </div>

      {item.badge ? (
        <div className="overview-tape__badgeRow">
          <span className={`overview-tape__badge overview-tape__badge--${item.badgeTone ?? 'fresh'}`}>{item.badge}</span>
        </div>
      ) : null}

      {item.inline ? (
        <div className={`overview-tape__sub overview-tape__sub--inline overview-tape__sub--${item.secondaryTone ?? 'neutral'}`}>
          <span>{item.secondary ?? 'No prior point'}</span>
          <span className={`overview-tape__inline-tone overview-tape__inline-tone--${item.inlineTone ?? 'neutral'}`}>
            {item.inline}
          </span>
        </div>
      ) : item.secondary ? (
        <div className={`overview-tape__sub overview-tape__sub--${item.secondaryTone ?? 'neutral'}`}>{item.secondary ?? 'No prior point'}</div>
      ) : null}
    </section>
  )
}

function buildTacticalReadItem(
  current: AnalyticsSymbolFeed['current_snapshot'],
  currentStats: Record<string, HistoricStat>,
  currentVwap: number | null,
  currentSpread: number | null,
  sessionHover: SessionVectorHoverSnapshot | null = null,
): TapeItemData {
  const vwapStddev = resolveStatStddev(currentStats.vwap)
  const microVsMid = buildComparisonContext(current.microprice, current.mid_price)
  const midVsVwap = buildComparisonContext(current.mid_price, currentVwap)
  const lastVsVwap = buildComparisonContext(current.last_price, currentVwap)
  const spreadContext = buildZScoreContext(currentStats.spread_bps)
  const obiL1Context = buildZScoreContext(currentStats.obi_l1)
  const obiTop5Context = buildZScoreContext(currentStats.obi_top_5)

  return {
    key: 'tactical-read',
    className: 'overview-tape__item overview-tape__item--signal-stack',
    signalMatrix: {
      dynamicLabel: sessionHover?.label,
      rows: [
        applySessionHoverToSignalRow(
          buildSignalRow('Micro', current.microprice, 'Mid', current.mid_price, microVsMid),
          sessionHover?.rows[0],
        ),
        applySessionHoverToSignalRow(
          buildSignalRow(
            'Mid',
            current.mid_price,
            'VWAP',
            currentVwap,
            midVsVwap,
            buildRelativeToVwapZScore(current.mid_price, currentVwap, vwapStddev),
          ),
          sessionHover?.rows[1],
        ),
        applySessionHoverToSignalRow(
          buildSignalRow(
            'Last',
            current.last_price,
            'VWAP',
            currentVwap,
            lastVsVwap,
            buildRelativeToVwapZScore(current.last_price, currentVwap, vwapStddev),
          ),
          sessionHover?.rows[2],
        ),
        buildSpreadRow(
          current.spread_bps,
          currentSpread,
          spreadContext.zScore,
          spreadContext.highlight,
        ),
        buildObiRow(
          current.obi_l1,
          current.obi_top_5,
          obiL1Context.zScore,
          obiTop5Context.zScore,
          obiL1Context.highlight,
          obiTop5Context.highlight,
        ),
      ],
    },
  }
}

function applySessionHoverToSignalRow(
  row: NonNullable<TapeItemData['signalMatrix']>['rows'][number],
  sessionHoverRow?: SessionVectorHoverSnapshot['rows'][number],
) {
  if (!sessionHoverRow) {
    return row
  }

  return {
    ...row,
    dynamicDetail: buildComparisonDeltaNode(sessionHoverRow.detail, sessionHoverRow.tone),
    dynamicValues:
      sessionHoverRow.leftMetric &&
      sessionHoverRow.rightMetric &&
      sessionHoverRow.relation &&
      sessionHoverRow.leftValue !== undefined &&
      sessionHoverRow.rightValue !== undefined
        ? buildSignalValuesNode(
            sessionHoverRow.leftMetric,
            sessionHoverRow.leftValue,
            sessionHoverRow.relation,
            sessionHoverRow.rightMetric,
            sessionHoverRow.rightValue,
          )
        : sessionHoverRow.values,
    dynamicTone: sessionHoverRow.tone,
  }
}

function buildZScoreContext(stat?: HistoricStat) {
  const sampleCount = stat?.sample_count ?? 0
  if (
    !stat ||
    sampleCount < 2 ||
    stat.latest_value === null ||
    stat.latest_value === undefined ||
    stat.mean === null ||
    stat.mean === undefined ||
    stat.stddev === null ||
    stat.stddev === undefined ||
    stat.stddev === 0
  ) {
    return { zScore: undefined, tone: 'neutral' as ZScoreTone, highlight: false }
  }

  const zScore = computeZScore(stat)
  if (zScore === null) {
    return { zScore: undefined, tone: 'neutral' as ZScoreTone, highlight: false }
  }

  return {
    zScore: `${zScore >= 0 ? '+' : ''}${zScore.toFixed(1)}\u03c3`,
    tone: deriveZScoreTone(zScore),
    highlight: shouldHighlightSignalZScore(zScore),
  }
}

function deriveZScoreTone(zScore: number): ZScoreTone {
  if (zScore < -1.8) {
    return 'ask'
  }

  if (zScore > 1.8) {
    return 'bid'
  }

  return 'neutral'
}

function resolveSampleCount(currentStats: Record<string, HistoricStat>) {
  const counts = Object.values(currentStats).map((item) => item?.sample_count ?? 0)
  return Math.max(0, ...counts)
}

function computeZScore(stat: HistoricStat) {
  if (
    stat.latest_value === null ||
    stat.latest_value === undefined ||
    stat.mean === null ||
    stat.mean === undefined ||
    stat.stddev === null ||
    stat.stddev === undefined ||
    stat.stddev === 0 ||
    (stat.sample_count ?? 0) < 2
  ) {
    return null
  }

  return (stat.latest_value - stat.mean) / stat.stddev
}

function resolveStatStddev(stat?: HistoricStat) {
  if (
    !stat ||
    stat.stddev === null ||
    stat.stddev === undefined ||
    Number.isNaN(stat.stddev) ||
    stat.stddev === 0 ||
    (stat.sample_count ?? 0) < 2
  ) {
    return null
  }

  return stat.stddev
}

function deriveSpread(bestAsk: number | null | undefined, bestBid: number | null | undefined) {
  if (bestAsk === null || bestAsk === undefined || bestBid === null || bestBid === undefined) {
    return null
  }

  return Math.abs(bestAsk - bestBid)
}

function isBestBidCrossingAsk(bestBid: number | null | undefined, bestAsk: number | null | undefined) {
  if (bestBid === null || bestBid === undefined || bestAsk === null || bestAsk === undefined) {
    return false
  }

  return bestBid > bestAsk
}

type ComparisonContext = {
  delta: number
  percent: number | null
}

function buildComparisonContext(
  left: number | null | undefined,
  right: number | null | undefined,
): ComparisonContext | null {
  if (
    left === null ||
    left === undefined ||
    right === null ||
    right === undefined ||
    Number.isNaN(left) ||
    Number.isNaN(right)
  ) {
    return null
  }

  return {
    delta: left - right,
    percent: right === 0 ? null : ((left - right) / right) * 100,
  }
}

function formatComparisonDelta(context: ComparisonContext | null) {
  if (!context) {
    return 'n/a'
  }

  const absolute = formatSignedNumber(context.delta)
  if (context.percent === null || Number.isNaN(context.percent)) {
    return absolute
  }

  return `${absolute} (${formatSignedPercent(context.percent)})`
}

function deriveDeltaTone(delta: number | null | undefined): TapeTone {
  if (delta === null || delta === undefined || Number.isNaN(delta)) {
    return 'neutral'
  }

  if (delta > 0) {
    return 'positive'
  }

  if (delta < 0) {
    return 'negative'
  }

  return 'neutral'
}

function formatSignedNumber(value: number) {
  const absolute = formatMetricValue('last_price', Math.abs(value))
  return `${value >= 0 ? '+' : '-'}${absolute}`
}

function formatSignedPercent(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function buildSignalRow(
  leftLabel: 'Micro' | 'Mid' | 'Last',
  leftValue: number | null | undefined,
  rightLabel: 'Mid' | 'VWAP',
  rightValue: number | null | undefined,
  comparison: ComparisonContext | null,
  zScore: { label: string; highlight: boolean } | undefined = undefined,
) {
  const relation = deriveComparisonRelation(comparison)

  return {
    label: `${leftLabel}-${rightLabel}`,
    expression: `${leftLabel.toUpperCase()} ${relation} ${rightLabel.toUpperCase()}`,
    values: buildSignalValuesNode(
      leftLabel.toLowerCase() as SignalMetricKey,
      leftValue,
      relation,
      rightLabel.toLowerCase() as SignalMetricKey,
      rightValue,
      zScore?.label,
    ),
    detail: comparison ? buildComparisonDeltaNode(formatComparisonDelta(comparison), deriveDeltaTone(comparison.delta)) : 'n/a',
    tone: deriveDeltaTone(comparison?.delta),
    highlightValues: zScore?.highlight,
  }
}

function buildRelativeToVwapZScore(
  leftValue: number | null | undefined,
  vwapValue: number | null | undefined,
  vwapStddev: number | null,
) {
  if (
    leftValue === null ||
    leftValue === undefined ||
    Number.isNaN(leftValue) ||
    vwapValue === null ||
    vwapValue === undefined ||
    Number.isNaN(vwapValue) ||
    vwapStddev === null
  ) {
    return undefined
  }

  const zScore = (leftValue - vwapValue) / vwapStddev
  return {
    label: `${zScore >= 0 ? '+' : ''}${zScore.toFixed(1)}\u03c3`,
    highlight: shouldHighlightSignalZScore(zScore),
  }
}

function deriveComparisonRelation(comparison: ComparisonContext | null) {
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

function buildSpreadRow(
  spreadBps: number | null | undefined,
  spread: number | null | undefined,
  spreadZScore: string | undefined,
  highlightValues = false,
) {
  return {
    expression: 'SPREAD BPS',
    values: `${formatMetricValue('spread_bps', spreadBps)}${spreadZScore ? ` ${spreadZScore}` : ''}`,
    detail: `SPREAD ${formatMetricValue('spread', spread)}`,
    tone: deriveExecutionTone(spreadBps),
    highlightValues,
  }
}

function buildObiRow(
  obiL1: number | null | undefined,
  obiTop5: number | null | undefined,
  obiL1ZScore: string | undefined,
  obiTop5ZScore: string | undefined,
  highlightDetail = false,
  highlightValues = false,
) {
  return {
    expression: 'OBI',
    detail: `L1 ${formatMetricValue('obi_l1', obiL1)}${obiL1ZScore ? ` ${obiL1ZScore}` : ''}`,
    values: `TOP 5 ${formatMetricValue('obi_top_5', obiTop5)}${obiTop5ZScore ? ` (${obiTop5ZScore})` : ''}`,
    tone: deriveObiRowTone(obiL1, obiTop5),
    highlightDetail,
    highlightValues,
  }
}

function shouldHighlightSignalZScore(zScore: number) {
  return Math.abs(zScore) >= 2
}

function deriveObiRowTone(obiL1: number | null | undefined, obiTop5: number | null | undefined): TapeTone {
  if (
    (typeof obiL1 === 'number' && !Number.isNaN(obiL1) && obiL1 > 0) ||
    (typeof obiTop5 === 'number' && !Number.isNaN(obiTop5) && obiTop5 > 0)
  ) {
    return 'positive'
  }

  if (
    (typeof obiL1 === 'number' && !Number.isNaN(obiL1) && obiL1 < 0) ||
    (typeof obiTop5 === 'number' && !Number.isNaN(obiTop5) && obiTop5 < 0)
  ) {
    return 'negative'
  }

  return 'neutral'
}

function deriveExecutionTag(spreadBps: number | null | undefined) {
  if (spreadBps === null || spreadBps === undefined || Number.isNaN(spreadBps)) {
    return 'Normal'
  }

  if (spreadBps <= 30) {
    return 'Tight'
  }

  if (spreadBps > 150) {
    return 'Expensive'
  }

  return 'Normal'
}

function deriveExecutionTone(spreadBps: number | null | undefined): TapeTone {
  const tag = deriveExecutionTag(spreadBps)

  if (tag === 'Tight') {
    return 'positive'
  }

  if (tag === 'Expensive') {
    return 'negative'
  }

  return 'neutral'
}

type SignalMetricKey = 'last' | 'mid' | 'vwap' | 'micro'

function buildSignalValuesNode(
  leftMetric: SignalMetricKey,
  leftValue: number | null | undefined,
  relation: string,
  rightMetric: SignalMetricKey,
  rightValue: number | null | undefined,
  zScore?: string,
) {
  return (
    <>
      <span className={`overview-signal__metricToken overview-signal__metricToken--${leftMetric}`}>
        {formatMetricValue('last_price', leftValue)}
      </span>
      <span className="overview-signal__metricRelation"> {relation} </span>
      <span className={`overview-signal__metricToken overview-signal__metricToken--${rightMetric}`}>
        {formatMetricValue('last_price', rightValue)}
      </span>
      {zScore ? <span className="overview-signal__metricZscore"> ({zScore})</span> : null}
    </>
  )
}

function buildComparisonDeltaNode(detail: string, tone: TapeTone) {
  if (tone === 'neutral' || detail === 'n/a') {
    return detail
  }

  return <span className="overview-signal__deltaContent">{detail}</span>
}
