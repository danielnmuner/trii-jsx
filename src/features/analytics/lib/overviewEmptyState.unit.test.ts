import { describeOverviewEmptyState } from './overviewEmptyState'

describe('describeOverviewEmptyState', () => {
  it('says nothing was captured for the shown day and when the last capture was', () => {
    expect(
      describeOverviewEmptyState({
        tradingDate: '2026-11-26',
        tradingDaySnapshotCount: 0,
        latestCapturedAt: '2026-11-25T16:01:17.524-05:00',
      }),
    ).toEqual({
      title: 'No Data for Nov 26',
      description: 'Nothing has been captured for Nov 26 yet. Last capture: Nov 25, 16:01.',
    })
  })

  it('keeps the sample-support message only when that is really the cause', () => {
    expect(
      describeOverviewEmptyState({ tradingDate: '2026-11-26', tradingDaySnapshotCount: 3, latestCapturedAt: '2026-11-26T10:00:00-05:00' })
        .description,
    ).toBe('No symbols meet the minimum sample support required for overview.')
  })

  it('handles no data received at all', () => {
    expect(describeOverviewEmptyState({ tradingDate: '2026-11-26', tradingDaySnapshotCount: 0, latestCapturedAt: null }).description).toBe(
      'No snapshots have been received for the active issuers.',
    )
  })
})
