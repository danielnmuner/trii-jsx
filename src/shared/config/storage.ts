const ANALYTICS_SYMBOL_ORDER_STORAGE_KEY = 'trii.analytics.symbol-order.v1'
const ANALYTICS_FLOW_AUDIO_STORAGE_KEY = 'trii.analytics.flow-audio.v1'

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export function readAnalyticsSymbolOrder(): string[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const rawValue = window.localStorage.getItem(ANALYTICS_SYMBOL_ORDER_STORAGE_KEY)

    if (!rawValue) {
      return []
    }

    const parsedValue: unknown = JSON.parse(rawValue)
    return isStringArray(parsedValue) ? parsedValue : []
  } catch {
    return []
  }
}

export function writeAnalyticsSymbolOrder(symbols: string[]) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(ANALYTICS_SYMBOL_ORDER_STORAGE_KEY, JSON.stringify(symbols))
  } catch {
    // Ignore storage failures so the desk stays usable in restricted browsers.
  }
}

export function readAnalyticsFlowAudioEnabled() {
  if (typeof window === 'undefined') {
    return true
  }

  try {
    const rawValue = window.localStorage.getItem(ANALYTICS_FLOW_AUDIO_STORAGE_KEY)
    if (rawValue === null) {
      return true
    }

    const parsedValue: unknown = JSON.parse(rawValue)
    return typeof parsedValue === 'boolean' ? parsedValue : true
  } catch {
    return true
  }
}

export function writeAnalyticsFlowAudioEnabled(enabled: boolean) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(ANALYTICS_FLOW_AUDIO_STORAGE_KEY, JSON.stringify(enabled))
  } catch {
    // Ignore storage failures so the desk stays usable in restricted browsers.
  }
}
