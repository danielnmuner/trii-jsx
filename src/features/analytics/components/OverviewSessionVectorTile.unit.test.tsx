import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OverviewSessionVectorTile } from './OverviewSessionVectorTile'

describe('OverviewSessionVectorTile', () => {
  it('renders the current-day segment when the endpoint left-pads segment zero', () => {
    render(
      <OverviewSessionVectorTile
        dataset={{
          symbol: 'CEMARGOS',
          tradingDate: '2026-09-07',
          samplingSeconds: 30,
          samplesPerSegment: 156,
          segmentCount: 1,
          manifest: {
            symbol: 'CEMARGOS',
            trading_date: '2026-09-07',
            session_start: '2026-09-07T08:30:00-05:00',
            latest_sample_index: 78,
            segment_count: 1,
            samples_per_segment: 156,
            sampling_seconds: 30,
          },
          segments: [
            {
              symbol: 'CEMARGOS',
              trading_date: '2026-09-07',
              segment_index: 0,
              from_sample_index: 42,
              to_sample_index: 78,
              last_price_series: [
                ...Array.from({ length: 42 }, () => null),
                10820, null, null, null, 10820, null, 10820, null, 10820, null, 10820, null,
                10820, null, 10820, null, 10820, null, 10820, null, 10820, null, 10820, null,
                10820, null, 10820, null, 10820, null, 10800, null, 10800, null, 10800,
              ],
              mid_price_series: [
                ...Array.from({ length: 42 }, () => null),
                10840, null, null, null, 10840, null, 10840, null, 10820, null, 10820, null,
                10820, null, 10820, null, 10820, null, 10820, null, 10820, null, 10820, null,
                10820, null, 10820, null, 10820, null, 10800, null, 10800, null, 10800,
              ],
              microprice_series: [
                ...Array.from({ length: 42 }, () => null),
                10831.28, null, null, null, 10831.99, null, 10831.99, null, 10816.09, null, 10808.6, null,
                10808.09, null, 10808.09, null, 10808.09, null, 10808.09, null, 10807.56, null, 10807.56, null,
                10807.56, null, 10807.56, null, 10807.57, null, 10807.57, null, 10790.56, null, 10777.75,
              ],
              vwap_series: [
                ...Array.from({ length: 42 }, () => null),
                10841.42, null, null, null, 10841.42, null, 10841.42, null, 10828.51, null, 10827.86, null,
                10827.86, null, 10827.86, null, 10827.86, null, 10827.81, null, 10827.81, null, 10827.81, null,
                10827.81, null, 10827.81, null, 10827.79, null, 10827.79, null, 10820.7, null, 10820.7,
              ],
            },
          ],
        }}
      />,
    )

    expect(screen.getByText('08:51')).toBeInTheDocument()
    expect(screen.getByText('37 pts')).toBeInTheDocument()
    expect(screen.getByText('09:09')).toBeInTheDocument()
  })
})
