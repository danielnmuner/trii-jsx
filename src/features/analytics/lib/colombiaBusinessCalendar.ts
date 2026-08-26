const bogotaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const bogotaTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Bogota',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

const BOGOTA_TRADING_SESSION_START_SECONDS = 8 * 60 * 60 + 30 * 60
const BOGOTA_TRADING_SESSION_END_SECONDS = 16 * 60 * 60

export function getBogotaDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const parts = bogotaDateFormatter.formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) {
    return null
  }

  return `${year}-${month}-${day}`
}

export function isBogotaBusinessInstant(value: string | Date) {
  const dateKey = getBogotaDateKey(value)
  if (!dateKey) {
    return false
  }

  return isColombiaBusinessDateKey(dateKey)
}

export function isBogotaTradingSessionInstant(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime()) || !isBogotaBusinessInstant(date)) {
    return false
  }

  const parts = bogotaTimeFormatter.formatToParts(date)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value)
  const second = Number(parts.find((part) => part.type === 'second')?.value)

  if ([hour, minute, second].some((valuePart) => Number.isNaN(valuePart))) {
    return false
  }

  const secondsFromMidnight = hour * 60 * 60 + minute * 60 + second
  return (
    secondsFromMidnight >= BOGOTA_TRADING_SESSION_START_SECONDS &&
    secondsFromMidnight <= BOGOTA_TRADING_SESSION_END_SECONDS
  )
}

export function isColombiaBusinessDateKey(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) {
    return false
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = createUtcDate(year, month, day)
  const weekday = date.getUTCDay()

  if (weekday === 0 || weekday === 6) {
    return false
  }

  return !getColombiaHolidayKeys(year).has(dateKey)
}

const holidayCache = new Map<number, Set<string>>()

function getColombiaHolidayKeys(year: number) {
  const cached = holidayCache.get(year)
  if (cached) {
    return cached
  }

  const holidays = new Set<string>()
  const add = (date: Date) => holidays.add(toDateKey(date))
  const addObservedMonday = (date: Date) => holidays.add(toDateKey(moveToNextMonday(date)))
  const easterSunday = computeEasterSundayUtc(year)

  add(createUtcDate(year, 1, 1))
  addObservedMonday(createUtcDate(year, 1, 6))
  addObservedMonday(createUtcDate(year, 3, 19))
  add(addDaysUtc(easterSunday, -3))
  add(addDaysUtc(easterSunday, -2))
  add(createUtcDate(year, 5, 1))
  addObservedMonday(addDaysUtc(easterSunday, 43))
  addObservedMonday(addDaysUtc(easterSunday, 64))
  addObservedMonday(addDaysUtc(easterSunday, 71))
  addObservedMonday(createUtcDate(year, 6, 29))
  add(createUtcDate(year, 7, 20))
  add(createUtcDate(year, 8, 7))
  addObservedMonday(createUtcDate(year, 8, 15))
  addObservedMonday(createUtcDate(year, 10, 12))
  addObservedMonday(createUtcDate(year, 11, 1))
  addObservedMonday(createUtcDate(year, 11, 11))
  add(createUtcDate(year, 12, 8))
  add(createUtcDate(year, 12, 25))

  holidayCache.set(year, holidays)
  return holidays
}

function computeEasterSundayUtc(year: number) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1

  return createUtcDate(year, month, day)
}

function moveToNextMonday(date: Date) {
  const weekday = date.getUTCDay()
  if (weekday === 1) {
    return date
  }

  const daysToAdd = weekday === 0 ? 1 : 8 - weekday
  return addDaysUtc(date, daysToAdd)
}

function addDaysUtc(date: Date, days: number) {
  const next = new Date(date.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function createUtcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day))
}

function toDateKey(date: Date) {
  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${date.getUTCDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}
