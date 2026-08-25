export type ApprovedPositionSummary = {
  approved_buy_quantity?: number | null
  approved_sell_quantity?: number | null
  available_quantity?: number | null
  symbol?: string | null
  weighted_average_price?: number | null
}

export function extractApprovedPositionSummary(value: unknown): ApprovedPositionSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const summary = value as Record<string, unknown>

  return {
    approved_buy_quantity: toOptionalNumber(summary.approved_buy_quantity),
    approved_sell_quantity: toOptionalNumber(summary.approved_sell_quantity),
    available_quantity: toOptionalNumber(summary.available_quantity),
    symbol: typeof summary.symbol === 'string' ? summary.symbol : null,
    weighted_average_price: toOptionalNumber(summary.weighted_average_price),
  }
}

function toOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
