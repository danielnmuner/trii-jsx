import { useEffect, useMemo, useState } from 'react'
import {
  readAnalyticsFlowAudioEnabled,
  readAnalyticsSymbolOrder,
  writeAnalyticsFlowAudioEnabled,
  writeAnalyticsSymbolOrder,
} from '../../../shared/config/storage'
import { StatusState } from '../../../shared/ui/StatusState'
import { Tabs } from '../../../shared/ui/Tabs'
import { AnalyticsFilters, AnalyticsHero } from '../components/AnalyticsHero'
import { DailyClosingPanel } from '../components/DailyClosingPanel'
import { DiagnosticsPanel } from '../components/DiagnosticsPanel'
import { HistoricStatsPanel } from '../components/HistoricStatsPanel'
import { OverviewPanel } from '../components/OverviewPanel'
import { ZscoreOpportunityPanel } from '../components/ZscoreOpportunityPanel'
import { useFlowSignalMonitor } from '../hooks/useFlowSignalMonitor'
import { useAnalyticsCatalog, useAnalyticsSnapshots, useDailyClosingSnapshots, useZscoreOpportunityWindows } from '../hooks/useAnalytics'
import { useDailyOrderPositionTimeline } from '../hooks/useDailyOrderPositionTimeline'
import { useOrderPositions } from '../hooks/useOrderPositions'
import { PaperworkPanel } from '../../paperwork/components/PaperworkPanel'
import { MarketTape } from '../../market-tape/components/MarketTape'
import type { AnalyticsSymbolFeed } from '../api/schemas'
import { collectFlowSignalSymbols, rankCoreSymbols, resolveAvailableQuantity, resolveHeldInvestmentValue, type CoreSortIntent } from '../lib/coreSymbolSorting'
import { deriveFreshnessTone } from '../lib/freshness'

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
  const [flowAudioEnabled, setFlowAudioEnabled] = useState<boolean>(() => readAnalyticsFlowAudioEnabled())
  const [coreSortIntent, setCoreSortIntent] = useState<CoreSortIntent>('manual')
  const querySelectedSymbols =
    selectedSymbols.length > 0
      ? symbolOrder.filter((symbol) => selectedSymbols.includes(symbol))
      : symbolOrder.length > 0
        ? symbolOrder
        : symbols
  const [activeTab, setActiveTab] = useState<(typeof topTabs)[number]>('Overview')
  const zscoreTradingDate = catalogQuery.data?.result.trading_date ?? null

  const snapshotsQuery = useAnalyticsSnapshots(querySelectedSymbols)
  const zscoreQuery = useZscoreOpportunityWindows(querySelectedSymbols, zscoreTradingDate, activeTab === 'Opportunities')
  const dailyClosingQuery = useDailyClosingSnapshots(querySelectedSymbols, activeTab === 'Historic')
  const latestZscoreBySymbol = useMemo(
    () =>
      Object.fromEntries(
        zscoreQuery.results.map((window) => [
          window.symbol,
          [...window.records].sort(
            (left, right) => new Date(right.captured_at).getTime() - new Date(left.captured_at).getTime(),
          )[0],
        ]),
      ),
    [zscoreQuery.results],
  )
  const eligibleOverviewResults = useMemo(
    () => snapshotsQuery.results.filter((result) => resolveOverviewSampleCount(result) >= MIN_OVERVIEW_SAMPLE_COUNT),
    [snapshotsQuery.results],
  )
  const orderPositionsQuery = useOrderPositions(
    eligibleOverviewResults.map((result) => result.current_snapshot),
    activeTab === 'Overview',
  )
  const rankedSymbolOrder = useMemo(
    () =>
      rankCoreSymbols({
        baseOrder: symbolOrder,
        latestBySymbol: Object.fromEntries(snapshotsQuery.results.map((result) => [result.symbol, result])),
        orderPositionsBySymbol: orderPositionsQuery.bySymbol,
        intent: coreSortIntent,
      }),
    [coreSortIntent, orderPositionsQuery.bySymbol, snapshotsQuery.results, symbolOrder],
  )
  const effectiveSelectedSymbols =
    selectedSymbols.length > 0
      ? rankedSymbolOrder.filter((symbol) => selectedSymbols.includes(symbol))
      : rankedSymbolOrder.length > 0
        ? rankedSymbolOrder
        : symbols

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

  useEffect(() => {
    writeAnalyticsFlowAudioEnabled(flowAudioEnabled)
  }, [flowAudioEnabled])

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
  const orderedSnapshotResults = useMemo(
    () =>
      effectiveSelectedSymbols.reduce<AnalyticsSymbolFeed[]>((ordered, symbol) => {
        const match = snapshotsQuery.results.find((result) => result.symbol === symbol)
        if (match) {
          ordered.push(match)
        }
        return ordered
      }, []),
    [effectiveSelectedSymbols, snapshotsQuery.results],
  )
  const orderedEligibleOverviewResults = useMemo(
    () =>
      effectiveSelectedSymbols.reduce<AnalyticsSymbolFeed[]>((ordered, symbol) => {
        const match = eligibleOverviewResults.find((result) => result.symbol === symbol)
        if (match) {
          ordered.push(match)
        }
        return ordered
      }, []),
    [effectiveSelectedSymbols, eligibleOverviewResults],
  )
  const orderedZscoreResults = useMemo(
    () =>
      effectiveSelectedSymbols.reduce<typeof zscoreQuery.results>((ordered, symbol) => {
        const match = zscoreQuery.results.find((result) => result.symbol === symbol)
        if (match) {
          ordered.push(match)
        }
        return ordered
      }, []),
    [effectiveSelectedSymbols, zscoreQuery.results],
  )
  const orderedDailyClosingResults = useMemo(
    () =>
      effectiveSelectedSymbols.reduce<typeof dailyClosingQuery.results>((ordered, symbol) => {
        const match = dailyClosingQuery.results.find((result) => result.symbol === symbol)
        if (match) {
          ordered.push(match)
        }
        return ordered
      }, []),
    [dailyClosingQuery.results, effectiveSelectedSymbols],
  )
  const dailyOrderTimelineQuery = useDailyOrderPositionTimeline(orderedDailyClosingResults, activeTab === 'Historic')

  const eligibleOverviewSymbolSet = useMemo(
    () => new Set(orderedEligibleOverviewResults.map((result) => result.symbol)),
    [orderedEligibleOverviewResults],
  )

  const coreVisibleSymbols = useMemo(
    () => rankedSymbolOrder.filter((symbol) => eligibleOverviewSymbolSet.has(symbol)),
    [rankedSymbolOrder, eligibleOverviewSymbolSet],
  )
  const coreHeldSymbols = useMemo(
    () =>
      [...coreVisibleSymbols]
        .filter((symbol) => {
          const positionSummary = orderPositionsQuery.bySymbol[symbol]
          if (positionSummary) {
            return positionSummary.availableQuantity > 0
          }

          const snapshot = snapshotsQuery.results.find((result) => result.symbol === symbol)?.current_snapshot
          const zscoreRecord = latestZscoreBySymbol[symbol]
          return resolveAvailableQuantity(snapshot, zscoreRecord) > 0
        })
        .sort(
          (left, right) =>
            resolveHeldInvestmentValue(orderPositionsQuery.bySymbol[right]) -
            resolveHeldInvestmentValue(orderPositionsQuery.bySymbol[left]),
        ),
    [coreVisibleSymbols, latestZscoreBySymbol, orderPositionsQuery.bySymbol, snapshotsQuery.results],
  )

  const coreLatestBySymbol = useMemo(
    () =>
      Object.fromEntries(
        eligibleOverviewResults.map((result) => [result.symbol, result]),
      ),
    [eligibleOverviewResults],
  )
  const coreFreshnessSummary = useMemo(() => {
    const counts = coreVisibleSymbols.reduce(
      (accumulator, symbol) => {
        const capturedAt = coreLatestBySymbol[symbol]?.current_snapshot?.captured_at
        if (deriveFreshnessTone(capturedAt) === 'fresh') {
          accumulator.fresh += 1
        } else {
          accumulator.stale += 1
        }

        return accumulator
      },
      { fresh: 0, stale: 0 },
    )

    return {
      total: coreVisibleSymbols.length,
      fresh: counts.fresh,
      stale: counts.stale,
    }
  }, [coreLatestBySymbol, coreVisibleSymbols])
  const flowSignalSymbols = useMemo(
    () =>
      collectFlowSignalSymbols({
        symbols: coreVisibleSymbols,
        latestBySymbol: coreLatestBySymbol,
      }),
    [coreLatestBySymbol, coreVisibleSymbols],
  )
  const flowSignalMonitor = useFlowSignalMonitor(flowSignalSymbols, flowAudioEnabled)

  const freezeCurrentCoreOrder = () => {
    setSymbolOrder((currentOrder) => {
      if (
        rankedSymbolOrder.length === currentOrder.length &&
        rankedSymbolOrder.every((symbol, index) => symbol === currentOrder[index])
      ) {
        return currentOrder
      }

      return rankedSymbolOrder
    })
  }

  const handleCoreSymbolOrderChange = (nextVisibleOrder: string[]) => {
    setSymbolOrder((current) => {
      const hiddenSymbols = current.filter((symbol) => !eligibleOverviewSymbolSet.has(symbol))
      return [...nextVisibleOrder, ...hiddenSymbols]
    })
  }

  const handleOwnedSymbolsSelect = () => {
    if (coreHeldSymbols.length === 0) {
      return
    }

    handleCoreSortIntentChange('held')
  }

  const handleCoreSortIntentChange = (nextIntent: CoreSortIntent) => {
    if (nextIntent === coreSortIntent) {
      return
    }

    if (nextIntent === 'manual' || nextIntent === 'held') {
      freezeCurrentCoreOrder()
    }

    setCoreSortIntent(nextIntent)
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
        flowAudioEnabled={flowAudioEnabled}
        from={summary.from}
        onFlowAudioToggle={() => setFlowAudioEnabled((current) => !current)}
        stockSummary={coreFreshnessSummary}
        to={summary.to}
      />

      <AnalyticsFilters
        flowSignalCount={flowSignalMonitor.activeCount}
        orderedSymbols={coreVisibleSymbols}
        heldSymbols={coreHeldSymbols}
        latestBySymbol={coreLatestBySymbol}
        symbols={coreVisibleSymbols}
        sortIntent={coreSortIntent}
        onSymbolOrderChange={handleCoreSymbolOrderChange}
        onSortIntentChange={handleCoreSortIntentChange}
        onOwnedSymbolsSelect={handleOwnedSymbolsSelect}
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
            <OverviewPanel snapshots={orderedEligibleOverviewResults} orderPositionsBySymbol={orderPositionsQuery.bySymbol} />
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
            <HistoricStatsPanel snapshots={orderedSnapshotResults} />
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
            <ZscoreOpportunityPanel windows={orderedZscoreResults} />
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
            <DailyClosingPanel windows={orderedDailyClosingResults} orderTimelineBySymbol={dailyOrderTimelineQuery.bySymbol} />
          )
        ) : null}

        {activeTab === 'Paperwork' ? (
          <PaperworkPanel symbols={effectiveSelectedSymbols} />
        ) : null}
      </section>
    </main>
  )
}
