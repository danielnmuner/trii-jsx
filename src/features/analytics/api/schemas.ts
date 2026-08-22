import { z } from 'zod'

export const depthLevelSchema = z.object({
  level: z.number().optional(),
  price: z.number().optional(),
  quantity: z.number().optional(),
})

export const snapshotRecordSchema = z
  .object({
    symbol: z.string(),
    captured_at: z.string(),
    last_price: z.number().nullable().optional(),
    previous_close: z.number().nullable().optional(),
    daily_change_amount: z.number().nullable().optional(),
    daily_change_percent: z.number().nullable().optional(),
    best_bid_price: z.number().nullable().optional(),
    best_ask_price: z.number().nullable().optional(),
    high_price: z.number().nullable().optional(),
    low_price: z.number().nullable().optional(),
    spread_bps: z.number().nullable().optional(),
    obi_l1: z.number().nullable().optional(),
    obi_top_5: z.number().nullable().optional(),
    microprice: z.number().nullable().optional(),
    mid_price: z.number().nullable().optional(),
    depth_weighted_microprice_deviation: z.number().nullable().optional(),
    traded_volume: z.number().nullable().optional(),
    traded_value: z.number().nullable().optional(),
    bid_levels: z.array(depthLevelSchema).optional(),
    ask_levels: z.array(depthLevelSchema).optional(),
  })
  .passthrough()

export const historicStatSchema = z
  .object({
    pk: z.string().optional(),
    sk: z.string().optional(),
    symbol: z.string().optional(),
    metric: z.string().optional(),
    latest_value: z.number().nullable().optional(),
    mean: z.number().nullable().optional(),
    stddev: z.number().nullable().optional(),
    m2: z.number().nullable().optional(),
    min_value: z.number().nullable().optional(),
    max_value: z.number().nullable().optional(),
    sample_count: z.number().optional().default(0),
  })
  .passthrough()

export const seasonalityBucketStatSchema = z
  .object({
    sample_count: z.number().optional(),
    mu: z.number().nullable().optional(),
    m2: z.number().nullable().optional(),
    variance: z.number().nullable().optional(),
    sigma: z.number().nullable().optional(),
  })
  .passthrough()

export const seasonalityHourBucketSchema = z
  .object({
    accumulated_volume: z.number().nullable().optional(),
    accumulated_value: z.number().nullable().optional(),
    delta_samples: z.number().optional(),
    bucket_vwap: z.number().nullable().optional(),
    volume_share_stats: seasonalityBucketStatSchema.optional(),
    vwap_stats: seasonalityBucketStatSchema.optional(),
    volume_rate_stats: seasonalityBucketStatSchema.optional(),
    value_rate_stats: seasonalityBucketStatSchema.optional(),
  })
  .passthrough()

export const seasonalityWeekdayProfileSchema = z
  .object({
    weekday_label: z.string().optional(),
    days_processed: z.number().optional(),
    accumulated_day_volume: z.number().nullable().optional(),
    accumulated_day_value: z.number().nullable().optional(),
    hours: z.record(z.string(), seasonalityHourBucketSchema).optional().default({}),
  })
  .passthrough()

export const seasonalityProfileSchema = z
  .object({
    pk: z.string().optional(),
    sk: z.string().optional(),
    record_type: z.string().optional(),
    symbol: z.string().optional(),
    bucket_granularity_minutes: z.number().optional(),
    timezone: z.string().optional(),
    total_days_processed: z.number().optional(),
    total_snapshots_processed: z.number().optional(),
    last_source_captured_at: z.string().optional(),
    last_updated_at: z.string().optional(),
    stats_scope: z.string().optional(),
    stats_version: z.number().optional(),
    pending_day: z
      .object({
        trading_date: z.string().optional(),
        weekday: z.string().optional(),
        last_source_captured_at: z.string().optional(),
        total_day_volume: z.number().nullable().optional(),
        total_day_value: z.number().nullable().optional(),
        hours: z
          .record(
            z.string(),
            z.object({
              bucket_volume: z.number().nullable().optional(),
              bucket_value: z.number().nullable().optional(),
            }),
          )
          .optional()
          .default({}),
      })
      .optional(),
    weekly_profile: z.record(z.string(), seasonalityWeekdayProfileSchema).optional().default({}),
  })
  .passthrough()

export const analyticsCatalogRecordSchema = z.object({
  symbol: z.string(),
  current_snapshot_key: z
    .object({
      symbol: z.string(),
      captured_at: z.string(),
    })
    .nullable()
    .optional(),
  previous_snapshot_key: z
    .object({
      symbol: z.string(),
      captured_at: z.string(),
    })
    .nullable()
    .optional(),
})

export const analyticsCatalogResponseSchema = z.object({
  status: z.literal('ok'),
  result: z.object({
    symbols: z.array(z.string()),
    symbol_count: z.number(),
    trading_date: z.string().nullable(),
    to_timestamp: z.string().nullable(),
    record_count: z.number(),
    records: z.array(analyticsCatalogRecordSchema).optional().default([]),
  }),
})

export const analyticsSnapshotResponseSchema = z.object({
  status: z.literal('ok'),
  result: z.object({
    symbol: z.string(),
    record_count: z.number(),
    from_timestamp: z.string(),
    to_timestamp: z.string(),
    current_snapshot: snapshotRecordSchema,
    previous_snapshot: snapshotRecordSchema.nullable(),
    snapshots: z.array(snapshotRecordSchema),
  }),
})

export const analyticsHistoricStatsResponseSchema = z.object({
  status: z.literal('ok'),
  result: z.object({
    symbol: z.string(),
    metric: z.string().nullable().optional(),
    record_count: z.number(),
    records: z.array(z.union([historicStatSchema, seasonalityProfileSchema])),
  }),
})

export const zscoreMetricSampleSchema = z
  .object({
    sample_value: z.number().nullable().optional(),
    z_score: z.number().nullable().optional(),
  })
  .passthrough()

export const zscoreOpportunityRecordSchema = z
  .object({
    snapshot_checksum: z.string().optional(),
    symbol: z.string(),
    trading_date: z.string().nullable().optional(),
    captured_at: z.string(),
    last_price: z.number().nullable().optional(),
    daily_change_amount: z.number().nullable().optional(),
    daily_change_percent: z.number().nullable().optional(),
    previous_close: z.number().nullable().optional(),
    high_price: z.number().nullable().optional(),
    low_price: z.number().nullable().optional(),
    triggered_z_scores: z
      .object({
        obi_l1: zscoreMetricSampleSchema.optional(),
        obi_top_5: zscoreMetricSampleSchema.optional(),
        spread_bps: zscoreMetricSampleSchema.optional(),
        traded_value: zscoreMetricSampleSchema.optional(),
        traded_volume: zscoreMetricSampleSchema.optional(),
      })
      .partial()
      .passthrough()
      .default({}),
  })
  .passthrough()

export const zscoreOpportunityResponseSchema = z.object({
  status: z.literal('ok'),
  result: z.object({
    symbol: z.string().nullable().optional(),
    trading_date: z.string().nullable().optional(),
    record_count: z.number(),
    records: z.array(zscoreOpportunityRecordSchema),
  }),
})

export const dailyClosingRecordSchema = z
  .object({
    symbol: z.string(),
    trading_date: z.string(),
    asset_name: z.string().nullable().optional(),
    best_ask_price: z.number().nullable().optional(),
    best_bid_price: z.number().nullable().optional(),
    currency: z.string().nullable().optional(),
    daily_change_amount: z.number().nullable().optional(),
    daily_change_percent: z.number().nullable().optional(),
    high_price: z.number().nullable().optional(),
    last_price: z.number().nullable().optional(),
    low_price: z.number().nullable().optional(),
    previous_close: z.number().nullable().optional(),
    record_type: z.string().nullable().optional(),
    source_captured_at: z.string().nullable().optional(),
    source_snapshot_checksum: z.string().nullable().optional(),
    stored_at: z.string().nullable().optional(),
    timezone: z.string().nullable().optional(),
    traded_value: z.number().nullable().optional(),
    traded_volume: z.number().nullable().optional(),
  })
  .passthrough()

export const dailyClosingResponseSchema = z.object({
  status: z.literal('ok'),
  result: z.object({
    symbol: z.string().nullable().optional(),
    trading_date: z.string().nullable().optional(),
    record_count: z.number(),
    records: z.array(dailyClosingRecordSchema),
  }),
})

export type AnalyticsCatalogResponse = z.infer<typeof analyticsCatalogResponseSchema>
export type AnalyticsSnapshotResponse = z.infer<typeof analyticsSnapshotResponseSchema>
export type AnalyticsSnapshotResult = AnalyticsSnapshotResponse['result']
export type AnalyticsHistoricStatsResponse = z.infer<typeof analyticsHistoricStatsResponseSchema>
export type AnalyticsHistoricStatsResult = AnalyticsHistoricStatsResponse['result']
export type SnapshotRecord = z.infer<typeof snapshotRecordSchema>
export type HistoricStat = z.infer<typeof historicStatSchema>
export type SeasonalityProfile = z.infer<typeof seasonalityProfileSchema>
export type ZscoreMetricSample = z.infer<typeof zscoreMetricSampleSchema>
export type ZscoreOpportunityRecord = z.infer<typeof zscoreOpportunityRecordSchema>
export type ZscoreOpportunityResponse = z.infer<typeof zscoreOpportunityResponseSchema>
export type DailyClosingRecord = z.infer<typeof dailyClosingRecordSchema>
export type AnalyticsSymbolFeed = AnalyticsSnapshotResult & {
  current_stats: Record<string, HistoricStat>
  seasonality_profile?: SeasonalityProfile
}
