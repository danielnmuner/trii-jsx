import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { fetchStockOrdersByCreatedMonth } from '../api/client'
import { ANALYTICS_REALTIME_REFETCH_MS } from '../../analytics/config'

const ORDER_TRACE_LIMIT = 500
const ORDER_TRACE_MONTH_WINDOW = 3
const BOGOTA_TIMEZONE = 'America/Bogota'

export function useOrderTraceability(symbols: string[], userName: string | null) {
  const activeSymbols = useMemo(
    () => Array.from(new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))),
    [symbols],
  )
  const createdMonths = useMemo(() => getRecentCreatedMonths(ORDER_TRACE_MONTH_WINDOW), [])

  const queries = useQueries({
    queries: createdMonths.map((createdMonth) => ({
      queryKey: ['paperwork', 'orders-trace', userName, createdMonth],
      queryFn: async () => {
        const response = await fetchStockOrdersByCreatedMonth(createdMonth, ORDER_TRACE_LIMIT, userName ?? undefined)
        return {
          createdMonth,
          records: response.result.records,
        }
      },
      enabled: Boolean(userName),
      refetchInterval: ANALYTICS_REALTIME_REFETCH_MS,
      refetchIntervalInBackground: true,
    })),
  })

  return useMemo(() => {
    const symbolSet = new Set(activeSymbols)
    const records = queries
      .flatMap((query) => query.data?.records ?? [])
      .filter((record) => {
        const symbol = String(record.symbol ?? '').trim().toUpperCase()
        return Boolean(symbol) && symbolSet.has(symbol)
      })

    return {
      records,
      isLoading: queries.some((query) => query.isLoading),
      isFetching: queries.some((query) => query.isFetching),
      isError: queries.some((query) => query.isError),
      error: queries.find((query) => query.error)?.error ?? null,
    }
  }, [activeSymbols, queries])
}

function getRecentCreatedMonths(count: number) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BOGOTA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
  })
  const parts = formatter.formatToParts(new Date())
  const year = Number(parts.find((part) => part.type === 'year')?.value ?? '0')
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? '0')

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return []
  }

  return Array.from({ length: count }, (_, index) => {
    const monthOffset = month - 1 - index
    const normalizedYear = year + Math.floor(monthOffset / 12)
    const normalizedMonth = ((monthOffset % 12) + 12) % 12
    return `${normalizedYear}-${String(normalizedMonth + 1).padStart(2, '0')}`
  })
}
