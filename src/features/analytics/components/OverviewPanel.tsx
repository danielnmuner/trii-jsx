import type { AnalyticsSymbolFeed, HistoricStat, SessionVectorManifest, SessionVectorSegment } from '../api/schemas'
import type { OrderPositionSummary } from '../lib/orderPosition'
import { DeterministicSimulationTile } from './DeterministicSimulationTile'
import { OverviewSessionVectorTile } from './OverviewSessionVectorTile'
import { SeasonalityMiniChart } from './SeasonalityMiniChart'
import { SymbolIdentity } from './SymbolIdentity'
import { deriveFreshnessTone, formatFreshnessTimestamp } from '../lib/freshness'
import { buildOverviewQualitativeOpenAiUrl } from '../lib/overviewOpenAiPrompt'
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
  sessionVectorsBySymbol?: Record<
    string,
    | {
        symbol: string
        tradingDate: string
        samplingSeconds: number
        samplesPerSegment: number
        segmentCount: number
        manifest: SessionVectorManifest | null
        segments: SessionVectorSegment[]
      }
    | undefined
  >
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
    rows: Array<{
      expression: string
      values: string
      detail?: string
      tone: TapeTone
      highlightValues?: boolean
      highlightDetail?: boolean
    }>
  }
  zScoreTone?: ZScoreTone
}

export function OverviewPanel({
  snapshots,
  orderPositionsBySymbol = {},
  sessionVectorsBySymbol = {},
}: OverviewPanelProps) {
  return (
    <section className="overview-stack" aria-label="Market overview">
      {snapshots.map((snapshot) => {
        const current = snapshot.current_snapshot
        const currentStats = snapshot.current_stats
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
        const sessionVector = sessionVectorsBySymbol[snapshot.symbol]
        const isCrossedBook = isBestBidCrossingAsk(current.best_bid_price, current.best_ask_price)

        const topItems: TapeItemData[] = [
          buildTacticalReadItem(current, currentStats, currentVwap, currentSpread),
          {
            key: 'session_vector',
            className: 'overview-tape__item overview-tape__item--session-vector-slot',
          },
          {
            key: 'range_flow',
            className: 'overview-tape__item overview-tape__item--paired overview-tape__item--range-flow',
            pairs: [
              { label: 'High price', value: formatMetricValue('high_price', current.high_price) },
              { label: 'Low price', value: formatMetricValue('low_price', current.low_price) },
              {
                label: 'Traded volume',
                value: formatMetricValue('traded_volume', current.traded_volume),
                secondary: buildPreviousMetricValue('traded_volume', current.traded_volume, snapshot.previous_snapshot?.traded_volume),
                zScore: tradedVolumeZScore.zScore,
                zScoreTone: tradedVolumeZScore.tone,
              },
              {
                label: 'Traded value',
                value: formatMetricValue('traded_value', current.traded_value),
                secondary: buildPreviousMetricValue('traded_value', current.traded_value, snapshot.previous_snapshot?.traded_value),
                zScore: tradedValueZScore.zScore,
                zScoreTone: tradedValueZScore.tone,
              },
            ],
          },
        ]

        return (
          <article key={snapshot.symbol} className="overview-card">
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
                </div>
              </div>
              <span className={`overview-card__meta overview-card__meta--${freshnessTone}`}>{headerMeta}</span>
            </header>

            <div
              className="overview-tape overview-tape--microstructure"
              role="group"
              aria-label={`${snapshot.symbol} microstructure tape`}
            >
              <div className="overview-tape__row overview-tape__row--microstructure">
                {topItems.map((item) =>
                  item.key === 'session_vector' ? (
                    <OverviewSessionVectorTile
                      key={item.key}
                      dataset={sessionVector}
                      referenceHigh={current.high_price ?? null}
                      referenceLow={current.low_price ?? null}
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
                <DeterministicSimulationTile snapshot={current} positionSummary={orderPositionsBySymbol[snapshot.symbol]} />
              </div>
            </div>
          </article>
        )
      })}
    </section>
  )
}

function TapeItem({ item }: { item: TapeItemData }) {
  if (item.signalMatrix) {
    return (
      <section className={item.className}>
        <div className="overview-signal">
          <div className="overview-signal__matrix" role="table" aria-label="Tactical signal matrix">
            {item.signalMatrix.rows.map((row) => (
              <div key={row.expression} className="overview-signal__row" role="row">
                <span className={`overview-signal__expression overview-signal__expression--${row.tone}`} role="cell">
                  {row.expression}
                </span>
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
      rows: [
        buildSignalRow('Micro', current.microprice, 'Mid', current.mid_price, microVsMid),
        buildSignalRow(
          'Mid',
          current.mid_price,
          'VWAP',
          currentVwap,
          midVsVwap,
          buildRelativeToVwapZScore(current.mid_price, currentVwap, vwapStddev),
        ),
        buildSignalRow(
          'Last',
          current.last_price,
          'VWAP',
          currentVwap,
          lastVsVwap,
          buildRelativeToVwapZScore(current.last_price, currentVwap, vwapStddev),
        ),
        buildSpreadRow(current.spread_bps, currentSpread, spreadContext.zScore, spreadContext.highlight),
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

function buildPreviousMetricValue(
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
    return 'Prev n/a'
  }

  return `Prev ${formatMetricValue(metricKey, previous)}`
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
  leftLabel: string,
  leftValue: number | null | undefined,
  rightLabel: string,
  rightValue: number | null | undefined,
  comparison: ComparisonContext | null,
  zScore: { label: string; highlight: boolean } | undefined = undefined,
) {
  const relation = deriveComparisonRelation(comparison)

  return {
    label: `${leftLabel}-${rightLabel}`,
    expression: `${leftLabel.toUpperCase()} ${relation} ${rightLabel.toUpperCase()}`,
    values: formatSignalValues(leftValue, rightValue, relation, zScore?.label),
    detail: comparison ? formatComparisonDelta(comparison) : 'n/a',
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

function formatSignalValues(
  leftValue: number | null | undefined,
  rightValue: number | null | undefined,
  relation: string,
  zScore?: string,
) {
  const left = formatMetricValue('last_price', leftValue)
  const right = formatMetricValue('last_price', rightValue)

  return `${left} ${relation} ${right}${zScore ? ` ${zScore}` : ''}`
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
    values: `TOP 5 ${formatMetricValue('obi_top_5', obiTop5)}${obiTop5ZScore ? ` ${obiTop5ZScore}` : ''}`,
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
