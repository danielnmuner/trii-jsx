import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBvcSessionBounds, isBogotaTradingSessionInstant } from './colombiaBusinessCalendar'
import { resolveOverviewTradingDate } from './analyticsDataPolicy'

const hm = (seconds: number) => `${Math.floor(seconds / 3600)}:${`${Math.floor((seconds % 3600) / 60)}`.padStart(2, '0')}`

describe('getBvcSessionBounds', () => {
  // 2026: US daylight saving runs from Sunday March 8 to Sunday November 1.
  it.each([
    ['2026-03-06', 'winter', '9:30', '16:00'],
    ['2026-03-09', 'summer', '8:30', '15:00'],
    ['2026-08-21', 'summer', '8:30', '15:00'],
    ['2026-10-30', 'summer', '8:30', '15:00'],
    ['2026-11-02', 'winter', '9:30', '16:00'],
    ['2026-11-26', 'winter', '9:30', '16:00'],
    ['2027-01-15', 'winter', '9:30', '16:00'],
  ])('%s uses the %s schedule (%s–%s)', (dateKey, schedule, start, end) => {
    const bounds = getBvcSessionBounds(dateKey)
    expect(bounds.schedule).toBe(schedule)
    expect(hm(bounds.startSeconds)).toBe(start)
    expect(hm(bounds.endSeconds)).toBe(end)
  })

  it('switches exactly on the US daylight-saving Sundays', () => {
    expect(getBvcSessionBounds('2026-03-07').schedule).toBe('winter')
    expect(getBvcSessionBounds('2026-03-08').schedule).toBe('summer')
    expect(getBvcSessionBounds('2026-10-31').schedule).toBe('summer')
    expect(getBvcSessionBounds('2026-11-01').schedule).toBe('winter')
  })
})

describe('isBogotaTradingSessionInstant', () => {
  it('follows the winter session (09:30–16:00, plus post-close grace)', () => {
    expect(isBogotaTradingSessionInstant('2026-11-26T09:00:00-05:00')).toBe(false)
    expect(isBogotaTradingSessionInstant('2026-11-26T09:30:00-05:00')).toBe(true)
    expect(isBogotaTradingSessionInstant('2026-11-26T15:59:00-05:00')).toBe(true)
    expect(isBogotaTradingSessionInstant('2026-11-26T16:20:00-05:00')).toBe(true)
    expect(isBogotaTradingSessionInstant('2026-11-26T17:30:00-05:00')).toBe(false)
  })

  it('follows the summer session (08:30–15:00, plus post-close grace)', () => {
    expect(isBogotaTradingSessionInstant('2026-08-21T08:20:00-05:00')).toBe(false)
    expect(isBogotaTradingSessionInstant('2026-08-21T08:30:00-05:00')).toBe(true)
    // Closing records stamped shortly after the close keep counting (e.g. 15:31).
    expect(isBogotaTradingSessionInstant('2026-08-21T15:31:00-05:00')).toBe(true)
    expect(isBogotaTradingSessionInstant('2026-08-21T16:30:00-05:00')).toBe(false)
  })

  it('rejects weekends and holidays', () => {
    expect(isBogotaTradingSessionInstant('2026-11-28T11:00:00-05:00')).toBe(false)
    expect(isBogotaTradingSessionInstant('2026-12-08T11:00:00-05:00')).toBe(false)
  })
})

describe('resolveOverviewTradingDate', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const at = (iso: string) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(iso))
    return resolveOverviewTradingDate()
  }

  it('in winter keeps the previous day until the 09:30 open', () => {
    expect(at('2026-11-26T08:45:00-05:00')).toBe('2026-11-25')
    expect(at('2026-11-26T09:29:00-05:00')).toBe('2026-11-25')
    expect(at('2026-11-26T09:30:00-05:00')).toBe('2026-11-26')
  })

  it('in summer switches to today at the 08:30 open', () => {
    expect(at('2026-08-21T08:29:00-05:00')).toBe('2026-08-20')
    expect(at('2026-08-21T08:30:00-05:00')).toBe('2026-08-21')
  })
})
