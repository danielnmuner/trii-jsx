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

type CommodityHistoryResponse = {
  data?: Array<{
    date?: string
    price?: string
  }>
  Information?: string
  Note?: string
  ['Error Message']?: string
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

function assertProviderPayload(payload: { Information?: string; Note?: string; ['Error Message']?: string }) {
  const providerMessage = payload.Note || payload.Information || payload['Error Message']
  if (providerMessage) {
    throw new Error(providerMessage)
  }
}

async function fetchFxQuote(instrument: Extract<MarketTapeInstrument, { kind: 'fx' }>, apiKey: string): Promise<MarketTapeQuote> {
  const [realtimePayload, historyPayload] = await Promise.all([
    fetchAlphaVantage<FxRealtimeResponse>(
      new URLSearchParams({
        function: 'CURRENCY_EXCHANGE_RATE',
        from_currency: instrument.fromSymbol,
        to_currency: instrument.toSymbol,
      }),
      apiKey,
    ),
    fetchAlphaVantage<FxHistoryResponse>(
      new URLSearchParams({
        function: 'FX_DAILY',
        from_symbol: instrument.fromSymbol,
        to_symbol: instrument.toSymbol,
        outputsize: 'compact',
      }),
      apiKey,
    ),
  ])

  assertProviderPayload(realtimePayload)
  assertProviderPayload(historyPayload)

  const realtime = realtimePayload['Realtime Currency Exchange Rate']
  const currentPrice = Number(realtime?.['5. Exchange Rate'])
  const refreshedAt = realtime?.['6. Last Refreshed']
  const series = historyPayload['Time Series FX (Daily)']
  if (!Number.isFinite(currentPrice) || !series) {
    throw new Error(`No FX data returned for ${instrument.label}.`)
  }

  const orderedDates = Object.keys(series).sort((left, right) => right.localeCompare(left))
  const numericSeries = orderedDates
    .map((date) => ({ date, close: Number(series[date]?.['4. close']) }))
    .filter((entry) => Number.isFinite(entry.close))

  if (numericSeries.length === 0) {
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
  const [spotPayload, historyPayload] = await Promise.all([
    fetchAlphaVantage<CommoditySpotResponse>(
      new URLSearchParams({
        function: 'GOLD_SILVER_SPOT',
        symbol: instrument.symbol,
      }),
      apiKey,
    ),
    fetchAlphaVantage<CommodityHistoryResponse>(
      new URLSearchParams({
        function: 'GOLD_SILVER_HISTORY',
        symbol: instrument.symbol,
        interval: 'daily',
      }),
      apiKey,
    ),
  ])

  assertProviderPayload(spotPayload)
  assertProviderPayload(historyPayload)

  const currentPrice = Number(spotPayload.price)
  const refreshedAt = spotPayload.timestamp
  const numericSeries = (historyPayload.data ?? [])
    .map((entry) => ({ date: entry.date, value: Number(entry.price) }))
    .filter((entry): entry is { date: string; value: number } => Boolean(entry.date) && Number.isFinite(entry.value))

  if (!Number.isFinite(currentPrice) || numericSeries.length === 0) {
    throw new Error(`No commodity spot data returned for ${instrument.label}.`)
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

async function fetchInstrumentQuote(instrument: MarketTapeInstrument, apiKey: string) {
  if (instrument.kind === 'fx') {
    return fetchFxQuote(instrument, apiKey)
  }

  return fetchCommoditySpotQuote(instrument, apiKey)
}

async function buildMarketTapeSnapshot(apiKey: string): Promise<MarketTapeSnapshot> {
  const quotes: MarketTapeQuote[] = []

  for (const instrument of INSTRUMENTS) {
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

export default async function handler(_request: unknown, response: {
  status: (code: number) => { json: (body: unknown) => void }
  setHeader: (name: string, value: string) => void
}) {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY || process.env.VITE_ALPHA_VANTAGE_API_KEY
  if (!apiKey) {
    response.status(500).json({ message: 'Missing ALPHA_VANTAGE_API_KEY.' })
    return
  }

  try {
    const snapshot = await buildMarketTapeSnapshot(apiKey)
    response.setHeader('Cache-Control', `public, s-maxage=${CDN_CACHE_SECONDS}, stale-while-revalidate=${CDN_CACHE_SECONDS}`)
    response.status(200).json(snapshot)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to build market tape.'
    response.status(502).json({ message })
  }
}
