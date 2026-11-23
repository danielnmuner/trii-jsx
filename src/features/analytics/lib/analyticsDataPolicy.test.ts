import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalyticsSymbolFeed } from '../api/schemas'
import { resolveSessionVectorTradingDate, sanitizeAnalyticsSymbolFeed } from './analyticsDataPolicy'

function buildOverviewFeed(capturedAt: string): AnalyticsSymbolFeed {
  return {
    symbol: 'NUCO',
    record_count: 2,
    from_timestamp: capturedAt,
    to_timestamp: capturedAt,
    current_snapshot: {
      symbol: 'NUCO',
      captured_at: capturedAt,
      last_price: 100,
      previous_close: 99,
    },
    previous_snapshot: {
      symbol: 'NUCO',
      captured_at: '2026-09-07T15:59:44.129-05:00',
      last_price: 99,
      previous_close: 98,
    },
    snapshots: [],
    current_stats: {
      traded_value: {
        metric: 'traded_value',
        latest_value: 10,
        mean: 8,
        stddev: 1,
        sample_count: 100,
      },
    },
  }
}

describe('sanitizeAnalyticsSymbolFeed', () => {
  // The policy compares snapshots with "today" in Bogota: pin the clock to the fixture's day,
  // shortly after the post-close snapshot, so the test does not depend on the real date.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-07T16:30:00-05:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps a same-day post-close snapshot for overview cards', () => {
    const feed = buildOverviewFeed('2026-09-07T16:26:44.126-05:00')

    const sanitized = sanitizeAnalyticsSymbolFeed(feed)

    expect(sanitized).not.toBeNull()
    expect(sanitized?.current_snapshot.captured_at).toBe('2026-09-07T16:26:44.126-05:00')
    expect(sanitized?.snapshots).toHaveLength(2)
  })

  it('uses the snapshot trading day for session vector lookups', () => {
    const feed = buildOverviewFeed('2026-09-07T16:26:44.126-05:00')

    expect(resolveSessionVectorTradingDate(feed)).toBe('2026-09-07')
  })
})
