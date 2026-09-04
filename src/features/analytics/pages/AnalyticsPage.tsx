import { useEffect, useMemo, useState } from 'react'
import {
  readAnalyticsSymbolOrder,
  writeAnalyticsSymbolOrder,
} from '../../../shared/config/storage'
import { StatusState } from '../../../shared/ui/StatusState'
import { Tabs } from '../../../shared/ui/Tabs'
import { AnalyticsFilters, AnalyticsHero } from '../components/AnalyticsHero'
import { DailyClosingPanel } from '../components/DailyClosingPanel'
import { DiagnosticsPanel } from '../components/DiagnosticsPanel'
import { HistoricStatsPanel } from '../components/HistoricStatsPanel'
import { OverviewPanel } from '../components/OverviewPanel'
import {
  useAnalyticsCatalog,
  useAnalyticsSnapshots,
  useDailyClosingSnapshots,
} from '../hooks/useAnalytics'
import { useDailyOrderPositionTimeline } from '../hooks/useDailyOrderPositionTimeline'
import { useOrderPositions } from '../hooks/useOrderPositions'
import { PaperworkPanel } from '../../paperwork/components/PaperworkPanel'
import { MarketTape } from '../../market-tape/components/MarketTape'
import type { AnalyticsSymbolFeed } from '../api/schemas'
import { rankCoreSymbols, resolveAvailableQuantity, resolveOwnedInvestmentValue, type CoreSortIntent } from '../lib/coreSymbolSorting'
import { deriveFreshnessTone } from '../lib/freshness'

const topTabs = ['Overview', 'Historic', 'Benchmark Stats', 'User Guide', 'Paperwork'] as const
const MIN_OVERVIEW_SAMPLE_COUNT = 10

function getErrorMessage(error: unknown, fallback = 'Unknown error') {
  return error instanceof Error ? error.message : fallback
}

function resolveOverviewSampleCount(snapshot: AnalyticsSymbolFeed) {
  const counts = Object.values(snapshot.current_stats).map((stat) => stat?.sample_count ?? 0)
  return Math.max(0, ...counts)
}

function hasSevereCoverageLoss(loadedCount: number, requestedCount: number, minimumCoverage = 0.5) {
  if (requestedCount <= 0) {
    return false
  }

  return loadedCount / requestedCount < minimumCoverage
}

export function AnalyticsPage() {
  const catalogQuery = useAnalyticsCatalog()
  const symbols = catalogQuery.data?.result.symbols ?? []
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([])
  const [symbolOrder, setSymbolOrder] = useState<string[]>(() => readAnalyticsSymbolOrder())
  const [coreSortIntent, setCoreSortIntent] = useState<CoreSortIntent>('manual')
  const [activeTab, setActiveTab] = useState<(typeof topTabs)[number]>('Overview')
  const catalogReadySymbols = symbols.length > 0 ? symbols : []
  const orderedCatalogSymbols =
    symbolOrder.length > 0
      ? [
          ...symbolOrder.filter((symbol) => catalogReadySymbols.includes(symbol)),
          ...catalogReadySymbols.filter((symbol) => !symbolOrder.includes(symbol)),
        ]
      : catalogReadySymbols
  const querySelectedSymbols =
    selectedSymbols.length > 0
      ? orderedCatalogSymbols.filter((symbol) => selectedSymbols.includes(symbol))
      : orderedCatalogSymbols

  const snapshotsQuery = useAnalyticsSnapshots(querySelectedSymbols)
  const dailyClosingQuery = useDailyClosingSnapshots(querySelectedSymbols, activeTab === 'Historic')
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
        intent: coreSortIntent,
      }),
    [coreSortIntent, snapshotsQuery.results, symbolOrder],
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
  const coreOwnedSymbols = useMemo(
    () =>
      [...coreVisibleSymbols]
        .filter((symbol) => {
          const positionSummary = orderPositionsQuery.bySymbol[symbol]
          if (positionSummary) {
            return positionSummary.availableQuantity > 0
          }

          const snapshot = snapshotsQuery.results.find((result) => result.symbol === symbol)?.current_snapshot
          return resolveAvailableQuantity(snapshot, undefined) > 0
        })
        .sort(
          (left, right) =>
            resolveOwnedInvestmentValue(orderPositionsQuery.bySymbol[right]) -
            resolveOwnedInvestmentValue(orderPositionsQuery.bySymbol[left]),
        ),
    [coreVisibleSymbols, orderPositionsQuery.bySymbol, snapshotsQuery.results],
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
    if (coreOwnedSymbols.length === 0) {
      return
    }

    setSymbolOrder((current) => {
      const visibleSymbols = coreVisibleSymbols
      const ownedSet = new Set(coreOwnedSymbols)
      const orderedVisibleSymbols = [
        ...coreOwnedSymbols,
        ...visibleSymbols.filter((symbol) => !ownedSet.has(symbol)),
      ]
      const hiddenSymbols = current.filter((symbol) => !eligibleOverviewSymbolSet.has(symbol))
      return [...orderedVisibleSymbols, ...hiddenSymbols]
    })
    setCoreSortIntent('manual')
  }

  const handleCoreSortIntentChange = (nextIntent: CoreSortIntent) => {
    if (nextIntent === coreSortIntent) {
      return
    }

    if (nextIntent === 'manual') {
      freezeCurrentCoreOrder()
    }

    setCoreSortIntent(nextIntent)
  }

  const hasCatalogData = symbols.length > 0
  const hasSnapshotData = snapshotsQuery.results.length > 0
  const hasDailyClosingData = dailyClosingQuery.results.some((window) => window.records.length > 0)

  const catalogDegraded = catalogQuery.isError && hasCatalogData
  const snapshotDegraded =
    snapshotsQuery.isError &&
    hasSnapshotData &&
    hasSevereCoverageLoss(snapshotsQuery.results.length, querySelectedSymbols.length)
  const dailyClosingDegraded =
    dailyClosingQuery.isError &&
    hasDailyClosingData &&
    hasSevereCoverageLoss(orderedDailyClosingResults.length, querySelectedSymbols.length)
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

    if (catalogQuery.isFetching && !hasSnapshotData && !hasDailyClosingData) {
      return {
        label: 'Syncing',
        tone: 'fetching' as const,
      }
    }

    if (catalogDegraded && !hasSnapshotData && !hasDailyClosingData) {
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
    snapshotDegraded,
    snapshotsQuery.isFetching,
    snapshotsQuery.isLoading,
  ])

  return (
    <main className="page-shell analytics-workspace">
      <MarketTape />

      <AnalyticsFilters
        headerSummary={
          <AnalyticsHero
            dataStatusLabel={activeDataStatus.label}
            dataStatusTone={activeDataStatus.tone}
            stockSummary={coreFreshnessSummary}
          />
        }
        orderedSymbols={coreVisibleSymbols}
        ownedSymbols={coreOwnedSymbols}
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
            <OverviewPanel
              snapshots={orderedEligibleOverviewResults}
              orderPositionsBySymbol={orderPositionsQuery.bySymbol}
            />
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
