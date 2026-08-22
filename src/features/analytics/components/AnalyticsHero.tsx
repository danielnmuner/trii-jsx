import clsx from 'clsx'
import { formatTimestamp } from '../lib/formatters'

type AnalyticsHeroProps = {
  from?: string
  isFetching: boolean
  lastUpdatedAt: number
  recordCount: number
  symbolCount: number
  to?: string
}

export function AnalyticsHero({
  from,
  isFetching,
  lastUpdatedAt,
  recordCount,
  symbolCount,
  to,
}: AnalyticsHeroProps) {
  return (
    <section className="analytics-topbar">
      <div className="analytics-topbar__title">
        <span className="analytics-topbar__eyebrow">Realtime desk</span>
        <h1>Analytics</h1>
      </div>

      <div className="analytics-topbar__meta" aria-label="Market context">
        <span>{symbolCount} sym</span>
        <span>{recordCount} ticks</span>
        <span>{from ? `From ${formatTimestamp(from)}` : 'From n/a'}</span>
        <span>{to ? `To ${formatTimestamp(to)}` : 'To n/a'}</span>
        <span>{lastUpdatedAt > 0 ? `Sync ${formatTimestamp(new Date(lastUpdatedAt).toISOString())}` : 'Sync n/a'}</span>
        <span className={clsx('analytics-topbar__status', isFetching ? 'is-fetching' : 'is-live')}>
          {isFetching ? 'Syncing' : 'Live'}
        </span>
      </div>
    </section>
  )
}

type AnalyticsFiltersProps = {
  selectedSymbols: string[]
  symbols: string[]
  onSelectedSymbolsChange: (symbols: string[]) => void
}

export function AnalyticsFilters({ selectedSymbols, symbols, onSelectedSymbolsChange }: AnalyticsFiltersProps) {
  const toggleCoreSymbol = (symbol: string) => {
    const isSelected = selectedSymbols.includes(symbol)
    const nextSymbols = isSelected ? selectedSymbols.filter((item) => item !== symbol) : [...selectedSymbols, symbol]
    onSelectedSymbolsChange(nextSymbols.length > 0 ? nextSymbols : [symbol])
  }

  return (
    <section className="analytics-filterbar" aria-label="Primary filters">
      <div className="analytics-filterbar__group analytics-filterbar__group--core">
        <span className="analytics-filterbar__label">Core</span>
        <div className="symbol-chip-row">
          {symbols.map((symbol) => (
            <button
              key={`core-${symbol}`}
              type="button"
              className={clsx('symbol-chip', selectedSymbols.includes(symbol) && 'symbol-chip--selected')}
              aria-pressed={selectedSymbols.includes(symbol)}
              onClick={() => toggleCoreSymbol(symbol)}
            >
              {symbol}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
