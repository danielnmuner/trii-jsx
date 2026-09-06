import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DataTable } from '../../../shared/ui/DataTable'
import { parseStockOrdersCsv, type StockOrdersUploadResult } from '../lib/stockOrders'
import { submitStockOrders } from '../api/client'
import { PaperworkAnalyticsPanel } from './PaperworkAnalyticsPanel'

type NoticeState = {
  tone: 'error' | 'success' | 'info'
  text: string
} | null

type PaperworkPanelProps = {
  authenticatedUserEmail: string | null
}

export function PaperworkPanel({ authenticatedUserEmail }: PaperworkPanelProps) {
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
            text: 'The orders file passed validation and is ready to upload.',
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
          text: `Upload completed. Received ${response.result.received_records} rows, imported ${response.result.imported_records}, skipped ${response.result.duplicate_records} duplicates.`,
        })
        await queryClient.invalidateQueries({
          queryKey: ['paperwork'],
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
        <PaperworkAnalyticsPanel authenticatedUserEmail={authenticatedUserEmail} />

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
