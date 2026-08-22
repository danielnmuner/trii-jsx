import type { AnalyticsSymbolFeed, HistoricStat, SeasonalityProfile } from '../api/schemas'
import { formatInteger, formatMetricValue } from '../lib/formatters'
import { SymbolIdentity } from './SymbolIdentity'

type HistoricStatsPanelProps = {
  snapshots: AnalyticsSymbolFeed[]
}

const metricBands = [
  ['book_pressure_ratio', 'depth_weighted_microprice_deviation', 'obi_l1', 'obi_top_5', 'spread_bps'],
  ['traded_value', 'traded_volume', 'value_rate', 'volume_rate', 'seasonality'],
] as const

const metricLabels: Record<string, string> = {
  book_pressure_ratio: 'Book Pressure Ratio',
  depth_weighted_microprice_deviation: 'Depth Microprice Deviation',
  obi_l1: 'OBI L1',
  obi_top_5: 'OBI Top 5',
  spread_bps: 'Spread BPS',
  traded_value: 'Traded Value',
  traded_volume: 'Traded Volume',
  value_rate: 'Value Rate',
  volume_rate: 'Volume Rate',
}

export function HistoricStatsPanel({ snapshots }: HistoricStatsPanelProps) {
  return (
    <section className="historic-stats-stack" aria-label="Historic stats overview">
      {snapshots.map((snapshot) => (
        <HistoricStatsCard key={snapshot.symbol} snapshot={snapshot} />
      ))}
    </section>
  )
}

function HistoricStatsCard({ snapshot }: { snapshot: AnalyticsSymbolFeed }) {
  return (
    <article className="historic-stats-card">
      <header className="historic-stats-card__header">
        <div className="historic-stats-card__title">
          <h3>
            <SymbolIdentity symbol={snapshot.symbol} />
          </h3>
        </div>
      </header>

      {metricBands.map((band, index) => (
        <div key={`${snapshot.symbol}-band-${index + 1}`} className="historic-stats-band">
          {band.map((metricKey) =>
            metricKey === 'seasonality' ? (
              <HistoricSeasonalityTile key={`${snapshot.symbol}-seasonality`} profile={snapshot.seasonality_profile} />
            ) : (
              <HistoricMetricTile
                key={`${snapshot.symbol}-${metricKey}`}
                metricKey={metricKey}
                stat={snapshot.current_stats[metricKey]}
              />
            ),
          )}
        </div>
      ))}
    </article>
  )
}

function HistoricMetricTile({ metricKey, stat }: { metricKey: string; stat?: HistoricStat }) {
  const label = metricLabels[metricKey] ?? metricKey
  const curve = buildNormalCurve(stat)
  const asymmetry = classifyAsymmetryProxy(stat)
  const tails = classifyTailProxy(stat)

  return (
    <section className="historic-metric-tile">
      <div className="historic-metric-tile__head">
        <span className="historic-metric-tile__label">{label}</span>
        <strong className="historic-metric-tile__sample">{formatInteger(stat?.sample_count)}</strong>
      </div>

      <div className="historic-metric-tile__body">
        <div className="historic-metric-tile__chart">
          <NormalDistributionChart curve={curve} />
        </div>

        <div className="historic-metric-tile__stats">
          <div className="historic-metric-tile__stat">
            <span>Mu</span>
            <strong>{formatMetricValue(metricKey, stat?.mean)}</strong>
          </div>
          <div className="historic-metric-tile__stat">
            <span>Sigma</span>
            <strong>{formatMetricValue(metricKey, stat?.stddev)}</strong>
          </div>
          <div className="historic-metric-tile__stat">
            <span>Tails</span>
            <strong>{tails}</strong>
          </div>
          <div className="historic-metric-tile__stat">
            <span>Asym.</span>
            <strong>{asymmetry}</strong>
          </div>
        </div>
      </div>
    </section>
  )
}

function HistoricSeasonalityTile({ profile }: { profile?: SeasonalityProfile }) {
  const weekdays = buildWeekdaySeasonality(profile)
  const maxValue = Math.max(...weekdays.map((entry) => entry.deltaSamples), 0)
  const weeklyTotal = weekdays.reduce((sum, entry) => sum + entry.deltaSamples, 0)

  return (
    <section className="historic-metric-tile historic-metric-tile--seasonality">
      <div className="historic-metric-tile__head">
        <div className="historic-metric-tile__labelBlock">
          <span className="historic-metric-tile__label">Seasonality</span>
          <span className="historic-metric-tile__metricSub">Delta Samples</span>
        </div>
        <strong className="historic-metric-tile__sample">{formatInteger(weeklyTotal)}</strong>
      </div>

      {maxValue <= 0 ? (
        <div className="historic-seasonality__empty">No weekly profile</div>
      ) : (
        <>
          <div className="historic-seasonality__chart" style={{ gridTemplateColumns: `repeat(${Math.max(weekdays.length, 1)}, minmax(0, 1fr))` }}>
            {weekdays.map((entry) => {
              const height = Math.max((entry.deltaSamples / maxValue) * 100, 8)
              return (
                <div key={entry.weekday} className="historic-seasonality__barGroup">
                  <div
                    className="historic-seasonality__barTrack"
                    title={`${entry.label} · ${formatInteger(entry.deltaSamples)}`}
                    aria-label={`${entry.label} ${entry.deltaSamples}`}
                  >
                    <div className="historic-seasonality__bar" style={{ height: `${height}%` }} />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="historic-seasonality__weekdays" aria-hidden="true">
            {weekdays.map((entry) => (
              <span key={`${entry.weekday}-label`} className="historic-seasonality__weekday historic-seasonality__weekday--enabled">
                {entry.short}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function NormalDistributionChart({ curve }: { curve: ReturnType<typeof buildNormalCurve> }) {
  return (
    <svg className="historic-metric-chart" viewBox="0 0 120 48" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="historic-metric-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(73,255,162,0.82)" />
          <stop offset="100%" stopColor="rgba(73,255,162,0.05)" />
        </linearGradient>
      </defs>
      {curve.guides.map((guide) => (
        <g key={guide.key}>
          <line
            x1={guide.x}
            y1="8"
            x2={guide.x}
            y2="42"
            stroke="rgba(196, 255, 224, 0.14)"
            strokeWidth="0.8"
            strokeDasharray="2 2"
          />
          {guide.coverageLabel ? (
            <text
              x={guide.x}
              y="6"
              fill="rgba(196, 255, 224, 0.34)"
              fontSize="4.2"
              fontFamily="IBM Plex Mono, monospace"
              textAnchor="middle"
            >
              {guide.coverageLabel}
            </text>
          ) : null}
          {guide.sigmaLabel ? (
            <text
              x={guide.x}
              y="46"
              fill="rgba(196, 255, 224, 0.32)"
              fontSize="4.4"
              fontFamily="IBM Plex Mono, monospace"
              textAnchor="middle"
            >
              {guide.sigmaLabel}
            </text>
          ) : null}
        </g>
      ))}
      <path d={curve.areaPath} fill="url(#historic-metric-fill)" />
      <path d={curve.linePath} fill="none" stroke="#49ffa2" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function buildNormalCurve(stat?: HistoricStat) {
  const width = 120
  const baseline = 42
  const mean = stat?.mean
  const sigma = stat?.stddev
  const minValue = stat?.min_value
  const maxValue = stat?.max_value

  if (
    mean === null ||
    mean === undefined ||
    sigma === null ||
    sigma === undefined ||
    Number.isNaN(mean) ||
    Number.isNaN(sigma) ||
    sigma <= 0
  ) {
    return {
      linePath: `M 6 ${baseline - 2} L ${width - 6} ${baseline - 2}`,
      areaPath: `M 6 ${baseline} L ${width - 6} ${baseline} L ${width - 6} ${baseline - 2} L 6 ${baseline - 2} Z`,
      guides: [] as Array<{ key: string; x: number; sigmaLabel?: string; coverageLabel?: string }>,
    }
  }

  const left = Math.min(minValue ?? mean - sigma * 3, mean - sigma * 3)
  const right = Math.max(maxValue ?? mean + sigma * 3, mean + sigma * 3)
  const domain = right - left || 1
  const samples = 28
  const points = Array.from({ length: samples }, (_, index) => {
    const t = index / (samples - 1)
    const xValue = left + domain * t
    const z = (xValue - mean) / sigma
    const density = Math.exp(-0.5 * z * z)
    const x = 6 + t * (width - 12)
    const y = baseline - density * 26
    return { x, y }
  })

  const linePath = `M ${points.map((point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' L ')}`
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${baseline} L ${points[0].x.toFixed(2)} ${baseline} Z`
  const guides = [-3, -2, -1, 1, 2, 3].map((sigmaOffset) => {
    const value = mean + sigma * sigmaOffset
    const x = 6 + ((value - left) / domain) * (width - 12)
    const absSigma = Math.abs(sigmaOffset)
    return {
      key: `${sigmaOffset}`,
      x: Math.max(6, Math.min(width - 6, x)),
      sigmaLabel: `${sigmaOffset > 0 ? '' : '-'}${absSigma}σ`,
      coverageLabel: coverageForSigma(absSigma),
    }
  })

  return {
    linePath,
    areaPath,
    guides,
  }
}

function coverageForSigma(value: number) {
  switch (value) {
    case 1:
      return '68%'
    case 2:
      return '95%'
    case 3:
      return '99%'
    default:
      return undefined
  }
}

function classifyAsymmetryProxy(stat?: HistoricStat) {
  const minValue = stat?.min_value
  const maxValue = stat?.max_value
  const mean = stat?.mean
  if (
    minValue === null ||
    minValue === undefined ||
    maxValue === null ||
    maxValue === undefined ||
    mean === null ||
    mean === undefined
  ) {
    return 'N/A'
  }

  const leftSpan = mean - minValue
  const rightSpan = maxValue - mean
  const total = leftSpan + rightSpan
  if (!Number.isFinite(total) || total <= 0) {
    return 'Flat'
  }

  const bias = (rightSpan - leftSpan) / total
  if (bias > 0.18) {
    return 'Right'
  }
  if (bias < -0.18) {
    return 'Left'
  }
  return 'Balanced'
}

function classifyTailProxy(stat?: HistoricStat) {
  const minValue = stat?.min_value
  const maxValue = stat?.max_value
  const sigma = stat?.stddev
  if (
    minValue === null ||
    minValue === undefined ||
    maxValue === null ||
    maxValue === undefined ||
    sigma === null ||
    sigma === undefined ||
    sigma <= 0
  ) {
    return 'N/A'
  }

  const spanRatio = (maxValue - minValue) / (sigma * 6)
  if (spanRatio > 1.35) {
    return 'Wide'
  }
  if (spanRatio < 0.85) {
    return 'Tight'
  }
  return 'Mid'
}

function buildWeekdaySeasonality(profile?: SeasonalityProfile) {
  const weeklyProfile = profile?.weekly_profile ?? {}
  const weekdayMeta = [
    { weekday: '1', short: 'M', label: 'Monday' },
    { weekday: '2', short: 'T', label: 'Tuesday' },
    { weekday: '3', short: 'W', label: 'Wednesday' },
    { weekday: '4', short: 'T', label: 'Thursday' },
    { weekday: '5', short: 'F', label: 'Friday' },
  ]

  return weekdayMeta.map((meta) => {
    const hours = weeklyProfile[meta.weekday]?.hours ?? {}
    const deltaSamples = Object.values(hours).reduce((sum, bucket) => sum + sanitizeNumber(bucket?.delta_samples), 0)
    return {
      ...meta,
      deltaSamples,
    }
  })
}

function sanitizeNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 0
  }
  return value
}
