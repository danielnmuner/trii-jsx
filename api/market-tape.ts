declare const process:
  | {
      env?: Record<string, string | undefined>
    }
  | undefined

type MarketTapeAssetClass = 'fx' | 'metals'

type MarketTapeQuote = {
  id: string
  label: string
  assetClass: MarketTapeAssetClass
  price: number
  previousPrice: number
  delta: number
  deltaPercent: number
  asOf: string
}

type MarketTapeSnapshot = {
  fetchedAt: string
  quotes: MarketTapeQuote[]
}

type MarketTapeInstrument =
  | {
      id: string
      label: string
      assetClass: MarketTapeAssetClass
      kind: 'fx'
      fromSymbol: string
      toSymbol: string
    }
  | {
      id: string
      label: string
      assetClass: MarketTapeAssetClass
      kind: 'commodity-spot'
      symbol: 'GOLD' | 'SILVER'
    }

type FxRealtimeResponse = {
  ['Realtime Currency Exchange Rate']?: {
    ['5. Exchange Rate']?: string
    ['6. Last Refreshed']?: string
  }
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

const INSTRUMENTS: MarketTapeInstrument[] = [
  { id: 'usd-cop', label: 'Dollar / COP', assetClass: 'fx', kind: 'fx', fromSymbol: 'USD', toSymbol: 'COP' },
  { id: 'eur-usd', label: 'Euro / USD', assetClass: 'fx', kind: 'fx', fromSymbol: 'EUR', toSymbol: 'USD' },
  { id: 'gbp-usd', label: 'Pound / USD', assetClass: 'fx', kind: 'fx', fromSymbol: 'GBP', toSymbol: 'USD' },
  { id: 'usd-jpy', label: 'Yen', assetClass: 'fx', kind: 'fx', fromSymbol: 'USD', toSymbol: 'JPY' },
  { id: 'usd-chf', label: 'Swiss Franc', assetClass: 'fx', kind: 'fx', fromSymbol: 'USD', toSymbol: 'CHF' },
  { id: 'gold', label: 'Gold', assetClass: 'metals', kind: 'commodity-spot', symbol: 'GOLD' },
  { id: 'silver', label: 'Silver', assetClass: 'metals', kind: 'commodity-spot', symbol: 'SILVER' },
]

const REQUEST_GAP_MS = 1_250
const CDN_CACHE_SECONDS = 60 * 60 * 12

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchAlphaVantage<T>(params: URLSearchParams, apiKey: string) {
  params.set('apikey', apiKey)

  const response = await fetch(`https://www.alphavantage.co/query?${params.toString()}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })

  const payload = (await response.json().catch(() => null)) as T | null
  if (!response.ok || !payload) {
    throw new Error('Alpha Vantage request failed.')
  }

  return payload
}

async function fetchTwelveDataQuotes(apiKey: string) {
  const symbols = INSTRUMENTS.map(getTwelveDataSymbol).join(',')
  const params = new URLSearchParams({
    symbol: symbols,
    apikey: apiKey,
  })

  const response = await fetch(`https://api.twelvedata.com/quote?${params.toString()}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })

  const payload = (await response.json().catch(() => null)) as TwelveDataQuoteResponse | null
  if (!response.ok || !payload) {
    throw new Error('Twelve Data request failed.')
  }

  return payload
}

function assertProviderPayload(payload: { Information?: string; Note?: string; ['Error Message']?: string }) {
  const providerMessage = payload.Note || payload.Information || payload['Error Message']
  if (providerMessage) {
    throw new Error(providerMessage)
  }
}

async function fetchFxQuote(instrument: Extract<MarketTapeInstrument, { kind: 'fx' }>, apiKey: string): Promise<MarketTapeQuote> {
  const realtimePayload = await fetchAlphaVantage<FxRealtimeResponse>(
    new URLSearchParams({
      function: 'CURRENCY_EXCHANGE_RATE',
      from_currency: instrument.fromSymbol,
      to_currency: instrument.toSymbol,
    }),
    apiKey,
  )
  assertProviderPayload(realtimePayload)

  const realtime = realtimePayload['Realtime Currency Exchange Rate']
  const currentPrice = Number(realtime?.['5. Exchange Rate'])
  const refreshedAt = realtime?.['6. Last Refreshed']
  if (!Number.isFinite(currentPrice)) {
    throw new Error(`No FX data returned for ${instrument.label}.`)
  }

  return {
    id: instrument.id,
    label: instrument.label,
    assetClass: instrument.assetClass,
    price: currentPrice,
    previousPrice: currentPrice,
    delta: 0,
    deltaPercent: 0,
    asOf: refreshedAt ?? new Date().toISOString(),
  }
}

async function fetchCommoditySpotQuote(instrument: Extract<MarketTapeInstrument, { kind: 'commodity-spot' }>, apiKey: string): Promise<MarketTapeQuote> {
  const spotPayload = await fetchAlphaVantage<CommoditySpotResponse>(
    new URLSearchParams({
      function: 'GOLD_SILVER_SPOT',
      symbol: instrument.symbol,
    }),
    apiKey,
  )
  assertProviderPayload(spotPayload)

  const currentPrice = Number(spotPayload.price)
  const refreshedAt = spotPayload.timestamp
  if (!Number.isFinite(currentPrice)) {
    throw new Error(`No commodity spot data returned for ${instrument.label}.`)
  }

  return {
    id: instrument.id,
    label: instrument.label,
    assetClass: instrument.assetClass,
    price: currentPrice,
    previousPrice: currentPrice,
    delta: 0,
    deltaPercent: 0,
    asOf: refreshedAt ?? new Date().toISOString(),
  }
}

async function fetchInstrumentQuote(instrument: MarketTapeInstrument, apiKey: string) {
  if (instrument.kind === 'fx') {
    return fetchFxQuote(instrument, apiKey)
  }

  return fetchCommoditySpotQuote(instrument, apiKey)
}

async function buildAlphaSnapshot(apiKey: string, instruments = INSTRUMENTS): Promise<MarketTapeSnapshot> {
  const quotes: MarketTapeQuote[] = []

  for (const instrument of instruments) {
    if (quotes.length > 0) {
      await sleep(REQUEST_GAP_MS)
    }

    try {
      const quote = await fetchInstrumentQuote(instrument, apiKey)
      quotes.push(quote)
    } catch {
      // Skip isolated provider failures so the tape can still render partial data.
    }
  }

  if (quotes.length === 0) {
    throw new Error('Alpha Vantage did not return any macro tape data.')
  }

  return {
    fetchedAt: new Date().toISOString(),
    quotes,
  }
}

async function buildTwelveDataSnapshot(apiKey: string): Promise<MarketTapeSnapshot> {
  const payload = await fetchTwelveDataQuotes(apiKey)
  const entries = normalizeTwelveDataEntries(payload)
  const quotes = INSTRUMENTS
    .map((instrument) => mapTwelveDataQuote(instrument, entries.get(getTwelveDataSymbol(instrument))))
    .filter((quote): quote is MarketTapeQuote => Boolean(quote))

  if (quotes.length === 0) {
    throw new Error('Twelve Data did not return any macro tape data.')
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
    quotes: INSTRUMENTS.map((instrument) => merged.get(instrument.id)).filter((quote): quote is MarketTapeQuote => Boolean(quote)),
  }
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

export default async function handler(_request: unknown, response: {
  status: (code: number) => { json: (body: unknown) => void }
  setHeader: (name: string, value: string) => void
}) {
  const alphaApiKey = process?.env?.ALPHA_VANTAGE_API_KEY || process?.env?.VITE_ALPHA_VANTAGE_API_KEY
  const twelveDataApiKey = process?.env?.TWELVE_DATA_API_KEY || process?.env?.VITE_TWELVE_DATA_API_KEY
  if (!alphaApiKey && !twelveDataApiKey) {
    response.status(500).json({ message: 'Missing market tape provider keys.' })
    return
  }

  try {
    const twelveSnapshot =
      twelveDataApiKey
        ? await buildTwelveDataSnapshot(twelveDataApiKey).catch(() => null)
        : null
    const missingInstrumentIds = new Set(INSTRUMENTS.map((instrument) => instrument.id))
    for (const quote of twelveSnapshot?.quotes ?? []) {
      missingInstrumentIds.delete(quote.id)
    }

    const alphaSnapshot =
      alphaApiKey && missingInstrumentIds.size > 0
        ? await buildAlphaSnapshot(
            alphaApiKey,
            INSTRUMENTS.filter((instrument) => missingInstrumentIds.has(instrument.id)),
          ).catch(() => null)
        : null

    const snapshot = mergeSnapshots(twelveSnapshot, alphaSnapshot)
    response.setHeader('Cache-Control', `public, s-maxage=${CDN_CACHE_SECONDS}, stale-while-revalidate=${CDN_CACHE_SECONDS}`)
    response.status(200).json(snapshot)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to build market tape.'
    response.status(502).json({ message })
  }
}
