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
        spread_bps: {
          latest_value: current.spread_bps,
          mean: round(current.spread_bps + 0.5),
          stddev: 0.42,
          sample_count: 48,
        },
        obi_l1: {
          latest_value: current.obi_l1,
          mean: 0.11,
          stddev: 0.17,
          sample_count: 48,
        },
        obi_top_5: {
          latest_value: current.obi_top_5,
          mean: 0.09,
          stddev: 0.14,
          sample_count: 48,
        },
        traded_volume: {
          latest_value: current.traded_volume,
          mean: Math.round(current.traded_volume * 0.81),
          stddev: Math.round(current.traded_volume * 0.11),
          sample_count: 48,
        },
        traded_value: {
          latest_value: current.traded_value,
          mean: Math.round(current.traded_value * 0.84),
          stddev: Math.round(current.traded_value * 0.09),
          sample_count: 48,
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

export const zscoreOpportunitiesFixture = {
  status: 'ok',
  result: {
    symbol: 'NUCO',
    trading_date: '2026-08-21',
    record_count: 2,
    records: [
      {
        snapshot_checksum: 'checksum-1',
        symbol: 'NUCO',
        trading_date: '2026-08-21',
        captured_at: '2026-08-21T10:56:08-05:00',
        triggered_z_scores: {
          spread_bps: { sample_value: 4.35, z_score: -1.79 },
          traded_value: { sample_value: 11483533480, z_score: 1.76 },
          traded_volume: { sample_value: 126721, z_score: 1.75 },
        },
      },
      {
        snapshot_checksum: 'checksum-2',
        symbol: 'NUCO',
        trading_date: '2026-08-21',
        captured_at: '2026-08-21T11:12:08-05:00',
        triggered_z_scores: {
          spread_bps: { sample_value: 4.18, z_score: -1.41 },
          traded_value: { sample_value: 11302121210, z_score: 1.62 },
          traded_volume: { sample_value: 121551, z_score: 1.44 },
        },
      },
    ],
  },
} as const

export const dailyClosingFixture = {
  status: 'ok',
  result: {
    symbol: 'NUCO',
    trading_date: null,
    record_count: 2,
    records: [
      {
        symbol: 'NUCO',
        trading_date: '2026-08-20',
        record_type: 'daily_closing_snapshot',
        last_price: 44000,
        previous_close: 43120,
        traded_volume: 211004,
        traded_value: 18500000000,
      },
      {
        symbol: 'NUCO',
        trading_date: '2026-08-19',
        record_type: 'daily_closing_snapshot',
        last_price: 43680,
        previous_close: 42910,
        traded_volume: 198772,
        traded_value: 17342000000,
      },
    ],
  },
} as const
