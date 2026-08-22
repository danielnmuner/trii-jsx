const mockSymbols = ['NUCO', 'ISA', 'CIBEST', 'BVC', 'ECOPET', 'PFBCOLOM', 'BCOLOMBIA', 'CEMARGOS', 'NUTRESA', 'GRUPOARG'] as const

const baseSnapshots = {
  NUCO: {
    symbol: 'NUCO',
    captured_at: '2026-08-21T14:30:00-05:00',
    last_price: 44120,
    previous_close: 43000,
    daily_change_amount: 1120,
    daily_change_percent: 260.46,
    best_bid_price: 44100,
    best_ask_price: 44120,
    high_price: 44400,
    low_price: 42880,
    spread_bps: 4.53,
    obi_l1: 0.72,
    obi_top_5: 0.58,
    microprice: 44118,
    mid_price: 44110,
    depth_weighted_microprice_deviation: 8,
    traded_volume: 126721,
    traded_value: 11483533480,
  },
  ISA: {
    symbol: 'ISA',
    captured_at: '2026-08-21T14:30:00-05:00',
    last_price: 20380,
    previous_close: 20210,
    daily_change_amount: 170,
    daily_change_percent: 84.12,
    best_bid_price: 20370,
    best_ask_price: 20380,
    high_price: 20460,
    low_price: 20120,
    spread_bps: 4.91,
    obi_l1: -0.18,
    obi_top_5: 0.09,
    microprice: 20376,
    mid_price: 20375,
    depth_weighted_microprice_deviation: 1,
    traded_volume: 38421,
    traded_value: 783420000,
  },
} as const

function round(value: number, decimals = 2) {
  return Number(value.toFixed(decimals))
}

function buildSnapshotFixture(symbol: string, index: number) {
  const seed = index % 2 === 0 ? baseSnapshots.NUCO : baseSnapshots.ISA
  const step = index + 1
  const growth = 1 + step * 0.013
  const current = {
    ...seed,
    symbol,
    last_price: Math.round(seed.last_price * growth),
    previous_close: Math.round(seed.previous_close * (1 + step * 0.011)),
    daily_change_amount: round(seed.daily_change_amount + step * 21),
    daily_change_percent: round(seed.daily_change_percent + step * 18, 4),
    best_bid_price: Math.round(seed.best_bid_price * growth),
    best_ask_price: Math.round(seed.best_ask_price * growth),
    high_price: Math.round(seed.high_price * (1 + step * 0.014)),
    low_price: Math.round(seed.low_price * (1 + step * 0.01)),
    spread_bps: round(seed.spread_bps + step * 0.19),
    obi_l1: round(seed.obi_l1 - step * 0.07),
    obi_top_5: round(seed.obi_top_5 + step * 0.05),
    microprice: Math.round(seed.microprice * growth),
    mid_price: Math.round(seed.mid_price * growth),
    traded_volume: Math.round(seed.traded_volume * (1 + step * 0.07)),
    traded_value: Math.round(seed.traded_value * (1 + step * 0.08)),
  }

  const previous = {
    ...current,
    captured_at: '2026-08-21T14:15:00-05:00',
    last_price: current.last_price - 80,
    traded_volume: Math.round(current.traded_volume * 0.94),
    traded_value: Math.round(current.traded_value * 0.93),
  }

  return {
    status: 'ok',
    result: {
      symbol,
      record_count: 2,
      from_timestamp: '2026-08-21T14:15:00-05:00',
      to_timestamp: '2026-08-21T14:30:00-05:00',
      current_snapshot: current,
      previous_snapshot: previous,
      current_stats: {
        book_pressure_ratio: {
          latest_value: round(1.24 + step * 0.05, 4),
          mean: round(1.08 + step * 0.04, 4),
          stddev: round(0.32 + step * 0.01, 4),
          sample_count: 48,
          min_value: round(0.44 + step * 0.01, 4),
          max_value: round(2.4 + step * 0.07, 4),
          m2: round(12.4 + step * 0.8, 4),
        },
        depth_weighted_microprice_deviation: {
          latest_value: round(-8 - step * 1.3, 4),
          mean: round(-1.2 + step * 0.4, 4),
          stddev: round(9.4 + step * 0.8, 4),
          sample_count: 48,
          min_value: round(-22 - step * 1.8, 4),
          max_value: round(5.6 + step * 0.5, 4),
          m2: round(1800 + step * 120, 4),
        },
        spread_bps: {
          latest_value: current.spread_bps,
          mean: round(current.spread_bps + 0.5),
          stddev: 0.42,
          sample_count: 48,
          min_value: round(current.spread_bps - 1.8, 4),
          max_value: round(current.spread_bps + 1.9, 4),
          m2: round(10.6 + step * 0.7, 4),
        },
        obi_l1: {
          latest_value: current.obi_l1,
          mean: 0.11,
          stddev: 0.17,
          sample_count: 48,
          min_value: -0.92,
          max_value: 0.94,
          m2: round(8.4 + step * 0.4, 4),
        },
        obi_top_5: {
          latest_value: current.obi_top_5,
          mean: 0.09,
          stddev: 0.14,
          sample_count: 48,
          min_value: -0.62,
          max_value: 0.67,
          m2: round(6.2 + step * 0.3, 4),
        },
        traded_volume: {
          latest_value: current.traded_volume,
          mean: Math.round(current.traded_volume * 0.81),
          stddev: Math.round(current.traded_volume * 0.11),
          sample_count: 48,
          min_value: Math.round(current.traded_volume * 0.28),
          max_value: Math.round(current.traded_volume * 1.08),
          m2: Math.round(current.traded_volume * 280),
        },
        traded_value: {
          latest_value: current.traded_value,
          mean: Math.round(current.traded_value * 0.84),
          stddev: Math.round(current.traded_value * 0.09),
          sample_count: 48,
          min_value: Math.round(current.traded_value * 0.22),
          max_value: Math.round(current.traded_value * 1.11),
          m2: Math.round(current.traded_value * 320),
        },
        value_rate: {
          latest_value: Math.round(current.traded_value * 0.00018),
          mean: Math.round(current.traded_value * 0.00014),
          stddev: Math.round(current.traded_value * 0.00004),
          sample_count: 48,
          min_value: Math.round(current.traded_value * 0.00002),
          max_value: Math.round(current.traded_value * 0.00026),
          m2: Math.round(current.traded_value * 0.034),
        },
        volume_rate: {
          latest_value: Math.round(current.traded_volume * 0.016),
          mean: Math.round(current.traded_volume * 0.011),
          stddev: Math.round(current.traded_volume * 0.004),
          sample_count: 48,
          min_value: Math.round(current.traded_volume * 0.001),
          max_value: Math.round(current.traded_volume * 0.029),
          m2: Math.round(current.traded_volume * 2.4),
        },
      },
      previous_stats: {},
      snapshots: [],
    },
  }
}

function buildSeasonalityProfileFixture(symbol: string, index: number) {
  const baseVolume = 12000 + index * 1500
  const hourKeys = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00']

  const mondayHours = Object.fromEntries(
    hourKeys.map((hour, hourIndex) => [
      hour,
      {
        accumulated_volume: Math.round(baseVolume * (1.3 - hourIndex * 0.06)),
      },
    ]),
  )

  const thursdayHours = Object.fromEntries(
    hourKeys.map((hour, hourIndex) => [
      hour,
      {
        accumulated_volume: Math.round(baseVolume * (0.82 + hourIndex * 0.03)),
      },
    ]),
  )

  return {
    pk: symbol,
    sk: 'seasonality_profile',
    record_type: 'seasonality_profile',
    symbol,
    bucket_granularity_minutes: 30,
    timezone: 'America/Bogota',
    total_days_processed: 18,
    total_snapshots_processed: 2400,
    weekly_profile: {
      '1': {
        weekday_label: 'monday',
        days_processed: 4,
        accumulated_day_volume: Object.values(mondayHours).reduce((sum, bucket) => sum + bucket.accumulated_volume, 0),
        hours: mondayHours,
      },
      '4': {
        weekday_label: 'thursday',
        days_processed: 4,
        accumulated_day_volume: Object.values(thursdayHours).reduce((sum, bucket) => sum + bucket.accumulated_volume, 0),
        hours: thursdayHours,
      },
    },
  }
}

export const analyticsSnapshotFixtures = Object.fromEntries(
  mockSymbols.map((symbol, index) => [symbol, buildSnapshotFixture(symbol, index)]),
) as Record<string, ReturnType<typeof buildSnapshotFixture>>

export const analyticsHistoricStatsFixtures = Object.fromEntries(
  Object.entries(analyticsSnapshotFixtures).map(([symbol, fixture]) => [
    symbol,
    {
      status: 'ok',
      result: {
        symbol,
        metric: null,
        record_count: Object.keys(fixture.result.current_stats).length + 1,
        records: [
          ...Object.entries(fixture.result.current_stats).map(([metric, stat]) => ({
            pk: symbol,
            metric,
            ...stat,
          })),
          buildSeasonalityProfileFixture(symbol, mockSymbols.indexOf(symbol as (typeof mockSymbols)[number])),
        ],
      },
    },
  ]),
) as Record<
  string,
  {
    status: 'ok'
    result: {
      symbol: string
      metric: null
      record_count: number
      records: Array<Record<string, unknown>>
    }
  }
>

export const analyticsCatalogFixture = {
  status: 'ok',
  result: {
    symbols: [...mockSymbols],
    symbol_count: mockSymbols.length,
    trading_date: '2026-08-21',
    to_timestamp: '2026-08-21T14:30:00-05:00',
    record_count: mockSymbols.length,
    records: mockSymbols.map((symbol, index) => {
      const snapshotFixture = analyticsSnapshotFixtures[symbol]
      return {
        symbol,
        current_snapshot_key: {
          symbol,
          captured_at: snapshotFixture.result.current_snapshot.captured_at,
        },
        previous_snapshot_key:
          index % 5 === 0
            ? null
            : {
                symbol,
                captured_at: snapshotFixture.result.previous_snapshot?.captured_at ?? snapshotFixture.result.current_snapshot.captured_at,
              },
      }
    }),
  },
} as const

function buildZscoreOpportunityFixture(symbol: string, tradingDate: string, index: number) {
  const snapshotFixture = analyticsSnapshotFixtures[symbol]
  const current = snapshotFixture.result.current_snapshot
  const previous = snapshotFixture.result.previous_snapshot ?? current
  const dayOffset = tradingDate === '2026-08-21' ? 0 : 1
  const capturedTimes = tradingDate === '2026-08-21' ? ['09:45:08', '11:15:08', '14:05:08'] : ['13:10:08', '15:30:08', '16:20:08']

  const records = capturedTimes.map((time, timeIndex) => {
    const drift = (index + 1) * (timeIndex + 1) * (dayOffset === 0 ? 1 : -1)
    return {
      snapshot_checksum: `${symbol.toLowerCase()}-${tradingDate}-${timeIndex + 1}`,
      symbol,
      trading_date: tradingDate,
      captured_at: `${tradingDate}T${time}-05:00`,
      last_price: Math.round((dayOffset === 0 ? current.last_price : previous.last_price) + drift * 14),
      daily_change_amount: round((dayOffset === 0 ? current.daily_change_amount : previous.daily_change_amount) + drift * 2.5),
      daily_change_percent: round(((dayOffset === 0 ? current.daily_change_percent : previous.daily_change_percent) + drift * 0.9) / 100, 4),
      previous_close: dayOffset === 0 ? current.previous_close : previous.previous_close,
      high_price: Math.round((dayOffset === 0 ? current.high_price : previous.high_price) + Math.max(drift, 0) * 10),
      low_price: Math.round((dayOffset === 0 ? current.low_price : previous.low_price) - Math.max(-drift, 0) * 10),
      triggered_z_scores: {
        obi_l1: {
          sample_value: round((current.obi_l1 ?? 0) + drift * 0.03, 4),
          z_score: round(((current.obi_l1 ?? 0) + drift * 0.03) / 0.18, 2),
        },
        obi_top_5: {
          sample_value: round((current.obi_top_5 ?? 0) + drift * 0.025, 4),
          z_score: round(((current.obi_top_5 ?? 0) + drift * 0.025) / 0.16, 2),
        },
        spread_bps: {
          sample_value: round((current.spread_bps ?? 0) + drift * 0.11, 4),
          z_score: round((((current.spread_bps ?? 0) + drift * 0.11) - 4.2) / 0.42, 2),
        },
        traded_value: {
          sample_value: Math.round((dayOffset === 0 ? current.traded_value : previous.traded_value) * (1 + drift * 0.006)),
          z_score: round(1.1 + drift * 0.18, 2),
        },
        traded_volume: {
          sample_value: Math.round((dayOffset === 0 ? current.traded_volume : previous.traded_volume) * (1 + drift * 0.01)),
          z_score: round(0.9 + drift * 0.16, 2),
        },
      },
    }
  })

  return {
    status: 'ok',
    result: {
      symbol,
      trading_date: tradingDate,
      record_count: records.length,
      records,
    },
  }
}

export const zscoreOpportunitiesFixtures = Object.fromEntries(
  mockSymbols.flatMap((symbol, index) => [
    [`${symbol}:2026-08-21`, buildZscoreOpportunityFixture(symbol, '2026-08-21', index)],
    [`${symbol}:2026-08-20`, buildZscoreOpportunityFixture(symbol, '2026-08-20', index)],
  ]),
) as Record<string, ReturnType<typeof buildZscoreOpportunityFixture>>

function buildDailyClosingFixture(symbol: string, index: number) {
  const snapshotFixture = analyticsSnapshotFixtures[symbol]
  const current = snapshotFixture.result.current_snapshot
  const assetName = `${symbol} Holdings`
  const days = Array.from({ length: 10 }, (_, dayIndex) => dayIndex)

  const records = days.map((dayIndex) => {
    const tradingDate = new Date(`2026-08-12T15:00:00-05:00`)
    tradingDate.setDate(tradingDate.getDate() + dayIndex)

    const drift = (index + 1) * (dayIndex - 4)
    const lastPrice = Math.round((current.last_price ?? 0) + drift * 52)
    const previousClose = Math.round(lastPrice - 120 + drift * 3)
    const dailyChangeAmount = lastPrice - previousClose
    const dailyChangePercent = previousClose === 0 ? 0 : round((dailyChangeAmount / previousClose) * 10000, 2)
    const bestBid = lastPrice - 20
    const bestAsk = lastPrice + 20
    const highPrice = lastPrice + 190 + Math.max(drift, 0) * 9
    const lowPrice = lastPrice - 210 - Math.max(-drift, 0) * 9
    const tradedVolume = Math.max(5000, Math.round((current.traded_volume ?? 0) * (0.55 + dayIndex * 0.07)))
    const tradedValue = Math.max(10_000_000, Math.round((current.traded_value ?? 0) * (0.5 + dayIndex * 0.065)))
    const sourceCapturedAt = new Date(tradingDate.getTime() + 62_000).toISOString().replace('Z', '-05:00')
    const storedAt = new Date(tradingDate.getTime() + 1_200_000).toISOString().replace('Z', '-05:00')

    return {
      symbol,
      trading_date: tradingDate.toISOString().slice(0, 10),
      asset_name: assetName,
      best_ask_price: bestAsk,
      best_bid_price: bestBid,
      currency: 'COP',
      daily_change_amount: dailyChangeAmount,
      daily_change_percent: dailyChangePercent,
      high_price: highPrice,
      last_price: lastPrice,
      low_price: lowPrice,
      previous_close: previousClose,
      record_type: 'daily_closing_snapshot',
      source_captured_at: sourceCapturedAt,
      source_snapshot_checksum: `${symbol.toLowerCase()}-close-${dayIndex + 1}`,
      stored_at: storedAt,
      timezone: 'America/Bogota',
      traded_value: tradedValue,
      traded_volume: tradedVolume,
    }
  })

  return {
    status: 'ok',
    result: {
      symbol,
      trading_date: records[records.length - 1]?.trading_date ?? null,
      record_count: records.length,
      records,
    },
  }
}

export const dailyClosingFixtures = Object.fromEntries(
  mockSymbols.map((symbol, index) => [symbol, buildDailyClosingFixture(symbol, index)]),
) as Record<string, ReturnType<typeof buildDailyClosingFixture>>
