/**
 * Parses a typed COP amount. Accepts both "2,500" (the app's format) and "2.500" (Colombian
 * thousands) as two thousand five hundred; a single separator followed by 1–2 digits is a decimal
 * ("2.5", "2,75"). Returns NaN for anything else.
 */
export function parseAmount(raw: string): number {
  // A trailing separator ("2.500," while typing decimals) does not change the value.
  const text = raw.replace(/[\s$]/g, '').replace(/[.,]$/, '')
  if (text === '') {
    return Number.NaN
  }

  // Thousands grouping only: 2,500 · 2.500 · 1,250,000 · 1.250.000
  if (/^\d{1,3}([.,]\d{3})+$/.test(text)) {
    return Number(text.replace(/[.,]/g, ''))
  }

  // Grouping plus decimals: 1,250,000.50 or 1.250.000,50
  const mixed = /^(\d{1,3}(?:([.,])\d{3})*)([.,])(\d{1,2})$/.exec(text)
  if (mixed && mixed[2] && mixed[2] !== mixed[3]) {
    return Number(`${mixed[1].replace(/[.,]/g, '')}.${mixed[4]}`)
  }

  // Plain number with an optional decimal part: 2500 · 2500.5 · 2,5
  if (/^\d+([.,]\d{1,2})?$/.test(text)) {
    return Number(text.replace(',', '.'))
  }

  return Number.NaN
}
