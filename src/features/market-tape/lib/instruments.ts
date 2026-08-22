export type MarketTapeAssetClass = 'fx' | 'metals' | 'energy'

export type MarketTapeInstrument =
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
  | {
      id: string
      label: string
      assetClass: MarketTapeAssetClass
      kind: 'commodity-history'
      functionName: 'WTI' | 'BRENT'
      symbol?: 'GOLD' | 'SILVER'
    }

export const MARKET_TAPE_CACHE_TTL_MS = 12 * 60 * 60 * 1000
export const MARKET_TAPE_REQUEST_GAP_MS = 1_250

export const MARKET_TAPE_INSTRUMENTS: MarketTapeInstrument[] = [
  {
    id: 'usd-cop',
    label: 'Dollar / COP',
    assetClass: 'fx',
    kind: 'fx',
    fromSymbol: 'USD',
    toSymbol: 'COP',
  },
  {
    id: 'eur-usd',
    label: 'Euro / USD',
    assetClass: 'fx',
    kind: 'fx',
    fromSymbol: 'EUR',
    toSymbol: 'USD',
  },
  {
    id: 'gbp-usd',
    label: 'Pound / USD',
    assetClass: 'fx',
    kind: 'fx',
    fromSymbol: 'GBP',
    toSymbol: 'USD',
  },
  {
    id: 'usd-jpy',
    label: 'Yen',
    assetClass: 'fx',
    kind: 'fx',
    fromSymbol: 'USD',
    toSymbol: 'JPY',
  },
  {
    id: 'usd-chf',
    label: 'Swiss Franc',
    assetClass: 'fx',
    kind: 'fx',
    fromSymbol: 'USD',
    toSymbol: 'CHF',
  },
  {
    id: 'gold',
    label: 'Gold',
    assetClass: 'metals',
    kind: 'commodity-spot',
    symbol: 'GOLD',
  },
  {
    id: 'silver',
    label: 'Silver',
    assetClass: 'metals',
    kind: 'commodity-spot',
    symbol: 'SILVER',
  },
]
