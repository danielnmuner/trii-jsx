import type { AnalyticsSymbolFeed } from '../api/schemas'
import { computeCumulativeVwap, computeStatZScore, formatCurrency, formatNumber } from './formatters'

export type DiagnosticTone = 'positive' | 'neutral' | 'warning' | 'danger'

export type DiagnosticItem = {
  title: string
  value: string
  description: string
  tone: DiagnosticTone
}

export function buildExecutionDiagnostics(snapshot: AnalyticsSymbolFeed): DiagnosticItem[] {
  const current = snapshot.current_snapshot
  const spread = current.spread_bps ?? null
  const obiL1 = current.obi_l1 ?? null
  const microDelta = current.depth_weighted_microprice_deviation ?? null
  const vwap = computeCumulativeVwap(current)
  const vwapDelta =
    current.last_price !== null && current.last_price !== undefined && vwap !== null ? current.last_price - vwap : null

  return [
    {
      title: 'Relative spread',
      value: spread === null ? 'n/a' : `${formatNumber(spread)} bps`,
      description:
        spread === null
          ? 'No actionable reading is available yet.'
          : spread <= 30
            ? 'Crossing cost remains compressed.'
            : spread > 150
              ? 'The book is expensive for urgent execution.'
              : 'The spread remains tradable, but without a clear edge.',
      tone: spread === null ? 'neutral' : spread <= 30 ? 'positive' : spread > 150 ? 'danger' : 'warning',
    },
    {
      title: 'Top-of-book pressure',
      value: obiL1 === null ? 'n/a' : formatNumber(obiL1),
      description:
        obiL1 === null
          ? 'Not enough OBI L1 data is available.'
          : obiL1 > 0.6
            ? 'Visible demand is supporting the top of book.'
            : obiL1 < -0.6
              ? 'Visible supply is dominating the book.'
              : 'The top of book looks balanced.',
      tone: obiL1 === null ? 'neutral' : obiL1 > 0.6 ? 'positive' : obiL1 < -0.6 ? 'danger' : 'warning',
    },
    {
      title: 'Microprice vs mid',
      value: microDelta === null ? 'n/a' : formatNumber(microDelta),
      description:
        microDelta === null
          ? 'No reliable deviation is available.'
          : microDelta > 0
            ? 'Visible depth is pushing upward.'
            : microDelta < 0
              ? 'Visible depth is pushing downward.'
              : 'The top of book remains neutral.',
      tone: microDelta === null ? 'neutral' : microDelta > 0 ? 'positive' : microDelta < 0 ? 'danger' : 'warning',
    },
    {
      title: 'Price vs VWAP',
      value: vwapDelta === null ? 'n/a' : formatCurrency(vwapDelta),
      description:
        vwapDelta === null
          ? 'No valid comparison is available.'
          : vwapDelta > 0
            ? 'The market is trading at a premium to flow.'
            : vwapDelta < 0
              ? 'The market is trading at a discount to flow.'
              : 'Price remains aligned with the average.',
      tone: vwapDelta === null ? 'neutral' : vwapDelta > 0 ? 'positive' : vwapDelta < 0 ? 'danger' : 'warning',
    },
  ]
}

export function buildAlertDiagnostics(snapshot: AnalyticsSymbolFeed): DiagnosticItem[] {
  const spreadZ = computeStatZScore(snapshot.current_stats.spread_bps)
  const obi5Z = computeStatZScore(snapshot.current_stats.obi_top_5)
  const volumeZ = computeStatZScore(snapshot.current_stats.traded_volume)
  const valueZ = computeStatZScore(snapshot.current_stats.traded_value)

  return [
    buildZDiagnostic('Z-score spread', spreadZ),
    buildZDiagnostic('Z-score OBI Top 5', obi5Z),
    buildZDiagnostic('Z-score traded volume', volumeZ),
    buildZDiagnostic('Z-score traded value', valueZ),
  ]
}

function buildZDiagnostic(title: string, zScore: number | null): DiagnosticItem {
  return {
    title,
    value: zScore === null ? 'n/a' : `${formatNumber(zScore)}\u03c3`,
    description:
      zScore === null
        ? 'The sample is still too small.'
        : Math.abs(zScore) >= 2
          ? 'The reading is outside its normal range.'
          : 'The reading remains inside its expected range.',
    tone: zScore === null ? 'neutral' : Math.abs(zScore) >= 2 ? 'danger' : 'positive',
  }
}
