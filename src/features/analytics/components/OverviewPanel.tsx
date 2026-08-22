import type { AnalyticsSymbolFeed, HistoricStat } from '../api/schemas'
import { SeasonalityMiniChart } from './SeasonalityMiniChart'
import { SymbolIdentity } from './SymbolIdentity'
import {
  computeCumulativeVwap,
  formatBandDelta,
  formatBandDeltaWithRelative,
  formatMetricValue,
  formatPercentFromWhole,
  formatSampleCount,
} from '../lib/formatters'

type OverviewPanelProps = {
  snapshots: AnalyticsSymbolFeed[]
}

type TapeTone = 'positive' | 'negative' | 'neutral'
type ZTone = 'anomaly' | 'review' | 'normal'
type BadgeTone = 'fresh' | 'stale'

type TapeItemData = {
  key: string
  className: string
  label?: string
  primary?: string
  secondary?: string
  badge?: string
  badgeTone?: BadgeTone
  zScore?: string
  zSignal?: string
  zTone?: ZTone
  inline?: string
  inlineTone?: TapeTone
  pairs?: Array<{ label: string; value: string }>
}

export function OverviewPanel({ snapshots }: OverviewPanelProps) {
  return (
    <section className="overview-stack" aria-label="Market overview">
      {snapshots.map((snapshot) => {
        const current = snapshot.current_snapshot
        const previous = snapshot.previous_snapshot
        const currentStats = snapshot.current_stats
        const sampleCount = resolveSampleCount(currentStats)
        const currentVwap = computeCumulativeVwap(current)
        const previousVwap = previous ? computeCumulativeVwap(previous) : null
        const currentSpread = deriveSpread(current.best_ask_price, current.best_bid_price)
        const previousSpread = previous ? deriveSpread(previous.best_ask_price, previous.best_bid_price) : null
        const marketTone: TapeTone =
          current.last_price !== null &&
          current.last_price !== undefined &&
          current.previous_close !== null &&
          current.previous_close !== undefined
            ? current.last_price >= current.previous_close
              ? 'positive'
              : 'negative'
            : 'neutral'

        const topItems: TapeItemData[] = [
          {
            key: 'symbol',
            className: 'overview-tape__item overview-tape__item--symbol',
            label: 'Symbol',
            primary: snapshot.symbol,
            badge: formatFreshnessTimestamp(current.captured_at),
            badgeTone: deriveFreshnessTone(current.captured_at),
            secondary: formatSampleCount(sampleCount),
          },
          buildMicrostructureItem('OBI L1', 'obi_l1', current.obi_l1, previous?.obi_l1, currentStats.obi_l1),
          buildMicrostructureItem('OBI TOP 5', 'obi_top_5', current.obi_top_5, previous?.obi_top_5, currentStats.obi_top_5),
          buildMicrostructureItem('SPREAD BPS', 'spread_bps', current.spread_bps, previous?.spread_bps, currentStats.spread_bps),
          buildMicrostructureItem('MID PRICE', 'mid_price', current.mid_price, previous?.mid_price),
          buildMicrostructureItem('MICROPRICE', 'microprice', current.microprice, previous?.microprice),
        ]

        const bottomItems: TapeItemData[] = [
          {
            key: 'last_price',
            className: `overview-tape__item overview-tape__item--${marketTone}`,
            label: 'Last price',
            primary: formatMetricValue('last_price', current.last_price),
            secondary: formatBandDelta('last_price', current.last_price, current.previous_close),
            inline:
              current.daily_change_percent === null || current.daily_change_percent === undefined
                ? undefined
                : `(${formatPercentFromWhole(current.daily_change_percent)})`,
            inlineTone: marketTone,
          },
          {
            key: 'vwap_cumulative',
            className: 'overview-tape__item overview-tape__item--market',
            label: 'Cumulative VWAP',
            primary: formatMetricValue('vwap_cumulative', currentVwap),
            secondary: formatBandDeltaWithRelative('vwap_cumulative', currentVwap, previousVwap),
          },
          {
            key: 'best_prices',
            className: 'overview-tape__item overview-tape__item--paired overview-tape__item--market',
            pairs: [
              { label: 'Best bid', value: formatMetricValue('best_bid_price', current.best_bid_price) },
              { label: 'Best ask', value: formatMetricValue('best_ask_price', current.best_ask_price) },
            ],
          },
          {
            key: 'price_range',
            className: 'overview-tape__item overview-tape__item--paired overview-tape__item--market',
            pairs: [
              { label: 'High price', value: formatMetricValue('high_price', current.high_price) },
              { label: 'Low price', value: formatMetricValue('low_price', current.low_price) },
            ],
          },
          {
            key: 'spread',
            className: 'overview-tape__item overview-tape__item--market',
            label: 'Spread',
            primary: formatMetricValue('spread', currentSpread),
            secondary: formatBandDeltaWithRelative('spread', currentSpread, previousSpread),
          },
          {
            key: 'flow',
            className: 'overview-tape__item overview-tape__item--paired overview-tape__item--market',
            pairs: [
              { label: 'Traded volume', value: formatMetricValue('traded_volume', current.traded_volume) },
              { label: 'Traded value', value: formatMetricValue('traded_value', current.traded_value) },
            ],
          },
        ]

        return (
          <article key={snapshot.symbol} className="overview-card">
            <header className="overview-card__header">
              <div className="overview-card__title">
                <h3>
                  <SymbolIdentity symbol={snapshot.symbol} />
                </h3>
              </div>
            </header>

            <div
              className="overview-tape overview-tape--microstructure"
              role="group"
              aria-label={`${snapshot.symbol} microstructure tape`}
            >
              <div className="overview-tape__row overview-tape__row--microstructure">
                {topItems.map((item) => (
                  <TapeItem key={item.key} item={item} />
                ))}
              </div>
            </div>

            <div className="overview-tape overview-tape--market" role="group" aria-label={`${snapshot.symbol} market tape`}>
              <div className="overview-tape__row overview-tape__row--market">
                {bottomItems.map((item) => (
                  <TapeItem key={item.key} item={item} />
                ))}
                <SeasonalityMiniChart profile={snapshot.seasonality_profile} capturedAt={current.captured_at} />
              </div>
            </div>
          </article>
        )
      })}
    </section>
  )
}

function TapeItem({ item }: { item: TapeItemData }) {
  if (item.pairs) {
    return (
      <section className={item.className}>
        {item.pairs.map((pair) => (
          <div key={pair.label} className="overview-tape__pair">
            <span className="overview-tape__pair-label">{pair.label}</span>
            <strong className="overview-tape__pair-value">{pair.value}</strong>
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
        {item.zScore || item.zSignal ? (
          <div className="overview-tape__zstack">
            {item.zScore ? <span className="overview-tape__zscore">{item.zScore}</span> : null}
            {item.zSignal ? (
              <span className={`overview-tape__zsignal overview-tape__zsignal--${item.zTone ?? 'normal'}`}>{item.zSignal}</span>
            ) : null}
          </div>
        ) : null}
      </div>

      {item.badge ? (
        <div className="overview-tape__badgeRow">
          <span className={`overview-tape__badge overview-tape__badge--${item.badgeTone ?? 'fresh'}`}>{item.badge}</span>
        </div>
      ) : null}

      {item.inline ? (
        <div className="overview-tape__sub overview-tape__sub--inline">
          <span>{item.secondary ?? 'No prior point'}</span>
          <span className={`overview-tape__inline-tone overview-tape__inline-tone--${item.inlineTone ?? 'neutral'}`}>
            {item.inline}
          </span>
        </div>
      ) : (
        <div className="overview-tape__sub">{item.secondary ?? 'No prior point'}</div>
      )}
    </section>
  )
}

function buildMicrostructureItem(
  label: string,
  key: string,
  current: number | null | undefined,
  previous: number | null | undefined,
  stat?: HistoricStat,
): TapeItemData {
  const zContext = buildZScoreContext(stat)
  return {
    key,
    className: 'overview-tape__item',
    label,
    primary: formatMetricValue(key, current),
    secondary: formatBandDeltaWithRelative(key, current, previous),
    zScore: zContext.zScore,
    zSignal: zContext.signal,
    zTone: zContext.tone,
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
    return { zScore: undefined, signal: undefined, tone: undefined as undefined }
  }

  const zScore = computeZScore(stat)
  if (zScore === null) {
    return { zScore: undefined, signal: undefined, tone: undefined as undefined }
  }

  const absoluteZ = Math.abs(zScore)
  const signal = absoluteZ >= 3 ? 'Anomaly' : absoluteZ >= 2 ? 'Review' : 'Normal'
  const tone: ZTone = absoluteZ >= 3 ? 'anomaly' : absoluteZ >= 2 ? 'review' : 'normal'

  return {
    zScore: `${zScore >= 0 ? '+' : ''}${zScore.toFixed(1)}\u03c3`,
    signal,
    tone,
  }
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

function deriveSpread(bestAsk: number | null | undefined, bestBid: number | null | undefined) {
  if (bestAsk === null || bestAsk === undefined || bestBid === null || bestBid === undefined) {
    return null
  }

  return bestAsk - bestBid
}

function formatFreshnessTimestamp(value: string | null | undefined) {
  if (!value) {
    return 'n/a'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'n/a'
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )

  return `${parts.month ?? '--'}-${parts.day ?? '--'} ${parts.hour ?? '--'}:${parts.minute ?? '--'}`
}

function deriveFreshnessTone(value: string | null | undefined): BadgeTone {
  if (!value) {
    return 'stale'
  }

  const capturedAt = new Date(value).getTime()
  if (Number.isNaN(capturedAt)) {
    return 'stale'
  }

  const diffMs = Math.max(0, Date.now() - capturedAt)
  return diffMs <= 5 * 60 * 1000 ? 'fresh' : 'stale'
}
