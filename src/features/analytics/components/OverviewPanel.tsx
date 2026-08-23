import type { AnalyticsSymbolFeed, HistoricStat } from '../api/schemas'
import { DeterministicSimulationTile } from './DeterministicSimulationTile'
import { SeasonalityMiniChart } from './SeasonalityMiniChart'
import { SymbolIdentity } from './SymbolIdentity'
import {
  computeCumulativeVwap,
  formatBandDelta,
  formatMetricValue,
  formatPercentFromWhole,
  formatSampleCount,
} from '../lib/formatters'

type OverviewPanelProps = {
  snapshots: AnalyticsSymbolFeed[]
}

type TapeTone = 'positive' | 'negative' | 'neutral'
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
  inline?: string
  inlineTone?: TapeTone
  secondaryTone?: TapeTone
  pairs?: Array<{
    label: string
    value: string
    secondary?: string
    inline?: string
    inlineTone?: TapeTone
    secondaryTone?: TapeTone
    zScore?: string
  }>
}

export function OverviewPanel({ snapshots }: OverviewPanelProps) {
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

        const topItems: TapeItemData[] = [
          buildLastPriceSpreadItem(current, currentStats, marketTone),
          {
            key: 'price_range',
            className: 'overview-tape__item overview-tape__item--paired',
            pairs: [
              { label: 'High price', value: formatMetricValue('high_price', current.high_price) },
              { label: 'Low price', value: formatMetricValue('low_price', current.low_price) },
            ],
          },
          {
            key: 'best_prices',
            className: 'overview-tape__item overview-tape__item--paired overview-tape__item--market',
            badge: isBestBidCrossingAsk(current.best_bid_price, current.best_ask_price) ? 'Stop' : 'Normal',
            badgeTone: isBestBidCrossingAsk(current.best_bid_price, current.best_ask_price) ? 'stale' : 'fresh',
            pairs: [
              { label: 'Best ask', value: formatMetricValue('best_ask_price', current.best_ask_price) },
              { label: 'Best bid', value: formatMetricValue('best_bid_price', current.best_bid_price) },
            ],
          },
          {
            key: 'mid-micro',
            className: 'overview-tape__item overview-tape__item--paired overview-tape__item--microstructure-pair',
            pairs: [
              { label: 'Mid price', value: formatMetricValue('mid_price', current.mid_price) },
              { label: 'Microprice', value: formatMetricValue('microprice', current.microprice) },
            ],
          },
          {
            key: 'vwap-spread',
            className: 'overview-tape__item overview-tape__item--paired',
            pairs: [
              { label: 'Cumulative VWAP', value: formatMetricValue('vwap_cumulative', currentVwap) },
              { label: 'Spread', value: formatMetricValue('spread', currentSpread) },
            ],
          },
          {
            key: 'flow',
            className: 'overview-tape__item overview-tape__item--paired',
            pairs: [
              { label: 'Traded volume', value: formatMetricValue('traded_volume', current.traded_volume) },
              { label: 'Traded value', value: formatMetricValue('traded_value', current.traded_value) },
            ],
          },
          buildObiPairItem(current, currentStats),
        ]

        return (
          <article key={snapshot.symbol} className="overview-card">
            <header className="overview-card__header">
              <div className="overview-card__title">
                <h3>
                  <SymbolIdentity symbol={snapshot.symbol} />
                </h3>
              </div>
              <span className={`overview-card__meta overview-card__meta--${freshnessTone}`}>{headerMeta}</span>
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
                <SeasonalityMiniChart profile={snapshot.seasonality_profile} capturedAt={current.captured_at} />
              </div>
            </div>

            <div className="overview-tape overview-tape--market" role="group" aria-label={`${snapshot.symbol} market tape`}>
              <div className="overview-tape__row overview-tape__row--market">
                <DeterministicSimulationTile snapshot={current} />
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
        {item.badge ? (
          <div className="overview-tape__pairBadgeRow">
            <span className={`overview-tape__badge overview-tape__badge--${item.badgeTone ?? 'fresh'}`}>{item.badge}</span>
          </div>
        ) : null}
        {item.pairs.map((pair) => (
          <div key={pair.label} className="overview-tape__pair">
            <span className="overview-tape__pair-label">{pair.label}</span>
            <div className="overview-tape__pair-main-row">
              <strong className="overview-tape__pair-value">{pair.value}</strong>
              {pair.zScore ? (
                <div className="overview-tape__pair-zstack">
                  <span className="overview-tape__zscore">{pair.zScore}</span>
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
            <span className="overview-tape__zscore">{item.zScore}</span>
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

function buildLastPriceSpreadItem(
  current: AnalyticsSymbolFeed['current_snapshot'],
  currentStats: Record<string, HistoricStat>,
  marketTone: TapeTone,
): TapeItemData {
  const spreadContext = buildZScoreContext(currentStats.spread_bps)

  return {
    key: 'last-price-spread',
    className: 'overview-tape__item overview-tape__item--paired overview-tape__item--last-spread',
    pairs: [
      {
        label: 'Last price',
        value: formatMetricValue('last_price', current.last_price),
        secondary: formatBandDelta('last_price', current.last_price, current.previous_close),
        inline:
          current.daily_change_percent === null || current.daily_change_percent === undefined
            ? undefined
            : `(${formatPercentFromWhole(current.daily_change_percent)})`,
        inlineTone: marketTone,
        secondaryTone: marketTone,
      },
      {
        label: 'SPREAD BPS',
        value: formatMetricValue('spread_bps', current.spread_bps),
        zScore: spreadContext.zScore,
      },
    ],
  }
}

function buildObiPairItem(
  current: AnalyticsSymbolFeed['current_snapshot'],
  currentStats: Record<string, HistoricStat>,
): TapeItemData {
  const obiL1Context = buildZScoreContext(currentStats.obi_l1)
  const obiTop5Context = buildZScoreContext(currentStats.obi_top_5)

  return {
    key: 'obi-pair',
    className: 'overview-tape__item overview-tape__item--paired',
    pairs: [
      {
        label: 'OBI L1',
        value: formatMetricValue('obi_l1', current.obi_l1),
        zScore: obiL1Context.zScore,
      },
      {
        label: 'OBI TOP 5',
        value: formatMetricValue('obi_top_5', current.obi_top_5),
        zScore: obiTop5Context.zScore,
      },
    ],
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
    return { zScore: undefined }
  }

  const zScore = computeZScore(stat)
  if (zScore === null) {
    return { zScore: undefined }
  }

  return {
    zScore: `${zScore >= 0 ? '+' : ''}${zScore.toFixed(1)}\u03c3`,
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

  return Math.abs(bestAsk - bestBid)
}

function isBestBidCrossingAsk(bestBid: number | null | undefined, bestAsk: number | null | undefined) {
  if (bestBid === null || bestBid === undefined || bestAsk === null || bestAsk === undefined) {
    return false
  }

  return bestBid > bestAsk
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
