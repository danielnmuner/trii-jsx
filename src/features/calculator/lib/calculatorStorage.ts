/**
 * Keeps the calculator's inputs in this browser so they survive tab switches and reloads.
 * Per-viewer convenience only: if storage is unavailable the calculator simply starts empty.
 */
const CALCULATOR_STORAGE_KEY = 'trii.calculator.v1'

export type StoredScenario = {
  symbol: string | null
  buyPrice: string
  sellPrice: string
  sizeMode: 'shares' | 'amount'
  shares: string
  amount: string
}

export type StoredCalculator = {
  compare: boolean
  scenarios: { A: StoredScenario; B: StoredScenario }
}

function isScenario(value: unknown): value is StoredScenario {
  if (!value || typeof value !== 'object') {
    return false
  }
  const scenario = value as Record<string, unknown>
  return (
    (scenario.symbol === null || typeof scenario.symbol === 'string') &&
    typeof scenario.buyPrice === 'string' &&
    typeof scenario.sellPrice === 'string' &&
    (scenario.sizeMode === 'shares' || scenario.sizeMode === 'amount') &&
    typeof scenario.shares === 'string' &&
    typeof scenario.amount === 'string'
  )
}

export function readCalculatorState(): StoredCalculator | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    const raw = window.localStorage.getItem(CALCULATOR_STORAGE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const scenarios = parsed?.scenarios as Record<string, unknown> | undefined
    if (typeof parsed?.compare !== 'boolean' || !scenarios || !isScenario(scenarios.A) || !isScenario(scenarios.B)) {
      return null
    }
    return { compare: parsed.compare, scenarios: { A: scenarios.A, B: scenarios.B } }
  } catch {
    return null
  }
}

export function writeCalculatorState(state: StoredCalculator) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(CALCULATOR_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage can be full or blocked; the calculator keeps working without it.
  }
}
