export type FreshnessTone = 'fresh' | 'stale'

export function formatFreshnessTimestamp(value: string | null | undefined) {
  if (!value) {
    return 'n/a'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'n/a'
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )

  return `${parts.month ?? '--'}-${parts.day ?? '--'} ${parts.hour ?? '--'}:${parts.minute ?? '--'}`
}

export function deriveFreshnessTone(value: string | null | undefined): FreshnessTone {
  if (!value) {
    return 'stale'
  }

  const capturedAt = new Date(value).getTime()
  if (Number.isNaN(capturedAt)) {
    return 'stale'
  }

  const diffMs = Math.max(0, Date.now() - capturedAt)
  return diffMs <= 5 * 60 * 1000 ? 'fresh' : 'stale'
}
