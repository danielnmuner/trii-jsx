import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { fetchInvoicesByIssuedMonth, fetchStockOrdersByCreatedMonth, fetchStockOrdersBySymbol } from '../api/client'
import type { StockOrdersLookupRecord } from '../api/schemas'
import { buildPaperworkAnalytics, inferInvoiceSymbol } from '../lib/analytics'

const PAPERWORK_ANALYTICS_STALE_MS = 60_000

export type PaperworkPeriodOption = {
  value: '1m' | '3m' | '6m' | '12m'
  label: string
  months: number
}

const PAPERWORK_PERIOD_OPTIONS: PaperworkPeriodOption[] = [
  { value: '1m', label: '1M', months: 1 },
  { value: '3m', label: '3M', months: 3 },
  { value: '6m', label: '6M', months: 6 },
  { value: '12m', label: '12M', months: 12 },
]

export function usePaperworkAnalytics(userEmail: string | null, periodMonths: number) {
  const coveredMonths = useMemo(() => getRecentPaperworkMonths(periodMonths), [periodMonths])

  const ordersMonthQueries = useQueries({
    queries: coveredMonths.map((month) => ({
      queryKey: ['paperwork', 'orders', 'month', userEmail, month.value],
      queryFn: () => fetchStockOrdersByCreatedMonth(month.value, 500, userEmail ?? undefined),
      enabled: Boolean(userEmail),
      staleTime: PAPERWORK_ANALYTICS_STALE_MS,
      gcTime: PAPERWORK_ANALYTICS_STALE_MS * 5,
      refetchOnWindowFocus: false,
    })),
  })

  const invoicesMonthQueries = useQueries({
    queries: coveredMonths.map((month) => ({
      queryKey: ['paperwork', 'invoices', 'month', userEmail, month.value],
      queryFn: () => fetchInvoicesByIssuedMonth(month.value, userEmail ?? undefined),
      enabled: Boolean(userEmail),
      staleTime: PAPERWORK_ANALYTICS_STALE_MS,
      gcTime: PAPERWORK_ANALYTICS_STALE_MS * 5,
      refetchOnWindowFocus: false,
    })),
  })

  const ordersMonthRecords = useMemo(
    () => ordersMonthQueries.flatMap((query) => query.data?.result.records ?? []),
    [ordersMonthQueries],
  )

  const invoicesMonthRecords = useMemo(
    () => invoicesMonthQueries.flatMap((query) => query.data?.result.records ?? []),
    [invoicesMonthQueries],
  )

  const trackedSymbols = useMemo(() => {
    const orderSymbols = ordersMonthRecords
      .map((record) => String(record.symbol ?? '').trim().toUpperCase())
      .filter(Boolean)

    const invoiceSymbols = invoicesMonthRecords
      .map((record) => inferInvoiceSymbol(record))
      .filter((symbol): symbol is string => Boolean(symbol))

    return Array.from(new Set([...orderSymbols, ...invoiceSymbols])).sort((left, right) => left.localeCompare(right))
  }, [invoicesMonthRecords, ordersMonthRecords])

  const symbolHistoryQueries = useQueries({
    queries: trackedSymbols.map((symbol) => ({
      queryKey: ['paperwork', 'orders', 'symbol', userEmail, symbol],
      queryFn: () => fetchStockOrdersBySymbol(symbol, 500, userEmail ?? undefined),
      enabled: Boolean(userEmail),
      staleTime: PAPERWORK_ANALYTICS_STALE_MS,
      gcTime: PAPERWORK_ANALYTICS_STALE_MS * 5,
      refetchOnWindowFocus: false,
    })),
  })

  return useMemo(() => {
    const symbolOrderHistoryBySymbol = trackedSymbols.reduce<Record<string, StockOrdersLookupRecord[]>>((accumulator, symbol, index) => {
      accumulator[symbol] = symbolHistoryQueries[index]?.data?.result.records ?? []
      return accumulator
    }, {})

    const model = buildPaperworkAnalytics({
      ordersMonthRecords,
      invoicesMonthRecords,
      symbolOrderHistoryBySymbol,
    })

    return {
      coveredMonths,
      model,
      isLoading:
        ordersMonthQueries.some((query) => query.isLoading) ||
        invoicesMonthQueries.some((query) => query.isLoading) ||
        symbolHistoryQueries.some((query) => query.isLoading),
      isFetching:
        ordersMonthQueries.some((query) => query.isFetching) ||
        invoicesMonthQueries.some((query) => query.isFetching) ||
        symbolHistoryQueries.some((query) => query.isFetching),
      isError:
        ordersMonthQueries.some((query) => query.isError) ||
        invoicesMonthQueries.some((query) => query.isError) ||
        symbolHistoryQueries.some((query) => query.isError),
      error:
        ordersMonthQueries.find((query) => query.error)?.error ??
        invoicesMonthQueries.find((query) => query.error)?.error ??
        symbolHistoryQueries.find((query) => query.error)?.error ??
        null,
    }
  }, [coveredMonths, invoicesMonthQueries, invoicesMonthRecords, ordersMonthQueries, ordersMonthRecords, symbolHistoryQueries, trackedSymbols])
}

export function getPaperworkPeriodOptions() {
  return PAPERWORK_PERIOD_OPTIONS
}

export function getRecentPaperworkMonths(count = 3) {
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
