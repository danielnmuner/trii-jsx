import { useEffect, useMemo, useState } from 'react'
import { DataTable } from '../../../shared/ui/DataTable'
import { StatusState } from '../../../shared/ui/StatusState'
import { Tabs } from '../../../shared/ui/Tabs'
import { AnalyticsFilters, AnalyticsHero } from '../components/AnalyticsHero'
import { DiagnosticsPanel } from '../components/DiagnosticsPanel'
import { ManualDataPanel } from '../components/ManualDataPanel'
import { OverviewPanel } from '../components/OverviewPanel'
import { useAnalyticsCatalog, useAnalyticsSnapshots, useDailyClosingSnapshots, useZscoreOpportunities } from '../hooks/useAnalytics'
import { normalizeRows } from '../lib/formatters'

const topTabs = ['Overview', 'Z-Score Opportunities', 'Daily Close', 'Diagnostics'] as const

function toIsoBoundaries(values: string[]) {
  const epochValues = values
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value))

  if (epochValues.length === 0) {
    return {
      from: undefined,
      to: undefined,
    }
  }

  return {
    from: new Date(Math.min(...epochValues)).toISOString(),
    to: new Date(Math.max(...epochValues)).toISOString(),
  }
}

export function AnalyticsPage() {
  const catalogQuery = useAnalyticsCatalog()
  const symbols = catalogQuery.data?.result.symbols ?? []
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([])
  const effectiveSelectedSymbols = selectedSymbols.length > 0 ? selectedSymbols : symbols
  const [activeTab, setActiveTab] = useState<(typeof topTabs)[number]>('Overview')
  const [zscoreDateInput, setZscoreDateInput] = useState<string>(new Date().toISOString().slice(0, 10))
  const activeSymbol = effectiveSelectedSymbols[0] ?? ''

  const snapshotsQuery = useAnalyticsSnapshots(effectiveSelectedSymbols)
  const zscoreQuery = useZscoreOpportunities(activeSymbol, zscoreDateInput)
  const dailyClosingQuery = useDailyClosingSnapshots(activeSymbol)

  useEffect(() => {
    if (selectedSymbols.length === 0 && symbols.length > 0) {
      setSelectedSymbols(symbols)
    }
  }, [selectedSymbols.length, symbols])

  const summary = useMemo(() => {
    const timestamps = snapshotsQuery.results
      .flatMap((result) => [result.current_snapshot.captured_at, result.previous_snapshot?.captured_at])
      .filter(Boolean) as string[]
    const boundaries = toIsoBoundaries(timestamps)

    return {
      symbolCount: snapshotsQuery.results.length,
      records: timestamps.length,
      ...boundaries,
    }
  }, [snapshotsQuery.results])

  return (
    <main className="page-shell analytics-workspace">
      <AnalyticsHero
        from={summary.from}
        isFetching={snapshotsQuery.isFetching}
        lastUpdatedAt={snapshotsQuery.lastUpdatedAt}
        recordCount={summary.records}
        symbolCount={summary.symbolCount}
        to={summary.to}
      />

      <AnalyticsFilters
        selectedSymbols={effectiveSelectedSymbols}
        symbols={symbols}
        onSelectedSymbolsChange={setSelectedSymbols}
      />

      {catalogQuery.isLoading ? (
        <StatusState title="Loading Catalog" description="Fetching the available symbols for Analytics." />
      ) : null}

      {catalogQuery.isError ? (
        <StatusState
          tone="error"
          title="Catalog Request Failed"
          description={catalogQuery.error instanceof Error ? catalogQuery.error.message : 'Unknown error'}
        />
      ) : null}

      <Tabs items={topTabs} active={activeTab} onChange={setActiveTab} />

      <section className="analytics-stage">
        {activeTab === 'Overview' ? (
          snapshotsQuery.isError ? (
            <StatusState
              tone="error"
              title="Snapshot Request Failed"
              description={snapshotsQuery.error instanceof Error ? snapshotsQuery.error.message : 'Unknown error'}
            />
          ) : snapshotsQuery.isLoading ? (
            <StatusState title="Loading Overview" description="Fetching current snapshots and historic stats." />
          ) : (
            <OverviewPanel snapshots={snapshotsQuery.results} />
          )
        ) : null}

        {activeTab === 'Diagnostics' ? (
          <DiagnosticsPanel />
        ) : null}

        {activeTab === 'Z-Score Opportunities' ? (
          <ManualDataPanel
            title="Z-Score Opportunities"
            subtitle="Single-day symbol query aligned with the audited Streamlit contract."
            controls={
              <input
                className="date-input"
                type="date"
                value={zscoreDateInput}
                onChange={(event) => setZscoreDateInput(event.target.value)}
              />
            }
            body={
              zscoreQuery.isLoading ? (
                <StatusState title="Loading Z-Scores" description="Fetching opportunities for the selected date." />
              ) : zscoreQuery.isError ? (
                <StatusState
                  tone="error"
                  title="Z-Score Request Failed"
                  description={zscoreQuery.error instanceof Error ? zscoreQuery.error.message : 'Unknown error'}
                />
              ) : (zscoreQuery.data?.result.records.length ?? 0) === 0 ? (
                <StatusState title="No Data" description="No z-score opportunities match the current filters." />
              ) : (
                <DataTable rows={normalizeRows(zscoreQuery.data?.result.records ?? [])} />
              )
            }
          />
        ) : null}

        {activeTab === 'Daily Close' ? (
          <ManualDataPanel
            title="Daily Closing Snapshots"
            subtitle="Realtime daily close history for the active symbol without reloading the core feed."
            body={
              dailyClosingQuery.isLoading ? (
                <StatusState title="Loading Daily Closes" description="Fetching the daily series for the active symbol." />
              ) : dailyClosingQuery.isError ? (
                <StatusState
                  tone="error"
                  title="Daily Close Request Failed"
                  description={dailyClosingQuery.error instanceof Error ? dailyClosingQuery.error.message : 'Unknown error'}
                />
              ) : (dailyClosingQuery.data?.result.records.length ?? 0) === 0 ? (
                <StatusState title="No Data" description="No daily closing snapshots are available for the active symbol." />
              ) : (
                <DataTable rows={normalizeRows(dailyClosingQuery.data?.result.records ?? [])} />
              )
            }
          />
        ) : null}
      </section>
    </main>
  )
}
