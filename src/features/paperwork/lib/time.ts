const BOGOTA_TIMEZONE = 'America/Bogota'

type BogotaTimestampParts = {
  iso: string
  compact: string
  datePath: string
}

export function buildBogotaTimestamp(now = new Date()): BogotaTimestampParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BOGOTA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })

  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value]),
  ) as Record<string, string>

  const year = parts.year
  const month = parts.month
  const day = parts.day
  const hour = parts.hour
  const minute = parts.minute
  const second = parts.second

  return {
    iso: `${year}-${month}-${day}T${hour}:${minute}:${second}-05:00`,
    compact: `${year}${month}${day}T${hour}${minute}${second}`,
    datePath: `${year}/${month}/${day}`,
  }
}

export function getBogotaTimezoneLabel() {
  return BOGOTA_TIMEZONE
}
