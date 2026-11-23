import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  readAnalyticsSymbolOrder,
  writeAnalyticsSymbolOrder,
} from '../../../shared/config/storage'
import { StatusState } from '../../../shared/ui/StatusState'
import { Tabs } from '../../../shared/ui/Tabs'
import { AnalyticsFilters, AnalyticsHero } from '../components/AnalyticsHero'
import { DailyClosingPanel } from '../components/DailyClosingPanel'
import { DiagnosticsPanel } from '../components/DiagnosticsPanel'
import { OverviewPanel } from '../components/OverviewPanel'
import {
  primeDailyClosingCache,
  useAnalyticsSnapshots,
  useDailyClosingSnapshots,
} from '../hooks/useAnalytics'
import { useDailyOrderPositionTimeline } from '../hooks/useDailyOrderPositionTimeline'
import { usePaperworkAuth } from '../../paperwork/auth/usePaperworkAuth'
import { PaperworkAccessGate } from '../../paperwork/components/PaperworkAccessGate'
import { PaperworkPanel } from '../../paperwork/components/PaperworkPanel'
import { usePaperworkAnalytics } from '../../paperwork/hooks/usePaperworkAnalytics'
import { useActiveIssuers } from '../../issuers/hooks/useActiveIssuers'
import { MarketTape } from '../../market-tape/components/MarketTape'
import type { AnalyticsSymbolFeed } from '../api/schemas'
import {
  buildHistoricTransversalExportText,
  downloadHistoricPromptFile,
  filterHistoricRecordsByRange,
} from '../lib/historicOpenAiPrompt'
import { rankCoreSymbols, type CoreSortIntent } from '../lib/coreSymbolSorting'
import { deriveFreshnessTone } from '../lib/freshness'

// Benchmark Stats is disabled: not listed, not reachable, not rendered.
const topTabs = ['Overview', 'Historic', 'User Guide', 'Paperwork'] as const
const visibleTopTabs = topTabs.filter((tab) => tab !== 'User Guide')
const MIN_OVERVIEW_SAMPLE_COUNT = 10
const historicRangeOptions = [365, 180, 90, 30, 15, 7] as const
type HistoricRangeDays = (typeof historicRangeOptions)[number]
const DEFAULT_HISTORIC_RANGE_DAYS: HistoricRangeDays = 365

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

const EMPTY_SYMBOLS: string[] = []

export function AnalyticsPage() {
  const queryClient = useQueryClient()
  // Active issuers are the single source of truth for which symbols every tab shows and requests.
  const issuersQuery = useActiveIssuers()
  const symbols = issuersQuery.data?.symbols ?? EMPTY_SYMBOLS
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([])
  const [symbolOrder, setSymbolOrder] = useState<string[]>(() => readAnalyticsSymbolOrder())
  const [coreSortIntent, setCoreSortIntent] = useState<CoreSortIntent>('manual')
  const [activeTab, setActiveTab] = useState<(typeof topTabs)[number]>(() => resolveInitialTopTab())
  // Each Historic chart keeps its own range (7D, 30D, …); changing one never affects the others.
  const [historicRangeBySymbol, setHistoricRangeBySymbol] = useState<Record<string, HistoricRangeDays>>({})
  const [selectedPaperworkYear, setSelectedPaperworkYear] = useState<string | null>(null)
  const activeIssuerSymbols = symbols.length > 0 ? symbols : []
  const orderedIssuerSymbols =
    symbolOrder.length > 0
      ? [
          ...symbolOrder.filter((symbol) => activeIssuerSymbols.includes(symbol)),
          ...activeIssuerSymbols.filter((symbol) => !symbolOrder.includes(symbol)),
        ]
      : activeIssuerSymbols
  const querySelectedSymbols =
    selectedSymbols.length > 0
      ? orderedIssuerSymbols.filter((symbol) => selectedSymbols.includes(symbol))
      : orderedIssuerSymbols

  const snapshotsQuery = useAnalyticsSnapshots(querySelectedSymbols)
  const dailyClosingQuery = useDailyClosingSnapshots(querySelectedSymbols, activeTab === 'Historic')
  const eligibleOverviewResults = useMemo(
    () => snapshotsQuery.results.filter((result) => resolveOverviewSampleCount(result) >= MIN_OVERVIEW_SAMPLE_COUNT),
    [snapshotsQuery.results],
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
    if (typeof window === 'undefined') {
      return
    }

    const url = new URL(window.location.href)
    const requestedTab = url.searchParams.get('tab')?.toLowerCase()
    if (requestedTab !== 'paperwork') {
      return
    }

    url.searchParams.delete('tab')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }, [])

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
  const overviewEligibleSymbols = useMemo(
    () => orderedEligibleOverviewResults.map((result) => result.symbol),
    [orderedEligibleOverviewResults],
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

  useEffect(() => {
    if (activeTab !== 'Overview' || overviewEligibleSymbols.length === 0) {
      return
    }

    void primeDailyClosingCache(queryClient, overviewEligibleSymbols)
  }, [activeTab, overviewEligibleSymbols, queryClient])

  const paperworkAuthQuery = usePaperworkAuth(activeTab === 'Paperwork' || activeTab === 'Historic')
  const dailyOrderTimelineQuery = useDailyOrderPositionTimeline(
    orderedDailyClosingResults,
    activeTab === 'Historic',
    paperworkAuthQuery.data?.user?.email ?? null,
  )
  const paperworkAnalyticsQuery = usePaperworkAnalytics(
    activeTab === 'Paperwork' ? paperworkAuthQuery.data?.user?.email ?? null : null,
    selectedPaperworkYear,
  )

  useEffect(() => {
    const [latestYear] = paperworkAnalyticsQuery.availableYears
    if (!latestYear) {
      if (selectedPaperworkYear !== null) {
        setSelectedPaperworkYear(null)
      }
      return
    }

    if (!selectedPaperworkYear || !paperworkAnalyticsQuery.availableYears.includes(selectedPaperworkYear)) {
      setSelectedPaperworkYear(latestYear)
    }
  }, [paperworkAnalyticsQuery.availableYears, selectedPaperworkYear])

  const eligibleOverviewSymbolSet = useMemo(
    () => new Set(orderedEligibleOverviewResults.map((result) => result.symbol)),
    [orderedEligibleOverviewResults],
  )

  const coreVisibleSymbols = useMemo(
    () => rankedSymbolOrder.filter((symbol) => eligibleOverviewSymbolSet.has(symbol)),
    [rankedSymbolOrder, eligibleOverviewSymbolSet],
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

  const handleCoreSortIntentChange = (nextIntent: CoreSortIntent) => {
    if (nextIntent === coreSortIntent) {
      return
    }

    if (nextIntent === 'manual') {
      freezeCurrentCoreOrder()
    }

    setCoreSortIntent(nextIntent)
  }

  const hasIssuerData = symbols.length > 0
  const hasSnapshotData = snapshotsQuery.results.length > 0
  const hasDailyClosingData = dailyClosingQuery.results.some((window) => window.records.length > 0)
  const visibleHistoricWindows = useMemo(
    () =>
      orderedDailyClosingResults
        .map((window) => ({
          ...window,
          records: filterHistoricRecordsByRange(window.records, historicRangeBySymbol[window.symbol] ?? DEFAULT_HISTORIC_RANGE_DAYS),
        }))
        .filter((window) => window.records.length > 0),
    [historicRangeBySymbol, orderedDailyClosingResults],
  )
  // The export names a single range: the widest one in use across the visible charts.
  const historicExportRangeDays = visibleHistoricWindows.reduce(
    (widest, window) => Math.max(widest, historicRangeBySymbol[window.symbol] ?? DEFAULT_HISTORIC_RANGE_DAYS),
    0,
  ) || DEFAULT_HISTORIC_RANGE_DAYS
  const handleHistoricRangeChange = (symbol: string, rangeDays: HistoricRangeDays) =>
    setHistoricRangeBySymbol((current) => ({ ...current, [symbol]: rangeDays }))

  const issuersDegraded = issuersQuery.isError && hasIssuerData
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

    if (issuersQuery.isLoading && !hasIssuerData) {
      return {
        label: 'Loading',
        tone: 'loading' as const,
      }
    }

    if (activeTab === 'Overview') {
      if (snapshotsQuery.isLoading && !hasSnapshotData) {
        return {
          label: 'Loading',
          tone: 'loading' as const,
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

      if (dailyClosingDegraded) {
        return {
          label: 'Degraded',
          tone: 'degraded' as const,
        }
      }
    }

    if (issuersQuery.isFetching) {
      return {
        label: 'Syncing',
        tone: 'fetching' as const,
      }
    }

    if (issuersDegraded && !hasSnapshotData && !hasDailyClosingData) {
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
    issuersDegraded,
    issuersQuery.isFetching,
    issuersQuery.isLoading,
    dailyClosingDegraded,
    dailyClosingQuery.isLoading,
    hasIssuerData,
    hasDailyClosingData,
    hasSnapshotData,
    snapshotDegraded,
    snapshotsQuery.isLoading,
  ])

  const handleHistoricExport = () => {
    try {
      const exportText = buildHistoricTransversalExportText({
        rangeDays: historicExportRangeDays,
        exportedAt: new Date().toISOString(),
        windows: visibleHistoricWindows,
        orderTimelineBySymbol: dailyOrderTimelineQuery.bySymbol,
      })
      downloadHistoricPromptFile(window, exportText, historicExportRangeDays)
    } catch {
      // Keep the interaction quiet; browser download UX is enough here.
    }
  }

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
        latestBySymbol={coreLatestBySymbol}
        symbols={coreVisibleSymbols}
        sortIntent={coreSortIntent}
        onSymbolOrderChange={handleCoreSymbolOrderChange}
        onSortIntentChange={handleCoreSortIntentChange}
      />

      {issuersQuery.isError && !hasIssuerData ? (
        <StatusState
          tone="error"
          title="Issuers Request Failed"
          description={getErrorMessage(issuersQuery.error)}
        />
      ) : null}

      <div className="analytics-tabbar">
        <Tabs items={visibleTopTabs} active={activeTab} onChange={setActiveTab} />
        {activeTab === 'Historic' ? (
          <div className="analytics-tabbar__actions" aria-label="Historic actions">
            <button
              type="button"
              className="analytics-tabbar__actionButton"
              onClick={handleHistoricExport}
              disabled={visibleHistoricWindows.length === 0}
            >
              Análisis técnico
            </button>
          </div>
        ) : null}
      </div>

      <section className={`analytics-stage${activeTab === 'Paperwork' ? ' analytics-stage--scroll' : ''}`}>
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
            />
          )
        ) : null}

        {activeTab === 'User Guide' ? (
          <DiagnosticsPanel />
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
            <DailyClosingPanel
              windows={orderedDailyClosingResults}
              rangeBySymbol={historicRangeBySymbol}
              defaultRangeDays={DEFAULT_HISTORIC_RANGE_DAYS}
              onChangeRangeDays={handleHistoricRangeChange}
              orderTimelineBySymbol={dailyOrderTimelineQuery.bySymbol}
            />
          )
        ) : null}

        {activeTab === 'Historic' ? (
          <p className="historic-gap-note">
            Nov 9–20 omitted: a capture extension issue left those days without prices. Resolved Nov 23.
          </p>
        ) : null}

        {activeTab === 'Paperwork' ? (
          <PaperworkAccessGate
            session={paperworkAuthQuery.data}
            isLoading={paperworkAuthQuery.isLoading}
            errorMessage={paperworkAuthQuery.data?.message ?? resolvePaperworkAuthMessage(paperworkAuthQuery.error)}
          >
            <PaperworkPanel
              authenticatedUserEmail={paperworkAuthQuery.data?.user?.email ?? null}
              analyticsQuery={paperworkAnalyticsQuery}
              selectedYear={selectedPaperworkYear}
              onYearChange={setSelectedPaperworkYear}
            />
          </PaperworkAccessGate>
        ) : null}
      </section>
    </main>
  )
}

function resolvePaperworkAuthMessage(error: unknown) {
  if (typeof window === 'undefined') {
    return error ? getErrorMessage(error) : null
  }

  const authError = new URL(window.location.href).searchParams.get('auth_error')
  if (authError === 'forbidden') {
    return 'This GitHub account is not allowed to access Paperwork.'
  }

  if (authError === 'email') {
    return 'This GitHub account must expose an email address to access Paperwork.'
  }

  if (authError === 'state') {
    return 'The GitHub sign-in could not be validated. Please try again.'
  }

  if (authError === 'github') {
    return 'GitHub sign-in failed. Please try again.'
  }

  return error ? getErrorMessage(error) : null
}

function resolveInitialTopTab(): (typeof topTabs)[number] {
  if (typeof window === 'undefined') {
    return 'Overview'
  }

  const tab = new URL(window.location.href).searchParams.get('tab')?.toLowerCase()
  return tab === 'paperwork' ? 'Paperwork' : 'Overview'
}
