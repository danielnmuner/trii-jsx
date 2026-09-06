import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { fetchDailyClosingSnapshots } from '../../analytics/api/client'
import { fetchInvoicesByIssuedMonth, fetchStockOrdersByCreatedMonth } from '../api/client'
import type { ParsedInvoiceLookupRecord, StockOrdersLookupRecord } from '../api/schemas'
import { buildPaperworkAnalytics, type PaperworkAnalyticsModel } from '../lib/analytics'

const PAPERWORK_ANALYTICS_STALE_MS = Number.POSITIVE_INFINITY
const PAPERWORK_ANALYTICS_GC_MS = Number.POSITIVE_INFINITY
const PAPERWORK_HISTORY_MONTHS = 60
const PAPERWORK_HISTORY_BATCH_SIZE = 6
const PAPERWORK_EMPTY_RUN_STOP = 6

export type PaperworkAnalyticsQueryResult = {
  model: PaperworkAnalyticsModel
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  error: unknown
}

export function usePaperworkAnalytics(userEmail: string | null): PaperworkAnalyticsQueryResult {
  const ordersHistoryQuery = useQuery({
    queryKey: ['paperwork', 'orders', 'history', userEmail],
    queryFn: () => fetchAllOrderHistory(userEmail ?? ''),
    enabled: Boolean(userEmail),
    staleTime: PAPERWORK_ANALYTICS_STALE_MS,
    gcTime: PAPERWORK_ANALYTICS_GC_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const invoicesHistoryQuery = useQuery({
    queryKey: ['paperwork', 'invoices', 'history', userEmail],
    queryFn: () => fetchAllInvoiceHistory(userEmail ?? ''),
    enabled: Boolean(userEmail),
    staleTime: PAPERWORK_ANALYTICS_STALE_MS,
    gcTime: PAPERWORK_ANALYTICS_GC_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const ordersMonthRecords = ordersHistoryQuery.data ?? []
  const invoicesMonthRecords = invoicesHistoryQuery.data ?? []

  const trackedSymbols = useMemo(() => {
    const symbols = ordersMonthRecords
      .map((record) => String(record.symbol ?? '').trim().toUpperCase())
      .filter(Boolean)

    return Array.from(new Set(symbols)).sort((left, right) => left.localeCompare(right))
  }, [ordersMonthRecords])

  const dailyClosingQueries = useQueries({
    queries: trackedSymbols.map((symbol) => ({
      queryKey: ['paperwork', 'daily-closing', symbol],
      queryFn: () => fetchDailyClosingSnapshots(symbol, 1),
      enabled: Boolean(userEmail),
      staleTime: PAPERWORK_ANALYTICS_STALE_MS,
      gcTime: PAPERWORK_ANALYTICS_GC_MS,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    })),
  })

  return useMemo(() => {
    const symbolOrderHistoryBySymbol = trackedSymbols.reduce<Record<string, StockOrdersLookupRecord[]>>((accumulator, symbol) => {
      accumulator[symbol] = ordersMonthRecords.filter((record) => String(record.symbol ?? '').trim().toUpperCase() === symbol)
      return accumulator
    }, {})

    const latestClosingPriceBySymbol = trackedSymbols.reduce<Record<string, number | null>>((accumulator, symbol, index) => {
      const latestRecord = dailyClosingQueries[index]?.data?.result.records?.[0]
      accumulator[symbol] = typeof latestRecord?.last_price === 'number' ? latestRecord.last_price : null
      return accumulator
    }, {})

    const model = buildPaperworkAnalytics({
      ordersMonthRecords,
      invoicesMonthRecords,
      symbolOrderHistoryBySymbol,
      latestClosingPriceBySymbol,
    })

    return {
      model,
      isLoading:
        ordersHistoryQuery.isLoading ||
        invoicesHistoryQuery.isLoading ||
        dailyClosingQueries.some((query) => query.isLoading),
      isFetching:
        ordersHistoryQuery.isFetching ||
        invoicesHistoryQuery.isFetching ||
        dailyClosingQueries.some((query) => query.isFetching),
      isError:
        ordersHistoryQuery.isError ||
        invoicesHistoryQuery.isError ||
        dailyClosingQueries.some((query) => query.isError),
      error:
        ordersHistoryQuery.error ??
        invoicesHistoryQuery.error ??
        dailyClosingQueries.find((query) => query.error)?.error ??
        null,
    }
  }, [dailyClosingQueries, invoicesHistoryQuery.error, invoicesHistoryQuery.isError, invoicesHistoryQuery.isFetching, invoicesHistoryQuery.isLoading, invoicesMonthRecords, ordersHistoryQuery.error, ordersHistoryQuery.isError, ordersHistoryQuery.isFetching, ordersHistoryQuery.isLoading, ordersMonthRecords, trackedSymbols])
}

async function fetchAllOrderHistory(userEmail: string) {
  const months = getRecentPaperworkMonths(PAPERWORK_HISTORY_MONTHS)
  const records: StockOrdersLookupRecord[] = []
  const seenChecksums = new Set<string>()
  let emptyRun = 0

  for (let index = 0; index < months.length; index += PAPERWORK_HISTORY_BATCH_SIZE) {
    const batch = months.slice(index, index + PAPERWORK_HISTORY_BATCH_SIZE)
    const responses = await Promise.all(
      batch.map((month) => fetchStockOrdersByCreatedMonth(month.value, 500, userEmail)),
    )

    let batchCount = 0

    for (const response of responses) {
      for (const record of response.result.records) {
        const checksum = record.record_checksum?.trim()
        if (checksum && seenChecksums.has(checksum)) {
          continue
        }
        if (checksum) {
          seenChecksums.add(checksum)
        }
        records.push(record)
        batchCount += 1
      }
    }

    emptyRun = batchCount === 0 ? emptyRun + batch.length : 0
    if (records.length > 0 && emptyRun >= PAPERWORK_EMPTY_RUN_STOP) {
      break
    }
  }

  return records
}

async function fetchAllInvoiceHistory(userEmail: string) {
  const months = getRecentPaperworkMonths(PAPERWORK_HISTORY_MONTHS)
  const records: ParsedInvoiceLookupRecord[] = []
  const seenInvoices = new Set<string>()
  let emptyRun = 0

  for (let index = 0; index < months.length; index += PAPERWORK_HISTORY_BATCH_SIZE) {
    const batch = months.slice(index, index + PAPERWORK_HISTORY_BATCH_SIZE)
    const responses = await Promise.all(batch.map((month) => fetchInvoicesByIssuedMonth(month.value, userEmail)))

    let batchCount = 0

    for (const response of responses) {
      for (const record of response.result.records) {
        const invoiceUuid = record.invoice_uuid.trim()
        if (seenInvoices.has(invoiceUuid)) {
          continue
        }
        seenInvoices.add(invoiceUuid)
        records.push(record)
        batchCount += 1
      }
    }

    emptyRun = batchCount === 0 ? emptyRun + batch.length : 0
    if (records.length > 0 && emptyRun >= PAPERWORK_EMPTY_RUN_STOP) {
      break
    }
  }

  return records
}

function getRecentPaperworkMonths(count = 3) {
  const anchor = getBogotaCalendarAnchor()

  return Array.from({ length: count }, (_, index) => {
    const target = new Date(anchor.year, anchor.monthIndex - index, 1)
    const value = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`
    return {
      value,
      label: `${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getFullYear()).slice(-2)}`,
    }
  })
}

function getBogotaCalendarAnchor() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())
  const year = Number(parts.find((part) => part.type === 'year')?.value ?? '0')
  const monthIndex = Number(parts.find((part) => part.type === 'month')?.value ?? '1') - 1

  return {
    year,
    monthIndex,
  }
}
