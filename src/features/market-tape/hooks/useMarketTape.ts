import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { env } from '../../../shared/config/env'
import { fetchMarketTape, type MarketTapeSnapshot } from '../api/client'
import { MARKET_TAPE_CACHE_TTL_MS } from '../lib/instruments'

const MARKET_TAPE_STORAGE_KEY = 'trii.market-tape.snapshot.v1'
const MARKET_TAPE_REFERENCE_KEY = 'trii.market-tape.reference.v1'
const MARKET_TAPE_SESSION_KEY = 'trii.market-tape.session-fetched.v1'

type StoredMarketTapeSnapshot = {
  updatedAt: number
  snapshot: MarketTapeSnapshot
}

function isValidQuote(value: unknown) {
  if (!value || typeof value !== 'object') {
    return false
  }

  const quote = value as Record<string, unknown>
  return (
    typeof quote.id === 'string' &&
    typeof quote.label === 'string' &&
    typeof quote.assetClass === 'string' &&
    typeof quote.price === 'number' &&
    typeof quote.previousPrice === 'number' &&
    typeof quote.delta === 'number' &&
    typeof quote.deltaPercent === 'number' &&
    typeof quote.asOf === 'string'
  )
}

function readMarketTapeSnapshot(): StoredMarketTapeSnapshot | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const rawValue = window.localStorage.getItem(MARKET_TAPE_STORAGE_KEY)
    if (!rawValue) {
      return null
    }

    const parsedValue: unknown = JSON.parse(rawValue)
    if (!parsedValue || typeof parsedValue !== 'object') {
      return null
    }

    const candidate = parsedValue as Record<string, unknown>
    const updatedAt = typeof candidate.updatedAt === 'number' ? candidate.updatedAt : NaN
    const snapshot = candidate.snapshot

    if (!Number.isFinite(updatedAt) || !snapshot || typeof snapshot !== 'object') {
      return null
    }

    const parsedSnapshot = snapshot as Record<string, unknown>
    if (
      typeof parsedSnapshot.fetchedAt !== 'string' ||
      !Array.isArray(parsedSnapshot.quotes) ||
      !parsedSnapshot.quotes.every(isValidQuote)
    ) {
      return null
    }

    return {
      updatedAt,
      snapshot: parsedSnapshot as unknown as MarketTapeSnapshot,
    }
  } catch {
    return null
  }
}

function readStoredSnapshot(key: string): StoredMarketTapeSnapshot | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const rawValue = window.localStorage.getItem(key)
    if (!rawValue) {
      return null
    }

    const parsedValue: unknown = JSON.parse(rawValue)
    if (!parsedValue || typeof parsedValue !== 'object') {
      return null
    }

    const candidate = parsedValue as Record<string, unknown>
    const updatedAt = typeof candidate.updatedAt === 'number' ? candidate.updatedAt : NaN
    const snapshot = candidate.snapshot

    if (!Number.isFinite(updatedAt) || !snapshot || typeof snapshot !== 'object') {
      return null
    }

    const parsedSnapshot = snapshot as Record<string, unknown>
    if (
      typeof parsedSnapshot.fetchedAt !== 'string' ||
      !Array.isArray(parsedSnapshot.quotes) ||
      !parsedSnapshot.quotes.every(isValidQuote)
    ) {
      return null
    }

    return {
      updatedAt,
      snapshot: parsedSnapshot as unknown as MarketTapeSnapshot,
    }
  } catch {
    return null
  }
}

function writeMarketTapeSnapshot(snapshot: MarketTapeSnapshot) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const currentStored = readStoredSnapshot(MARKET_TAPE_STORAGE_KEY)
    if (currentStored && getBogotaDateKey(currentStored.snapshot.fetchedAt) !== getBogotaDateKey(snapshot.fetchedAt)) {
      window.localStorage.setItem(MARKET_TAPE_REFERENCE_KEY, JSON.stringify(currentStored))
    }

    const payload: StoredMarketTapeSnapshot = {
      updatedAt: Date.now(),
      snapshot,
    }

    window.localStorage.setItem(MARKET_TAPE_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore storage failures so the desk stays usable in restricted browsers.
  }
}

function readMarketTapeReferenceSnapshot() {
  return readStoredSnapshot(MARKET_TAPE_REFERENCE_KEY)
}

function hasMarketTapeSessionFetch() {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return window.sessionStorage.getItem(MARKET_TAPE_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

function markMarketTapeSessionFetch() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.setItem(MARKET_TAPE_SESSION_KEY, '1')
  } catch {
    // Ignore storage failures so the desk stays usable in restricted browsers.
  }
}

export function useMarketTape() {
  const cachedSnapshot = useMemo(() => readMarketTapeSnapshot(), [])
  const referenceSnapshot = useMemo(() => readMarketTapeReferenceSnapshot(), [])
  const sessionFetched = useMemo(() => hasMarketTapeSessionFetch(), [])
  const canFetchMarketTape = !import.meta.env.DEV || Boolean(env.alphaVantageApiKey || env.twelveDataApiKey)

  const query = useQuery({
    queryKey: ['market-tape'],
    queryFn: () => fetchMarketTape(env.alphaVantageApiKey, env.twelveDataApiKey),
    enabled: canFetchMarketTape && !sessionFetched,
    initialData: cachedSnapshot?.snapshot,
    initialDataUpdatedAt: cachedSnapshot?.updatedAt,
    staleTime: MARKET_TAPE_CACHE_TTL_MS,
    gcTime: MARKET_TAPE_CACHE_TTL_MS * 2,
    retry: 1,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const resolvedData = useMemo(() => {
    if (!query.data) {
      return cachedSnapshot?.snapshot
    }

    const comparisonSnapshot =
      referenceSnapshot?.snapshot ??
      (cachedSnapshot?.snapshot && cachedSnapshot.snapshot.fetchedAt !== query.data.fetchedAt
        ? cachedSnapshot.snapshot
        : null)

    if (!comparisonSnapshot) {
      return query.data
    }

    const comparisonQuotes = new Map(comparisonSnapshot.quotes.map((quote) => [quote.id, quote]))
    return {
      ...query.data,
      quotes: query.data.quotes.map((quote) => {
        const comparisonQuote = comparisonQuotes.get(quote.id)
        const hasLiveDelta = quote.previousPrice !== quote.price || quote.delta !== 0 || quote.deltaPercent !== 0
        if (!comparisonQuote || hasLiveDelta) {
          return quote
        }

        const previousPrice = comparisonQuote.price
        const delta = quote.price - previousPrice
        return {
          ...quote,
          previousPrice,
          delta,
          deltaPercent: previousPrice === 0 ? 0 : (delta / previousPrice) * 100,
        }
      }),
    }
  }, [cachedSnapshot?.snapshot, query.data, referenceSnapshot?.snapshot])

  useEffect(() => {
    if (resolvedData) {
      writeMarketTapeSnapshot(resolvedData)
    }

    if (query.status === 'success') {
      markMarketTapeSessionFetch()
    }
  }, [query.status, resolvedData])

  return {
    ...query,
    data: resolvedData,
    hasConfiguredKey: Boolean(env.alphaVantageApiKey || env.twelveDataApiKey),
  }
}

function getBogotaDateKey(value: string) {
  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return value.slice(0, 10)
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(parsedDate)

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}
