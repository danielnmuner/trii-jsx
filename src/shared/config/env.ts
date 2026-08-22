const isTest = Boolean(import.meta.env.VITEST) || import.meta.env.MODE === 'test'
const apiBaseUrl = isTest ? '/api' : import.meta.env.VITE_TRII_API_BASE_URL?.trim() || '/api'
const apiToken = isTest ? '' : import.meta.env.VITE_TRII_API_TOKEN?.trim() || ''
const alphaVantageApiKey = isTest ? '' : import.meta.env.VITE_ALPHA_VANTAGE_API_KEY?.trim() || ''
const twelveDataApiKey = isTest ? '' : import.meta.env.VITE_TWELVE_DATA_API_KEY?.trim() || ''
const useMocks = isTest ? true : import.meta.env.VITE_USE_MOCKS !== 'false'

export const env = {
  apiBaseUrl,
  apiToken,
  alphaVantageApiKey,
  twelveDataApiKey,
  useMocks,
} as const
