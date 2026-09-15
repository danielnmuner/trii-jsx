import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DataTable } from '../../../shared/ui/DataTable'
import { parseStockOrdersCsv, type StockOrdersUploadResult } from '../lib/stockOrders'
import { submitStockOrders } from '../api/client'
import { PaperworkAnalyticsPanel } from './PaperworkAnalyticsPanel'
import type { PaperworkAnalyticsQueryResult } from '../hooks/usePaperworkAnalytics'

type NoticeState = {
  tone: 'error' | 'success' | 'info'
  text: string
} | null

type PaperworkPanelProps = {
  authenticatedUserEmail: string | null
  analyticsQuery: PaperworkAnalyticsQueryResult
  selectedYear: string | null
  onYearChange: (year: string) => void
}

export function PaperworkPanel({ authenticatedUserEmail, analyticsQuery, selectedYear, onYearChange }: PaperworkPanelProps) {
  const queryClient = useQueryClient()
  const [ordersFile, setOrdersFile] = useState<File | null>(null)
  const [ordersResult, setOrdersResult] = useState<StockOrdersUploadResult | null>(null)
  const [ordersNotice, setOrdersNotice] = useState<NoticeState>(null)
  const [ordersPending, setOrdersPending] = useState(false)
  const hasAuthenticatedEmail = Boolean(authenticatedUserEmail)

  const ensureUserEmail = () => {
    if (authenticatedUserEmail) {
      return true
    }

    setOrdersNotice({
      tone: 'info',
      text: 'This GitHub session does not expose an allowed email for Paperwork.',
    })
    return false
  }

  const handleValidateOrders = (sendRequested: boolean) => {
    void (async () => {
      setOrdersPending(true)
      setOrdersNotice(null)
      setOrdersResult(null)

      if (!ensureUserEmail()) {
        setOrdersPending(false)
        return
      }

      const userEmail = authenticatedUserEmail
      if (!userEmail) {
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
            text: buildOrdersValidationMessage(result),
          })
          return
        }

        if (result.recordCount === 0) {
          setOrdersNotice({
            tone: 'info',
            text:
              'The file was validated, but there are no approved rows with executed quantity to upload. Cancelled, pending, rejected, or zero-fill rows were excluded locally.',
          })
          return
        }

        const response = await submitStockOrders({
          fileName: ordersFile.name,
          records: result.records,
          sourceFileChecksum: result.sourceFileChecksum,
          userEmail,
        })

        setOrdersNotice({
          tone: 'success',
          text: buildOrdersUploadMessage(result, response.result.imported_records, response.result.duplicate_records, response.result.received_records),
        })
        await queryClient.invalidateQueries({
          queryKey: ['paperwork', 'orders', 'history', userEmail],
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
      <div className="paperwork-column paperwork-column--intake">
        <PaperworkAnalyticsPanel analyticsQuery={analyticsQuery} selectedYear={selectedYear} onYearChange={onYearChange} />

        <article className="paperwork-card paperwork-card--intake">
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
              <p>{authenticatedUserEmail ? `Signed in as ${authenticatedUserEmail}` : 'No authenticated email available.'}</p>
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
                disabled={!hasAuthenticatedEmail}
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
                disabled={ordersPending || !hasAuthenticatedEmail}
              >
                {ordersPending ? 'Working...' : 'Validate'}
              </button>
              <button
                type="button"
                className="paperwork-button paperwork-button--primary"
                onClick={() => handleValidateOrders(true)}
                disabled={ordersPending || !hasAuthenticatedEmail}
              >
                {ordersPending ? 'Uploading...' : 'Validate & Upload'}
              </button>
            </div>
          </div>

          {ordersNotice ? <NoticeBanner notice={ordersNotice} /> : null}

          {ordersResult ? (
            <>
              <div className="paperwork-metrics">
                <MetricPill label="Ready rows" value={String(ordersResult.recordCount)} />
                <MetricPill label="Source rows" value={String(ordersResult.sourceRowCount)} />
                <MetricPill label="Normalized rows" value={String(ordersResult.normalizedRowCount)} />
                <MetricPill label="Ignored dupes" value={String(ordersResult.duplicateRowCount)} />
                <MetricPill label="Ignored status" value={String(ordersResult.ignoredStatusRowCount)} />
                <MetricPill label="Symbols" value={String(ordersResult.symbols.length)} />
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
                  <dd>{ordersResult.symbols.length > 0 ? ordersResult.symbols.join(', ') : 'None ready to upload'}</dd>
                </div>
                {ordersResult.duplicateRowCount > 0 ? (
                  <div>
                    <dt>Ignored duplicate lines</dt>
                    <dd>{ordersResult.duplicateSourceLineNumbers.join(', ')}</dd>
                  </div>
                ) : null}
                {ordersResult.ignoredStatusRowCount > 0 ? (
                  <div>
                    <dt>Ignored non-approved rows</dt>
                    <dd>{ordersResult.ignoredStatusRowCount}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Timezone</dt>
                  <dd>{ordersResult.timezone}</dd>
                </div>
              </dl>

              <section className="paperwork-preview">
                <div className="paperwork-preview__header">
                  <h4>Normalized preview</h4>
                  <p>Only approved rows with executed quantity are shown here before upload.</p>
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

function buildOrdersValidationMessage(result: StockOrdersUploadResult) {
  const details = [
    `${result.recordCount} row(s) are ready to upload`,
  ]

  if (result.duplicateRowCount > 0) {
    details.push(`${result.duplicateRowCount} duplicate source row(s) were ignored locally`)
  }

  if (result.ignoredStatusRowCount > 0) {
    details.push(
      `${result.ignoredStatusRowCount} non-approved or zero-fill row(s) were excluded locally`,
    )
  }

  return `The orders file passed validation. ${details.join('; ')}.`
}

function buildOrdersUploadMessage(
  result: StockOrdersUploadResult,
  importedRecords: number,
  backendDuplicateRecords: number,
  receivedRecords: number,
) {
  const details = [
    `sent ${result.recordCount} row(s)`,
    `backend received ${receivedRecords}`,
    `imported ${importedRecords}`,
  ]

  if (result.duplicateRowCount > 0) {
    details.push(`ignored ${result.duplicateRowCount} duplicate source row(s) locally`)
  }

  if (result.ignoredStatusRowCount > 0) {
    details.push(`excluded ${result.ignoredStatusRowCount} non-approved or zero-fill row(s) locally`)
  }

  details.push(`backend skipped ${backendDuplicateRecords} stored duplicate(s)`)

  return `Upload completed. ${details.join(', ')}.`
}
