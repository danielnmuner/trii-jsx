import { getJson } from '../../../shared/api/http'
import { issuersResponseSchema, type ActiveIssuers, type Issuer } from './schemas'

/**
 * The issuers table is the source of truth for which symbols the app cares about.
 * Only issuers with `is_active === true` are kept; anything else (false, missing)
 * is dropped so no tab renders it or requests data for it.
 */
export function selectActiveIssuers(items: Issuer[]): ActiveIssuers {
  const seen = new Set<string>()
  const issuers: Issuer[] = []

  for (const item of items) {
    if (item.is_active !== true) {
      continue
    }

    const symbol = item.symbol.trim().toUpperCase()
    if (!symbol || seen.has(symbol)) {
      continue
    }

    seen.add(symbol)
    issuers.push({ ...item, symbol })
  }

  return { issuers, symbols: issuers.map((issuer) => issuer.symbol) }
}

export async function fetchActiveIssuers(): Promise<ActiveIssuers> {
  const payload = await getJson('/issuers')
  return selectActiveIssuers(issuersResponseSchema.parse(payload).result.items)
}
