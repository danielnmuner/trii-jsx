import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DataTable } from '../../../shared/ui/DataTable'
import { parseStockOrdersCsv, type StockOrdersUploadResult } from '../lib/stockOrders'
import { submitStockOrders } from '../api/client'
import { useOrderTraceability } from '../hooks/useOrderTraceability'
import type { StockOrdersLookupRecord } from '../api/schemas'

type NoticeState = {
  tone: 'error' | 'success' | 'info'
  text: string
} | null

type PaperworkPanelProps = {
  symbols: string[]
}

type OrderTraceEntry = {
  id: string
  symbol: string
  createdAt: string | null
  importedAt: string | null
  importLagMs: number | null
}

const BOGOTA_TIMEZONE = 'America/Bogota'
const PAPERWORK_USERS = [
  { label: 'Olaty', value: 'olaty' },
  { label: 'Leinda', value: 'leinda' },
] as const

export function PaperworkPanel({ symbols }: PaperworkPanelProps) {
  const queryClient = useQueryClient()
  const [selectedUserName, setSelectedUserName] = useState<string>('')
  const [ordersFile, setOrdersFile] = useState<File | null>(null)
  const [ordersResult, setOrdersResult] = useState<StockOrdersUploadResult | null>(null)
  const [ordersNotice, setOrdersNotice] = useState<NoticeState>(null)
  const [ordersPending, setOrdersPending] = useState(false)

  const traceSymbols = useMemo(
    () => symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean),
    [symbols],
  )
  const selectedUserLabel = PAPERWORK_USERS.find((user) => user.value === selectedUserName)?.label ?? ''
  const traceabilityQuery = useOrderTraceability(traceSymbols, selectedUserName || null)
  const traceEntries = useMemo(() => {
    return traceabilityQuery.records
      .map((record, index) => buildOrderTraceEntry(String(record.symbol ?? '').trim().toUpperCase(), record, index))
      .filter((entry) => entry.createdAt && entry.importedAt)
      .sort((left, right) => {
        const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : Number.NEGATIVE_INFINITY
        const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : Number.NEGATIVE_INFINITY
        return rightTime - leftTime
      })
  }, [traceabilityQuery.records])
  const userRequiredNotice = selectedUserLabel
    ? null
    : 'Select a user before loading or uploading orders.'

  const ensureUserSelected = () => {
    if (selectedUserName) {
      return true
    }

    setOrdersNotice({
      tone: 'info',
      text: 'Select a user before continuing.',
    })
    return false
  }

  const handleValidateOrders = (sendRequested: boolean) => {
    void (async () => {
      setOrdersPending(true)
      setOrdersNotice(null)
      setOrdersResult(null)

      if (!ensureUserSelected()) {
        setOrdersPending(false)
        return
      }

      if (!ordersFile) {
        setOrdersNotice({
          tone: 'error',
          text: 'Upload a Trii orders CSV before continuing.',
        })
        setOrdersPending(false)
        return
      }

      try {
        const result = await parseStockOrdersCsv(ordersFile)
        setOrdersResult(result)

        if (!sendRequested) {
          setOrdersNotice({
            tone: 'success',
            text: 'The orders file passed validation and is ready to upload.',
          })
          return
        }

        const response = await submitStockOrders({
          fileName: ordersFile.name,
          records: result.records,
          sourceFileChecksum: result.sourceFileChecksum,
          userName: selectedUserName,
        })

        setOrdersNotice({
          tone: 'success',
          text: `Upload completed. Received ${response.result.received_records} rows, imported ${response.result.imported_records}, skipped ${response.result.duplicate_records} duplicates.`,
        })
        await queryClient.invalidateQueries({
          queryKey: ['paperwork', 'orders-trace'],
        })
      } catch (error) {
        setOrdersNotice({
          tone: 'error',
          text: getErrorMessage(error, 'The orders file could not be processed.'),
        })
      } finally {
        setOrdersPending(false)
      }
    })()
  }

  return (
    <section className="paperwork-grid" aria-label="Paperwork workspace">
      <div className="paperwork-column paperwork-column--trace">
        <article className="paperwork-card paperwork-card--trace">
          <OrderTraceabilityPanel
            entries={traceEntries}
            isLoading={traceabilityQuery.isLoading}
            isFetching={traceabilityQuery.isFetching}
            isError={traceabilityQuery.isError}
            hasUserSelected={Boolean(selectedUserName)}
          />
        </article>
      </div>

      <div className="paperwork-column paperwork-column--intake">
        <article className="paperwork-card">
          <header className="paperwork-card__header">
            <div className="paperwork-card__copy">
              <span className="paperwork-card__eyebrow">User</span>
              <h3 className="paperwork-card__title">
                <span>Paperwork owner</span>
              </h3>
              <p>Select the user before loading orders into the workflow.</p>
            </div>
          </header>

          <div className="paperwork-userField">
            <label className="paperwork-userField__label" htmlFor="paperwork-user-name">
              User name
            </label>
            <select
              id="paperwork-user-name"
              className="paperwork-userField__select"
              value={selectedUserName}
              onChange={(event) => {
                setSelectedUserName(event.target.value)
                setOrdersNotice(null)
              }}
            >
              <option value="">Select user</option>
              {PAPERWORK_USERS.map((user) => (
                <option key={user.value} value={user.value}>
                  {user.label}
                </option>
              ))}
            </select>
            {userRequiredNotice ? (
              <span className="paperwork-userField__hint">{userRequiredNotice}</span>
            ) : null}
          </div>
        </article>

        <article className="paperwork-card">
          <header className="paperwork-card__header">
            <div className="paperwork-card__copy">
              <span className="paperwork-card__eyebrow">Orders</span>
              <h3 className="paperwork-card__title">
                <img src="/icons/trii.png" alt="Trii" className="paperwork-card__logo paperwork-card__logo--trii" />
                <span>Stock orders intake</span>
              </h3>
              <p>
                Validate the Trii orders CSV locally, inspect the normalized output, and only then
                push new rows to DynamoDB.
              </p>
            </div>
          </header>

          <div className="paperwork-uploader">
            <label className="paperwork-uploader__dropzone">
              <span className="paperwork-uploader__label">Orders CSV</span>
              <span className="paperwork-uploader__hint">
                Expect the exact Trii export structure.
              </span>
              <input
                className="paperwork-uploader__input"
                type="file"
                accept=".csv,text/csv"
                disabled={!selectedUserName}
                onChange={(event) => {
                  setOrdersFile(event.target.files?.[0] ?? null)
                  setOrdersResult(null)
                  setOrdersNotice(null)
                }}
              />
              <span className="paperwork-uploader__fileName">
                {ordersFile ? ordersFile.name : 'Select a CSV file'}
              </span>
            </label>

            <div className="paperwork-actions">
              <button
                type="button"
                className="paperwork-button paperwork-button--secondary"
                onClick={() => handleValidateOrders(false)}
                disabled={ordersPending || !selectedUserName}
              >
                {ordersPending ? 'Working...' : 'Validate'}
              </button>
              <button
                type="button"
                className="paperwork-button paperwork-button--primary"
                onClick={() => handleValidateOrders(true)}
                disabled={ordersPending || !selectedUserName}
              >
                {ordersPending ? 'Uploading...' : 'Validate & Upload'}
              </button>
            </div>
          </div>

          {ordersNotice ? <NoticeBanner notice={ordersNotice} /> : null}

          {ordersResult ? (
            <>
              <div className="paperwork-metrics">
                <MetricPill label="Valid rows" value={String(ordersResult.recordCount)} />
                <MetricPill label="Symbols" value={String(ordersResult.symbols.length)} />
                <MetricPill label="Timezone" value={ordersResult.timezone} />
              </div>

              <dl className="paperwork-details">
                <div>
                  <dt>Internal name</dt>
                  <dd>{ordersResult.storageName}</dd>
                </div>
                <div>
                  <dt>Captured at</dt>
                  <dd>{ordersResult.capturedAt}</dd>
                </div>
                <div>
                  <dt>Detected symbols</dt>
                  <dd>{ordersResult.symbols.join(', ')}</dd>
                </div>
              </dl>

              <section className="paperwork-preview">
                <div className="paperwork-preview__header">
                  <h4>Normalized preview</h4>
                  <p>The first rows shown here are already mapped to the backend contract.</p>
                </div>
                <DataTable rows={ordersResult.previewRows} />
              </section>
            </>
          ) : null}
        </article>
      </div>
    </section>
  )
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="paperwork-metricPill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function NoticeBanner({ notice }: { notice: Exclude<NoticeState, null> }) {
  return (
    <div className={`paperwork-notice paperwork-notice--${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
      {notice.text}
    </div>
  )
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function OrderTraceabilityPanel(props: {
  entries: OrderTraceEntry[]
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  hasUserSelected: boolean
}) {
  const { entries, isLoading, isFetching, isError, hasUserSelected } = props
  const status = isError ? 'Degraded' : isLoading ? 'Loading' : isFetching ? 'Syncing' : 'Live'

  return (
    <aside className="paperwork-trace" aria-label="Orders cloud traceability">
      <div className="paperwork-trace__header">
        <div className="paperwork-trace__copy">
          <h3 className="paperwork-trace__title">Cloud Trace</h3>
          <p>Recent approved-order intake seen in AWS for each active symbol.</p>
        </div>
        <span className={`paperwork-trace__status paperwork-trace__status--${status.toLowerCase()}`}>
          {status}
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="paperwork-trace__empty">
          {hasUserSelected
            ? 'Select at least one symbol in the core strip to inspect order upload latency.'
            : 'Select a user first to inspect order upload latency.'}
        </div>
      ) : (
        <div className="paperwork-trace__grid">
          {entries.map((entry) => (
            <article key={entry.id} className="paperwork-traceCard">
              <div className="paperwork-traceCard__head">
                <strong>{entry.symbol}</strong>
                <span>{formatShortBogotaTimestamp(entry.createdAt)}</span>
              </div>

              <div className="paperwork-traceCard__metrics">
                <div
                  className="paperwork-traceMetric"
                  title="Elapsed time between the original order creation timestamp and the moment the record was imported into AWS."
                >
                  <span>Created to Imported</span>
                  <strong className={`paperwork-traceMetric__value paperwork-traceMetric__value--${getImportLagTone(entry.importLagMs)}`}>
                    {formatDuration(entry.importLagMs)}
                  </strong>
                </div>
              </div>

              <div className="paperwork-traceCard__footer">
                <span title="Original order creation timestamp preserved from Trii.">
                  Origin {formatShortBogotaTimestamp(entry.createdAt)}
                </span>
                <span title="Import timestamp captured when the record reached AWS.">
                  Cloud {formatShortBogotaTimestamp(entry.importedAt)}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </aside>
  )
}

function buildOrderTraceEntry(
  symbol: string,
  record: StockOrdersLookupRecord | null,
  index: number,
): OrderTraceEntry {
  const { createdAt } = splitCreatedAtSymbol(record?.created_at_symbol ?? null)
  const importedAt = normalizeTimestamp(record?.imported_at ?? null)
  const createdTime = createdAt ? new Date(createdAt).getTime() : Number.NaN
  const importedTime = importedAt ? new Date(importedAt).getTime() : Number.NaN
  const recordId = record?.record_checksum?.trim() || record?.created_at_symbol?.trim() || `${symbol}-${index}`

  return {
    id: recordId,
    symbol,
    createdAt,
    importedAt,
    importLagMs:
      Number.isFinite(createdTime) && Number.isFinite(importedTime) ? importedTime - createdTime : null,
  }
}

function splitCreatedAtSymbol(value: string | null) {
  if (!value) {
    return {
      createdAt: null,
      symbol: null,
    }
  }

  const separatorIndex = value.lastIndexOf('#')
  if (separatorIndex === -1) {
    return {
      createdAt: normalizeTimestamp(value),
      symbol: null,
    }
  }

  return {
    createdAt: normalizeTimestamp(value.slice(0, separatorIndex)),
    symbol: value.slice(separatorIndex + 1) || null,
  }
}

function normalizeTimestamp(value: string | null) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function formatShortBogotaTimestamp(value: string | null) {
  if (!value) {
    return '--'
  }

  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) {
    return '--'
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BOGOTA_TIMEZONE,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(timestamp)

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}

function formatDuration(value: number | null) {
  if (value == null || value < 0 || Number.isNaN(value)) {
    return '--'
  }

  const totalSeconds = Math.floor(value / 1_000)
  const totalMinutes = Math.floor(totalSeconds / 60)
  const totalHours = Math.floor(totalMinutes / 60)
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  const minutes = totalMinutes % 60

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  }

  if (totalHours > 0) {
    return minutes > 0 ? `${totalHours}h ${minutes}m` : `${totalHours}h`
  }

  if (totalMinutes > 0) {
    return `${totalMinutes}m`
  }

  return `${Math.max(totalSeconds, 0)}s`
}

function getImportLagTone(value: number | null) {
  if (value == null || Number.isNaN(value)) {
    return 'muted'
  }

  const hours = value / 3_600_000
  if (hours < 24) {
    return 'good'
  }

  return 'late'
}
