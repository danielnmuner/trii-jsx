import { MARKET_TAPE_INSTRUMENTS, MARKET_TAPE_REQUEST_GAP_MS, type MarketTapeAssetClass, type MarketTapeInstrument } from '../lib/instruments'
import { env } from '../../../shared/config/env'

export type MarketTapeQuote = {
  id: string
  label: string
  assetClass: MarketTapeAssetClass
  price: number
  previousPrice: number
  delta: number
  deltaPercent: number
  asOf: string
}

export type MarketTapeSnapshot = {
  fetchedAt: string
  quotes: MarketTapeQuote[]
}

type FxDailyResponse = {
  ['Realtime Currency Exchange Rate']?: {
    ['5. Exchange Rate']?: string
    ['6. Last Refreshed']?: string
  }
  Information?: string
  Note?: string
  ['Error Message']?: string
}

type FxHistoryResponse = {
  ['Time Series FX (Daily)']?: Record<string, {
    ['4. close']?: string
  }>
  Information?: string
  Note?: string
  ['Error Message']?: string
}

type CommoditySpotResponse = {
  timestamp?: string
  price?: string
  Information?: string
  Note?: string
  ['Error Message']?: string
}

type CommoditySeriesResponse = {
  data?: Array<{
    date?: string
    price?: string
    value?: string
  }>
  Information?: string
  Note?: string
  ['Error Message']?: string
}

type TwelveDataQuoteResponse =
  | Record<string, TwelveDataQuoteEntry>
  | TwelveDataQuoteEntry

type TwelveDataQuoteEntry = {
  symbol?: string
  name?: string
  exchange?: string
  datetime?: string
  timestamp?: number
  last_quote_at?: number
  close?: string
  previous_close?: string
  change?: string
  percent_change?: string
  code?: number
  message?: string
  status?: string
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function fetchAlphaVantage<T>(params: URLSearchParams) {
  const response = await fetch(`https://www.alphavantage.co/query?${params.toString()}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  const payload = (await response.json().catch(() => null)) as T | null
  if (!response.ok || !payload) {
    throw new Error('Alpha Vantage request failed.')
  }

  return payload
}

async function fetchMarketTapeFromProxy(): Promise<MarketTapeSnapshot> {
  const response = await fetch('/api/market-tape', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  const payload = (await response.json().catch(() => null)) as MarketTapeSnapshot | { message?: string } | null
  if (!response.ok || !payload || !('quotes' in payload)) {
    const message = payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
      ? payload.message
      : 'Market tape proxy request failed.'
    throw new Error(message)
  }

  return payload
}

async function fetchTwelveDataQuotes(apiKey: string) {
  const symbols = MARKET_TAPE_INSTRUMENTS.map(getTwelveDataSymbol).join(',')
  const params = new URLSearchParams({
    symbol: symbols,
    apikey: apiKey,
  })

  const response = await fetch(`https://api.twelvedata.com/quote?${params.toString()}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  const payload = (await response.json().catch(() => null)) as TwelveDataQuoteResponse | null
  if (!response.ok || !payload) {
    throw new Error('Twelve Data request failed.')
  }

  return payload
}

function assertNoProviderMessage(payload: { Information?: string; Note?: string; ['Error Message']?: string }) {
  const providerMessage = payload.Note || payload.Information || payload['Error Message']
  if (providerMessage) {
    throw new Error(providerMessage)
  }
}

async function fetchFxQuote(instrument: Extract<MarketTapeInstrument, { kind: 'fx' }>, apiKey: string): Promise<MarketTapeQuote> {
  const realtimeParams = new URLSearchParams({
    function: 'CURRENCY_EXCHANGE_RATE',
    from_currency: instrument.fromSymbol,
    to_currency: instrument.toSymbol,
    apikey: apiKey,
  })

  const historyParams = new URLSearchParams({
    function: 'FX_DAILY',
    from_symbol: instrument.fromSymbol,
    to_symbol: instrument.toSymbol,
    outputsize: 'compact',
    apikey: apiKey,
  })

  const [realtimePayload, historyPayload] = await Promise.all([
    fetchAlphaVantage<FxDailyResponse>(realtimeParams),
    fetchAlphaVantage<FxHistoryResponse>(historyParams),
  ])
  assertNoProviderMessage(realtimePayload)
  assertNoProviderMessage(historyPayload)

  const realtime = realtimePayload['Realtime Currency Exchange Rate']
  const currentPrice = Number(realtime?.['5. Exchange Rate'])
  const refreshedAt = realtime?.['6. Last Refreshed']
  const series = historyPayload['Time Series FX (Daily)']
  if (!series) {
    throw new Error(`No FX data returned for ${instrument.label}.`)
  }

  const orderedDates = Object.keys(series).sort((left, right) => right.localeCompare(left))
  const numericSeries = orderedDates
    .map((date) => ({ date, close: Number(series[date]?.['4. close']) }))
    .filter((entry) => Number.isFinite(entry.close))

  if (!Number.isFinite(currentPrice) || numericSeries.length < 1) {
    throw new Error(`Insufficient FX history returned for ${instrument.label}.`)
  }

  const refreshedDate = refreshedAt?.slice(0, 10)
  const previous =
    refreshedDate && numericSeries[0]?.date === refreshedDate
      ? numericSeries[1] ?? numericSeries[0]
      : numericSeries[0]
  const delta = currentPrice - previous.close

  return {
    id: instrument.id,
    label: instrument.label,
    assetClass: instrument.assetClass,
    price: currentPrice,
    previousPrice: previous.close,
    delta,
    deltaPercent: previous.close === 0 ? 0 : (delta / previous.close) * 100,
    asOf: refreshedAt ?? previous.date,
  }
}

async function fetchCommoditySpotQuote(instrument: Extract<MarketTapeInstrument, { kind: 'commodity-spot' }>, apiKey: string): Promise<MarketTapeQuote> {
  const params = new URLSearchParams({
    function: 'GOLD_SILVER_SPOT',
    symbol: instrument.symbol,
    apikey: apiKey,
  })

  const historyParams = new URLSearchParams({
    function: 'GOLD_SILVER_HISTORY',
    symbol: instrument.symbol,
    interval: 'daily',
    apikey: apiKey,
  })

  const [payload, historyPayload] = await Promise.all([
    fetchAlphaVantage<CommoditySpotResponse>(params),
    fetchAlphaVantage<CommoditySeriesResponse>(historyParams),
  ])
  assertNoProviderMessage(payload)
  assertNoProviderMessage(historyPayload)

  const currentPrice = Number(payload.price)
  const refreshedAt = payload.timestamp
  const numericSeries = (historyPayload.data ?? [])
    .map((entry) => ({
      date: entry.date,
      value: Number(entry.price ?? entry.value),
    }))
    .filter((entry): entry is { date: string; value: number } => Boolean(entry.date) && Number.isFinite(entry.value))

  if (!Number.isFinite(currentPrice) || numericSeries.length === 0) {
    throw new Error(`Insufficient commodity spot data returned for ${instrument.label}.`)
  }

  const refreshedDate = refreshedAt?.slice(0, 10)
  const previous =
    refreshedDate && numericSeries[0]?.date === refreshedDate
      ? numericSeries[1] ?? numericSeries[0]
      : numericSeries[0]
  const delta = currentPrice - previous.value

  return {
    id: instrument.id,
    label: instrument.label,
    assetClass: instrument.assetClass,
    price: currentPrice,
    previousPrice: previous.value,
    delta,
    deltaPercent: previous.value === 0 ? 0 : (delta / previous.value) * 100,
    asOf: refreshedAt ?? previous.date,
  }
}

async function fetchCommodityHistoryQuote(instrument: Extract<MarketTapeInstrument, { kind: 'commodity-history' }>, apiKey: string): Promise<MarketTapeQuote> {
  const params = new URLSearchParams({
    function: instrument.functionName,
    apikey: apiKey,
    interval: 'daily',
  })

  const payload = await fetchAlphaVantage<CommoditySeriesResponse>(params)
  assertNoProviderMessage(payload)

  const numericSeries = (payload.data ?? [])
    .map((entry) => ({
      date: entry.date,
      value: Number(entry.price ?? entry.value),
    }))
    .filter((entry): entry is { date: string; value: number } => Boolean(entry.date) && Number.isFinite(entry.value))

  if (numericSeries.length < 2) {
    throw new Error(`Insufficient commodity history returned for ${instrument.label}.`)
  }

  const latest = numericSeries[0]
  const previous = numericSeries.find((entry) => entry.date !== latest.date && Number.isFinite(entry.value))
  if (!previous) {
    throw new Error(`Insufficient commodity history returned for ${instrument.label}.`)
  }

  const delta = latest.value - previous.value

  return {
    id: instrument.id,
    label: instrument.label,
    assetClass: instrument.assetClass,
    price: latest.value,
    previousPrice: previous.value,
    delta,
    deltaPercent: previous.value === 0 ? 0 : (delta / previous.value) * 100,
    asOf: latest.date,
  }
}

async function fetchInstrumentQuote(instrument: MarketTapeInstrument, apiKey: string) {
  if (instrument.kind === 'fx') {
    return fetchFxQuote(instrument, apiKey)
  }

  if (instrument.kind === 'commodity-spot') {
    return fetchCommoditySpotQuote(instrument, apiKey)
  }

  return fetchCommodityHistoryQuote(instrument, apiKey)
}

async function buildAlphaSnapshot(apiKey: string, instruments = MARKET_TAPE_INSTRUMENTS): Promise<MarketTapeSnapshot> {
  const quotes: MarketTapeQuote[] = []

  for (const instrument of instruments) {
    if (quotes.length > 0) {
      await sleep(MARKET_TAPE_REQUEST_GAP_MS)
    }

    try {
      const quote = await fetchInstrumentQuote(instrument, apiKey)
      quotes.push(quote)
    } catch {
      // Skip isolated provider failures so the tape can still render partial data.
    }
  }

  if (quotes.length === 0) {
    throw new Error('Alpha Vantage did not return any macro instruments.')
  }

  return {
    fetchedAt: new Date().toISOString(),
    quotes,
  }
}

async function buildTwelveDataSnapshot(apiKey: string): Promise<MarketTapeSnapshot> {
  const payload = await fetchTwelveDataQuotes(apiKey)
  const entries = normalizeTwelveDataEntries(payload)
  const quotes = MARKET_TAPE_INSTRUMENTS
    .map((instrument) => mapTwelveDataQuote(instrument, entries.get(getTwelveDataSymbol(instrument))))
    .filter((quote): quote is MarketTapeQuote => Boolean(quote))

  if (quotes.length === 0) {
    throw new Error('Twelve Data did not return any macro instruments.')
  }

  return {
    fetchedAt: new Date().toISOString(),
    quotes,
  }
}

function mergeSnapshots(primary: MarketTapeSnapshot | null, fallback: MarketTapeSnapshot | null) {
  if (!primary && !fallback) {
    throw new Error('No market tape providers returned data.')
  }

  if (!primary) {
    return fallback as MarketTapeSnapshot
  }

  if (!fallback) {
    return primary
  }

  const merged = new Map(primary.quotes.map((quote) => [quote.id, quote]))
  for (const quote of fallback.quotes) {
    if (!merged.has(quote.id)) {
      merged.set(quote.id, quote)
    }
  }

  return {
    fetchedAt: primary.fetchedAt,
    quotes: MARKET_TAPE_INSTRUMENTS
      .map((instrument) => merged.get(instrument.id))
      .filter((quote): quote is MarketTapeQuote => Boolean(quote)),
  }
}

export async function fetchMarketTape(alphaApiKey: string, twelveDataApiKey = env.twelveDataApiKey): Promise<MarketTapeSnapshot> {
  if (typeof window !== 'undefined' && !import.meta.env.DEV) {
    try {
      return await fetchMarketTapeFromProxy()
    } catch (error) {
      throw error
    }
  }

  const twelveSnapshot =
    twelveDataApiKey
      ? await buildTwelveDataSnapshot(twelveDataApiKey).catch(() => null)
      : null
  const missingInstrumentIds = new Set(
    MARKET_TAPE_INSTRUMENTS.map((instrument) => instrument.id),
  )
  for (const quote of twelveSnapshot?.quotes ?? []) {
    missingInstrumentIds.delete(quote.id)
  }

  const alphaSnapshot =
    alphaApiKey && missingInstrumentIds.size > 0
      ? await buildAlphaSnapshot(
          alphaApiKey,
          MARKET_TAPE_INSTRUMENTS.filter((instrument) => missingInstrumentIds.has(instrument.id)),
        ).catch(() => null)
      : null

  return mergeSnapshots(twelveSnapshot, alphaSnapshot)
}

function getTwelveDataSymbol(instrument: MarketTapeInstrument) {
  if (instrument.kind === 'fx') {
    return `${instrument.fromSymbol}/${instrument.toSymbol}`
  }

  return instrument.symbol === 'GOLD' ? 'XAU/USD' : 'XAG/USD'
}

function normalizeTwelveDataEntries(payload: TwelveDataQuoteResponse) {
  if ('symbol' in payload || 'status' in payload) {
    const entry = payload as TwelveDataQuoteEntry
    const key = entry.symbol ?? ''
    return new Map(key ? [[key, entry]] : [])
  }

  return new Map(
    Object.entries(payload).map(([key, value]) => [key, value as TwelveDataQuoteEntry]),
  )
}

function mapTwelveDataQuote(instrument: MarketTapeInstrument, entry: TwelveDataQuoteEntry | undefined): MarketTapeQuote | null {
  if (!entry || entry.status === 'error' || entry.code) {
    return null
  }

  const price = Number(entry.close)
  const previousPrice = Number(entry.previous_close)
  const delta = Number(entry.change)
  const deltaPercent = Number(entry.percent_change)
  if (
    !Number.isFinite(price) ||
    !Number.isFinite(previousPrice) ||
    !Number.isFinite(delta) ||
    !Number.isFinite(deltaPercent)
  ) {
    return null
  }

  return {
    id: instrument.id,
    label: instrument.label,
    assetClass: instrument.assetClass,
    price,
    previousPrice,
    delta,
    deltaPercent,
    asOf: formatTwelveDataTimestamp(entry),
  }
}

function formatTwelveDataTimestamp(entry: TwelveDataQuoteEntry) {
  if (typeof entry.last_quote_at === 'number' && Number.isFinite(entry.last_quote_at)) {
    return new Date(entry.last_quote_at * 1000).toISOString()
  }

  if (typeof entry.timestamp === 'number' && Number.isFinite(entry.timestamp)) {
    return new Date(entry.timestamp * 1000).toISOString()
  }

  if (entry.datetime) {
    return `${entry.datetime}T00:00:00Z`
  }

  return new Date().toISOString()
}
