/** Colombian peso formatting for the calculator: "." for thousands, "," for decimals. */
const LOCALE = 'es-CO'

export function formatCop(value: number, digits = 0) {
  return new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
}

export function formatSignedCop(value: number, digits = 0) {
  const formatted = formatCop(Math.abs(value), digits)
  return value > 0 ? `+${formatted}` : value < 0 ? `−${formatted}` : formatted
}

export function formatPercent(value: number, digits = 2) {
  return `${new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)}%`
}

export function formatSignedPercent(value: number, digits = 2) {
  const formatted = formatPercent(Math.abs(value), digits)
  return value > 0 ? `+${formatted}` : value < 0 ? `−${formatted}` : formatted
}

/** Short axis labels: 250.000 → "250K", 1.500.000 → "1,5M". */
export function formatCompactCop(value: number) {
  const abs = Math.abs(value)
  const sign = value < 0 ? '−' : ''
  if (abs >= 1_000_000) {
    return `${sign}${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(abs / 1_000_000)}M`
  }
  if (abs >= 1_000) {
    return `${sign}${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(abs / 1_000)}K`
  }
  return `${sign}${formatCop(abs)}`
}

/** A number written the way the inputs show it (e.g. a last price put into the buy field). */
export function formatAmountForInput(value: number) {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(value)
}

/**
 * Re-formats what the user is typing into local peso notation: thousands get ".", the first ","
 * starts up to two decimals (`allowDecimals`). Dots typed by the user are treated as thousands
 * separators, so they are simply re-placed.
 */
export function formatTypedAmount(raw: string, allowDecimals = true) {
  const cleaned = raw.replace(/[^\d,]/g, '')
  const commaIndex = allowDecimals ? cleaned.indexOf(',') : -1
  const integerDigits = (commaIndex === -1 ? cleaned : cleaned.slice(0, commaIndex)).replace(/,/g, '')
  const decimalDigits = commaIndex === -1 ? '' : cleaned.slice(commaIndex + 1).replace(/,/g, '').slice(0, 2)

  const integer = integerDigits.replace(/^0+(?=\d)/, '')
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  if (commaIndex === -1) {
    return grouped
  }
  return `${grouped || '0'},${decimalDigits}`
}

/** Characters that carry meaning (digits and the decimal comma); used to keep the caret in place. */
export function countSignificant(text: string) {
  return text.replace(/[^\d,]/g, '').length
}

/** Caret index in `formatted` that sits after `significantBefore` meaningful characters. */
export function caretAfterSignificant(formatted: string, significantBefore: number) {
  if (significantBefore <= 0) {
    return 0
  }
  let seen = 0
  for (let index = 0; index < formatted.length; index += 1) {
    if (/[\d,]/.test(formatted[index])) {
      seen += 1
      if (seen === significantBefore) {
        return index + 1
      }
    }
  }
  return formatted.length
}
