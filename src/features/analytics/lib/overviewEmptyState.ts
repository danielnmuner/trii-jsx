/**
 * Message for an empty Overview, naming the real cause instead of a generic one:
 * - nothing captured for the trading day being shown (capture stopped, or before the first capture),
 * - snapshots exist but no issuer has enough historic samples,
 * - nothing received at all.
 */
export function describeOverviewEmptyState(input: {
  tradingDate: string | null
  /** Snapshots for the shown trading day, before the sample-support filter. */
  tradingDaySnapshotCount: number
  /** Latest capture received from the API, any day. */
  latestCapturedAt: string | null
}) {
  if (input.tradingDaySnapshotCount > 0) {
    return { title: 'No Data', description: 'No symbols meet the minimum sample support required for overview.' }
  }

  if (!input.latestCapturedAt) {
    return { title: 'No Data', description: 'No snapshots have been received for the active issuers.' }
  }

  const day = input.tradingDate ? formatTradingDate(input.tradingDate) : 'today'
  return {
    title: `No Data for ${day}`,
    description: `Nothing has been captured for ${day} yet. Last capture: ${formatCapture(input.latestCapturedAt)}.`,
  }
}

function formatTradingDate(tradingDate: string) {
  // Noon UTC keeps the calendar day stable in any viewer time zone.
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(
    new Date(`${tradingDate}T12:00:00Z`),
  )
}

function formatCapture(capturedAt: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Bogota',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(new Date(capturedAt))
      .map((part) => [part.type, part.value]),
  )
  return `${parts.month} ${parts.day}, ${parts.hour}:${parts.minute}`
}
