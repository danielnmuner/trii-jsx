import { useEffect, useMemo, useState } from 'react'
import { readAnalyticsSymbolOrder, writeAnalyticsSymbolOrder } from '../../../shared/config/storage'
import { StatusState } from '../../../shared/ui/StatusState'
import { Tabs } from '../../../shared/ui/Tabs'
import { AnalyticsFilters, AnalyticsHero } from '../components/AnalyticsHero'
import { DailyClosingPanel } from '../components/DailyClosingPanel'
import { DiagnosticsPanel } from '../components/DiagnosticsPanel'
import { HistoricStatsPanel } from '../components/HistoricStatsPanel'
import { OverviewPanel } from '../components/OverviewPanel'
import { ZscoreOpportunityPanel } from '../components/ZscoreOpportunityPanel'
import { useAnalyticsCatalog, useAnalyticsSnapshots, useDailyClosingSnapshots, useZscoreOpportunityWindows } from '../hooks/useAnalytics'
import { PaperworkPanel } from '../../paperwork/components/PaperworkPanel'
import { MarketTape } from '../../market-tape/components/MarketTape'
import type { AnalyticsSymbolFeed } from '../api/schemas'

const topTabs = ['Overview', 'Opportunities', 'Historic', 'Benchmark Stats', 'User Guide', 'Paperwork'] as const
const MIN_OVERVIEW_SAMPLE_COUNT = 10

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

function getErrorMessage(error: unknown, fallback = 'Unknown error') {
  return error instanceof Error ? error.message : fallback
}

function resolveOverviewSampleCount(snapshot: AnalyticsSymbolFeed) {
  const counts = Object.values(snapshot.current_stats).map((stat) => stat?.sample_count ?? 0)
  return Math.max(0, ...counts)
}

export function AnalyticsPage() {
  const catalogQuery = useAnalyticsCatalog()
  const symbols = catalogQuery.data?.result.symbols ?? []
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([])
  const [symbolOrder, setSymbolOrder] = useState<string[]>(() => readAnalyticsSymbolOrder())
  const effectiveSelectedSymbols =
    selectedSymbols.length > 0
      ? symbolOrder.filter((symbol) => selectedSymbols.includes(symbol))
      : symbolOrder.length > 0
        ? symbolOrder
        : symbols
  const [activeTab, setActiveTab] = useState<(typeof topTabs)[number]>('Overview')
  const zscoreTradingDate = catalogQuery.data?.result.trading_date ?? null

  const snapshotsQuery = useAnalyticsSnapshots(effectiveSelectedSymbols)
  const zscoreQuery = useZscoreOpportunityWindows(effectiveSelectedSymbols, zscoreTradingDate)
  const dailyClosingQuery = useDailyClosingSnapshots(effectiveSelectedSymbols)

  useEffect(() => {
    if (symbolOrder.length === 0 && symbols.length > 0) {
      setSymbolOrder(symbols)
    }
  }, [symbolOrder.length, symbols])

  useEffect(() => {
    if (selectedSymbols.length === 0 && symbols.length > 0) {
      setSelectedSymbols(symbols)
    }
  }, [selectedSymbols.length, symbols])

  useEffect(() => {
    if (symbols.length === 0) {
      return
    }

    setSymbolOrder((currentOrder) => {
      const knownSymbols = currentOrder.filter((symbol) => symbols.includes(symbol))
      const newSymbols = symbols.filter((symbol) => !knownSymbols.includes(symbol))
      const nextOrder = [...knownSymbols, ...newSymbols]

      return nextOrder.length === currentOrder.length && nextOrder.every((symbol, index) => symbol === currentOrder[index])
        ? currentOrder
        : nextOrder
    })
  }, [symbols])

  useEffect(() => {
    if (symbolOrder.length === 0) {
      return
    }

    writeAnalyticsSymbolOrder(symbolOrder)
  }, [symbolOrder])

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

  const eligibleOverviewResults = useMemo(
    () => snapshotsQuery.results.filter((result) => resolveOverviewSampleCount(result) >= MIN_OVERVIEW_SAMPLE_COUNT),
    [snapshotsQuery.results],
  )

  const eligibleOverviewSymbolSet = useMemo(
    () => new Set(eligibleOverviewResults.map((result) => result.symbol)),
    [eligibleOverviewResults],
  )

  const coreVisibleSymbols = useMemo(
    () => symbolOrder.filter((symbol) => eligibleOverviewSymbolSet.has(symbol)),
    [symbolOrder, eligibleOverviewSymbolSet],
  )

  const coreSelectedSymbols = useMemo(
    () => effectiveSelectedSymbols.filter((symbol) => eligibleOverviewSymbolSet.has(symbol)),
    [effectiveSelectedSymbols, eligibleOverviewSymbolSet],
  )

  const coreLatestBySymbol = useMemo(
    () =>
      Object.fromEntries(
        eligibleOverviewResults.map((result) => [result.symbol, result.current_snapshot]),
      ),
    [eligibleOverviewResults],
  )

  const handleCoreSelectedSymbolsChange = (nextVisibleSelectedSymbols: string[]) => {
    setSelectedSymbols((current) => {
      const hiddenSelections = current.filter((symbol) => !eligibleOverviewSymbolSet.has(symbol))
      return [...hiddenSelections, ...nextVisibleSelectedSymbols]
    })
  }

  const handleCoreSymbolOrderChange = (nextVisibleOrder: string[]) => {
    setSymbolOrder((current) => {
      const hiddenSymbols = current.filter((symbol) => !eligibleOverviewSymbolSet.has(symbol))
      return [...nextVisibleOrder, ...hiddenSymbols]
    })
  }

  const hasCatalogData = symbols.length > 0
  const hasSnapshotData = snapshotsQuery.results.length > 0
  const hasZscoreData = zscoreQuery.results.some((window) => window.records.length > 0)
  const hasDailyClosingData = dailyClosingQuery.results.some((window) => window.records.length > 0)

  const catalogDegraded = catalogQuery.isError && hasCatalogData
  const snapshotDegraded = snapshotsQuery.isError && hasSnapshotData
  const zscoreDegraded = zscoreQuery.isError && hasZscoreData
  const dailyClosingDegraded = dailyClosingQuery.isError && hasDailyClosingData
  const activeDataStatus = useMemo(() => {
    if (activeTab === 'Paperwork') {
      return {
        label: 'Ready',
        tone: 'live' as const,
      }
    }

    if (catalogQuery.isLoading && !hasCatalogData) {
      return {
        label: 'Loading',
        tone: 'loading' as const,
      }
    }

    if (activeTab === 'Overview' || activeTab === 'Benchmark Stats') {
      if (snapshotsQuery.isLoading && !hasSnapshotData) {
        return {
          label: 'Loading',
          tone: 'loading' as const,
        }
      }

      if (snapshotsQuery.isFetching) {
        return {
          label: 'Syncing',
          tone: 'fetching' as const,
        }
      }

      if (snapshotDegraded) {
        return {
          label: 'Degraded',
          tone: 'degraded' as const,
        }
      }
    }

    if (activeTab === 'Opportunities') {
      if (zscoreQuery.isLoading && !hasZscoreData) {
        return {
          label: 'Loading',
          tone: 'loading' as const,
        }
      }

      if (zscoreQuery.isFetching) {
        return {
          label: 'Syncing',
          tone: 'fetching' as const,
        }
      }

      if (zscoreDegraded) {
        return {
          label: 'Degraded',
          tone: 'degraded' as const,
        }
      }
    }

    if (activeTab === 'Historic') {
      if (dailyClosingQuery.isLoading && !hasDailyClosingData) {
        return {
          label: 'Loading',
          tone: 'loading' as const,
        }
      }

      if (dailyClosingQuery.isFetching) {
        return {
          label: 'Syncing',
          tone: 'fetching' as const,
        }
      }

      if (dailyClosingDegraded) {
        return {
          label: 'Degraded',
          tone: 'degraded' as const,
        }
      }
    }

    if (catalogQuery.isFetching) {
      return {
        label: 'Syncing',
        tone: 'fetching' as const,
      }
    }

    if (catalogDegraded) {
      return {
        label: 'Degraded',
        tone: 'degraded' as const,
      }
    }

    return {
      label: 'Live',
      tone: 'live' as const,
    }
  }, [
    activeTab,
    catalogDegraded,
    catalogQuery.isLoading,
    dailyClosingDegraded,
    dailyClosingQuery.isFetching,
    dailyClosingQuery.isLoading,
    hasCatalogData,
    hasDailyClosingData,
    hasSnapshotData,
    hasZscoreData,
    snapshotDegraded,
    snapshotsQuery.isFetching,
    snapshotsQuery.isLoading,
    zscoreDegraded,
    zscoreQuery.isFetching,
    zscoreQuery.isLoading,
  ])

  return (
    <main className="page-shell analytics-workspace">
      <MarketTape />

      <AnalyticsHero
        dataStatusLabel={activeDataStatus.label}
        dataStatusTone={activeDataStatus.tone}
        from={summary.from}
        to={summary.to}
      />

      <AnalyticsFilters
        orderedSymbols={coreVisibleSymbols}
        latestBySymbol={coreLatestBySymbol}
        selectedSymbols={coreSelectedSymbols}
        symbols={coreVisibleSymbols}
        onSelectedSymbolsChange={handleCoreSelectedSymbolsChange}
        onSymbolOrderChange={handleCoreSymbolOrderChange}
      />

      {catalogQuery.isError && !hasCatalogData ? (
        <StatusState
          tone="error"
          title="Catalog Request Failed"
          description={getErrorMessage(catalogQuery.error)}
        />
      ) : null}

      <Tabs items={topTabs} active={activeTab} onChange={setActiveTab} />

      <section className="analytics-stage">
        {activeTab === 'Overview' ? (
          !hasSnapshotData && snapshotsQuery.isError ? (
            <StatusState
              tone="error"
              title="Snapshot Request Failed"
              description={getErrorMessage(snapshotsQuery.error)}
            />
          ) : !hasSnapshotData && snapshotsQuery.isLoading ? (
            null
          ) : eligibleOverviewResults.length === 0 ? (
            <StatusState title="No Data" description="No symbols meet the minimum sample support required for overview." />
          ) : (
            <OverviewPanel snapshots={eligibleOverviewResults} />
          )
        ) : null}

        {activeTab === 'User Guide' ? (
          <DiagnosticsPanel />
        ) : null}

        {activeTab === 'Benchmark Stats' ? (
          !hasSnapshotData && snapshotsQuery.isError ? (
            <StatusState
              tone="error"
              title="Historic Stats Request Failed"
              description={getErrorMessage(snapshotsQuery.error)}
            />
          ) : !hasSnapshotData && snapshotsQuery.isLoading ? (
            null
          ) : (
            <HistoricStatsPanel snapshots={snapshotsQuery.results} />
          )
        ) : null}

        {activeTab === 'Opportunities' ? (
          !hasZscoreData && zscoreQuery.isLoading ? (
            null
          ) : !hasZscoreData && zscoreQuery.isError ? (
            <StatusState
              tone="error"
              title="Z-Score Request Failed"
              description={getErrorMessage(zscoreQuery.error)}
            />
          ) : !hasZscoreData ? (
            <StatusState title="No Data" description="No opportunity records are available in the active window for the selected symbols." />
          ) : (
            <ZscoreOpportunityPanel windows={zscoreQuery.results} />
          )
        ) : null}

        {activeTab === 'Historic' ? (
          !hasDailyClosingData && dailyClosingQuery.isLoading ? (
            null
          ) : !hasDailyClosingData && dailyClosingQuery.isError ? (
            <StatusState
              tone="error"
              title="Daily Close Request Failed"
              description={getErrorMessage(dailyClosingQuery.error)}
            />
          ) : dailyClosingQuery.results.length === 0 || dailyClosingQuery.results.every((window) => window.records.length === 0) ? (
            <StatusState title="No Data" description="No daily closing snapshots are available for the selected symbols." />
          ) : (
            <DailyClosingPanel windows={dailyClosingQuery.results} />
          )
        ) : null}

        {activeTab === 'Paperwork' ? (
          <PaperworkPanel symbols={effectiveSelectedSymbols} />
        ) : null}
      </section>
    </main>
  )
}
