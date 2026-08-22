import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DataTable } from '../../../shared/ui/DataTable'
import { parseStockOrdersCsv, type StockOrdersUploadResult } from '../lib/stockOrders'
import { prepareInvoiceArchives, type PreparedInvoiceArchives } from '../lib/invoiceArchives'
import { submitInvoiceDocuments, submitStockOrders } from '../api/client'
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
  symbol: string
  createdAt: string | null
  importedAt: string | null
  recordCount: number
  importLagMs: number | null
  ageMs: number | null
}

const BOGOTA_TIMEZONE = 'America/Bogota'

export function PaperworkPanel({ symbols }: PaperworkPanelProps) {
  const queryClient = useQueryClient()
  const [ordersFile, setOrdersFile] = useState<File | null>(null)
  const [ordersResult, setOrdersResult] = useState<StockOrdersUploadResult | null>(null)
  const [ordersNotice, setOrdersNotice] = useState<NoticeState>(null)
  const [ordersPending, setOrdersPending] = useState(false)

  const [invoiceFiles, setInvoiceFiles] = useState<File[]>([])
  const [invoiceResult, setInvoiceResult] = useState<PreparedInvoiceArchives | null>(null)
  const [invoiceNotice, setInvoiceNotice] = useState<NoticeState>(null)
  const [invoicePending, setInvoicePending] = useState(false)

  const invoicePreviewRows = useMemo(
    () => invoiceResult?.uploadResult.previewRows ?? [],
    [invoiceResult],
  )
  const traceSymbols = useMemo(
    () => symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean),
    [symbols],
  )
  const traceabilityQuery = useOrderTraceability(traceSymbols)
  const traceEntries = useMemo(() => {
    const resultMap = new Map(traceabilityQuery.results.map((result) => [result.symbol, result]))
    const now = Date.now()

    return traceSymbols
      .map((symbol) => {
        const result = resultMap.get(symbol)
        return buildOrderTraceEntry(symbol, result?.latestRecord ?? null, result?.recordCount ?? 0, now)
      })
      .filter((entry) => entry.recordCount > 0 && entry.createdAt && entry.importedAt)
  }, [traceSymbols, traceabilityQuery.results])

  const handleValidateOrders = (sendRequested: boolean) => {
    void (async () => {
      setOrdersPending(true)
      setOrdersNotice(null)
      setOrdersResult(null)

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

  const handleValidateInvoices = (sendRequested: boolean) => {
    void (async () => {
      setInvoicePending(true)
      setInvoiceNotice(null)
      setInvoiceResult(null)

      if (invoiceFiles.length === 0) {
        setInvoiceNotice({
          tone: 'error',
          text: 'Upload at least one invoice ZIP file before continuing.',
        })
        setInvoicePending(false)
        return
      }

      try {
        const prepared = await prepareInvoiceArchives(invoiceFiles)
        setInvoiceResult(prepared)

        if (!sendRequested) {
          setInvoiceNotice({
            tone: 'success',
            text: 'The invoice batch passed validation and is ready to upload.',
          })
          return
        }

        const response = await submitInvoiceDocuments({
          documents: prepared.documents,
        })

        setInvoiceNotice({
          tone: 'success',
          text: `Upload completed. ${response.result.uploaded_files} source files were persisted to ${response.result.bucket}.`,
        })
      } catch (error) {
        setInvoiceNotice({
          tone: 'error',
          text: getErrorMessage(error, 'The invoice batch could not be processed.'),
        })
      } finally {
        setInvoicePending(false)
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
          />
        </article>
      </div>

      <div className="paperwork-column paperwork-column--intake">
        <article className="paperwork-card">
          <header className="paperwork-card__header">
            <div className="paperwork-card__copy">
              <span className="paperwork-card__eyebrow">Invoices</span>
              <h3 className="paperwork-card__title">
                <img src="/icons/accival.png" alt="Accival" className="paperwork-card__logo paperwork-card__logo--accival" />
                <span>Invoice archives intake</span>
              </h3>
              <p>
                Inspect each ZIP in-browser, extract the XML and PDF pair, and then upload the
                normalized document batch to S3 through the API.
              </p>
            </div>
          </header>

          <div className="paperwork-uploader">
            <label className="paperwork-uploader__dropzone">
              <span className="paperwork-uploader__label">Invoice ZIP batch</span>
              <span className="paperwork-uploader__hint">
                Each ZIP must contain exactly one XML file and one PDF file.
              </span>
              <input
                className="paperwork-uploader__input"
                type="file"
                accept=".zip,application/zip"
                multiple
                onChange={(event) => {
                  setInvoiceFiles(Array.from(event.target.files ?? []))
                  setInvoiceResult(null)
                  setInvoiceNotice(null)
                }}
              />
              <span className="paperwork-uploader__fileName">
                {invoiceFiles.length > 0
                  ? `${invoiceFiles.length} ZIP file${invoiceFiles.length === 1 ? '' : 's'} selected`
                  : 'Select one or more ZIP files'}
              </span>
            </label>

            <div className="paperwork-fileList" aria-label="Selected invoice files">
              {invoiceFiles.slice(0, 8).map((file) => (
                <span key={`${file.name}-${file.size}`} className="paperwork-fileList__item">
                  {file.name}
                </span>
              ))}
            </div>

            <div className="paperwork-actions">
              <button
                type="button"
                className="paperwork-button paperwork-button--secondary"
                onClick={() => handleValidateInvoices(false)}
                disabled={invoicePending}
              >
                {invoicePending ? 'Working...' : 'Validate'}
              </button>
              <button
                type="button"
                className="paperwork-button paperwork-button--primary"
                onClick={() => handleValidateInvoices(true)}
                disabled={invoicePending}
              >
                {invoicePending ? 'Uploading...' : 'Validate & Upload'}
              </button>
            </div>
          </div>

          {invoiceNotice ? <NoticeBanner notice={invoiceNotice} /> : null}

          {invoiceResult ? (
            <>
              <div className="paperwork-metrics">
                <MetricPill label="ZIP archives" value={String(invoiceResult.uploadResult.archiveCount)} />
                <MetricPill label="XML files" value={String(invoiceResult.uploadResult.xmlCount)} />
                <MetricPill label="PDF files" value={String(invoiceResult.uploadResult.pdfCount)} />
              </div>

              <dl className="paperwork-details">
                <div>
                  <dt>Captured at</dt>
                  <dd>{invoiceResult.uploadResult.capturedAt}</dd>
                </div>
                <div>
                  <dt>Timezone</dt>
                  <dd>{invoiceResult.uploadResult.timezone}</dd>
                </div>
                <div>
                  <dt>Expected destination</dt>
                  <dd>S3 / invoices/YYYY/MM/DD/&lt;invoice_id&gt;/file.xml|file.pdf</dd>
                </div>
              </dl>

              <section className="paperwork-preview">
                <div className="paperwork-preview__header">
                  <h4>Prepared batch</h4>
                  <p>The XML and PDF paths below are the exact objects that will be uploaded.</p>
                </div>
                <DataTable rows={invoicePreviewRows} />
              </section>
            </>
          ) : null}
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
                disabled={ordersPending}
              >
                {ordersPending ? 'Working...' : 'Validate'}
              </button>
              <button
                type="button"
                className="paperwork-button paperwork-button--primary"
                onClick={() => handleValidateOrders(true)}
                disabled={ordersPending}
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
}) {
  const { entries, isLoading, isFetching, isError } = props
  const status = isError ? 'Degraded' : isLoading ? 'Loading' : isFetching ? 'Syncing' : 'Live'

  return (
    <aside className="paperwork-trace" aria-label="Orders cloud traceability">
      <div className="paperwork-trace__header">
        <div className="paperwork-trace__copy">
          <h3 className="paperwork-trace__title">Cloud Trace</h3>
          <p>Latest approved-order intake seen in AWS for each active symbol.</p>
        </div>
        <span className={`paperwork-trace__status paperwork-trace__status--${status.toLowerCase()}`}>
          {status}
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="paperwork-trace__empty">
          Select at least one symbol in the core strip to inspect order upload latency.
        </div>
      ) : (
        <div className="paperwork-trace__grid">
          {entries.map((entry) => (
            <article key={entry.symbol} className="paperwork-traceCard">
              <div className="paperwork-traceCard__head">
                <strong>{entry.symbol}</strong>
                <span>{entry.recordCount > 0 ? `${entry.recordCount} latest` : 'No trace'}</span>
              </div>

              <div className="paperwork-traceCard__metrics">
                <div
                  className="paperwork-traceMetric"
                  title="Elapsed time between the original order creation timestamp and the moment the record was imported into AWS."
                >
                  <span>Created → Imported</span>
                  <strong className={`paperwork-traceMetric__value paperwork-traceMetric__value--${getImportLagTone(entry.importLagMs)}`}>
                    {formatDuration(entry.importLagMs)}
                  </strong>
                </div>

                <div
                  className="paperwork-traceMetric"
                  title="Elapsed time between the original order creation timestamp and the current Bogota time."
                >
                  <span>Created → Now</span>
                  <strong className={`paperwork-traceMetric__value paperwork-traceMetric__value--${getAgeTone(entry.ageMs)}`}>
                    {formatDuration(entry.ageMs)}
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
  recordCount: number,
  now: number,
): OrderTraceEntry {
  const { createdAt } = splitCreatedAtSymbol(record?.created_at_symbol ?? null)
  const importedAt = normalizeTimestamp(record?.imported_at ?? null)
  const createdTime = createdAt ? new Date(createdAt).getTime() : Number.NaN
  const importedTime = importedAt ? new Date(importedAt).getTime() : Number.NaN

  return {
    symbol,
    createdAt,
    importedAt,
    recordCount,
    importLagMs:
      Number.isFinite(createdTime) && Number.isFinite(importedTime) ? importedTime - createdTime : null,
    ageMs:
      Number.isFinite(createdTime) ? Math.max(0, now - createdTime) : null,
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

  const minutes = value / 60_000
  if (minutes <= 15) {
    return 'good'
  }

  if (minutes <= 60) {
    return 'watch'
  }

  return 'late'
}

function getAgeTone(value: number | null) {
  if (value == null || Number.isNaN(value)) {
    return 'muted'
  }

  const hours = value / 3_600_000
  if (hours <= 24) {
    return 'good'
  }

  if (hours <= 72) {
    return 'watch'
  }

  return 'late'
}
