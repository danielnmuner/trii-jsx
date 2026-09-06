import { Fragment, useMemo, useState } from 'react'
import type { InvoiceDocumentRow, PaperworkTableRow } from '../lib/analytics'

type PaperworkExpandableTableProps = {
  rows: PaperworkTableRow[]
}

type FlatRow = {
  depth: number
  row: PaperworkTableRow
}

const HEADERS = [
  { key: 'symbol', label: 'Simbolo', help: 'Ticker consolidado en ordenes y facturas mapeadas.' },
  { key: 'orders', label: 'Ordenes', help: 'Cantidad de ordenes aprobadas en el periodo.' },
  { key: 'invoices', label: 'Facturas', help: 'Facturas Accival conciliadas al simbolo en el periodo.' },
  { key: 'gross', label: 'Bruto', help: 'Valor bruto total transado en ordenes aprobadas.' },
  { key: 'orderCommission', label: 'Comision orden', help: 'Comision reportada por la orden de Trii.' },
  { key: 'invoiceTax', label: 'Impuesto', help: 'Impuesto facturado por Accival para el simbolo.' },
  { key: 'invoiceTotal', label: 'Total factura', help: 'Total facturado consolidado para el simbolo.' },
  { key: 'averageCost', label: 'Costo FIFO', help: 'Costo promedio remanente de la posicion abierta despues de aplicar PEPS/FIFO.' },
  { key: 'realizedPnl', label: 'Utilidad neta', help: 'Ganancia o perdida neta realizada por compras y ventas cerradas, incluyendo comisiones.' },
  { key: 'result', label: 'Resultado', help: 'Lectura rapida del resultado realizado de la operacion por simbolo.' },
] as const

export function PaperworkExpandableTable(props: PaperworkExpandableTableProps) {
  const { rows } = props
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const flatRows = useMemo(() => flattenRows(rows, expanded), [expanded, rows])

  return (
    <div className="paperwork-expandTableShell">
      <table className="paperwork-expandTable">
        <thead>
          <tr>
            <th className="paperwork-expandTable__head paperwork-expandTable__head--expand" />
            {HEADERS.map((header) => (
              <th key={header.key} className={`paperwork-expandTable__head paperwork-expandTable__head--${header.key}`}>
                <ColumnHeader label={header.label} help={header.help} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {flatRows.map(({ row, depth }) => {
            const canExpand = row.children.length > 0 || row.invoices.length > 0
            const isExpanded = Boolean(expanded[row.id])
            const isLeaf = row.scope === 'month'

            return (
              <Fragment key={row.id}>
                <tr className={`paperwork-expandTable__row paperwork-expandTable__row--${row.scope}`}>
                  <td className="paperwork-expandTable__cell paperwork-expandTable__cell--expand">
                    {canExpand ? (
                      <button
                        type="button"
                        className={`paperwork-expandTable__toggle${isExpanded ? ' is-expanded' : ''}`}
                        onClick={() => setExpanded((current) => ({ ...current, [row.id]: !current[row.id] }))}
                        aria-label={isExpanded ? `Ocultar ${row.label}` : `Ver ${row.label}`}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? '-' : '+'}
                      </button>
                    ) : (
                      <span className="paperwork-expandTable__togglePlaceholder" aria-hidden="true" />
                    )}
                  </td>
                  <td className="paperwork-expandTable__cell paperwork-expandTable__cell--symbol">
                    <div className={`paperwork-expandTable__label paperwork-expandTable__label--${row.scope}`} style={{ paddingLeft: `${depth * 16}px` }}>
                      <strong className="paperwork-expandTable__symbol">{row.label}</strong>
                    </div>
                  </td>
                  <td className="paperwork-expandTable__cell paperwork-expandTable__cell--orders">{formatInteger(row.orderCount)}</td>
                  <td className="paperwork-expandTable__cell paperwork-expandTable__cell--invoices">{formatInteger(row.invoiceCount)}</td>
                  <td className="paperwork-expandTable__cell paperwork-expandTable__cell--gross">{formatMoney(row.tradedGrossAmount)}</td>
                  <td className="paperwork-expandTable__cell paperwork-expandTable__cell--orderCommission">{formatMoney(row.orderCommission)}</td>
                  <td className="paperwork-expandTable__cell paperwork-expandTable__cell--invoiceTax">{formatMoney(row.invoiceTaxAmount)}</td>
                  <td className="paperwork-expandTable__cell paperwork-expandTable__cell--invoiceTotal">{formatMoney(row.invoiceTotalAmount)}</td>
                  <td className="paperwork-expandTable__cell paperwork-expandTable__cell--averageCost">{formatPrice(row.averageCost)}</td>
                  <td className="paperwork-expandTable__cell paperwork-expandTable__cell--realizedPnl">
                    <span className={toneClass(row.realizedPnl)}>{formatSignedMoney(row.realizedPnl)}</span>
                  </td>
                  <td className="paperwork-expandTable__cell paperwork-expandTable__cell--result">
                    <ResultBadge value={row.realizedPnl} />
                  </td>
                </tr>
                {isLeaf && isExpanded ? (
                  <tr className="paperwork-expandTable__detailRow">
                    <td colSpan={HEADERS.length + 1} className="paperwork-expandTable__detailCell">
                      <ExpandedInvoicePanel symbol={row.symbol ?? row.label} invoices={row.invoices} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function flattenRows(rows: PaperworkTableRow[], expanded: Record<string, boolean>, depth = 0): FlatRow[] {
  const flat: FlatRow[] = []

  for (const row of rows) {
    flat.push({ row, depth })

    if (row.children.length > 0 && expanded[row.id]) {
      flat.push(...flattenRows(row.children, expanded, depth + 1))
    }
  }

  return flat
}

function ColumnHeader(props: { label: string; help: string }) {
  const { label, help } = props
  return (
    <span className="paperwork-expandTable__headerLabel">
      <span>{label}</span>
      <span className="paperwork-expandTable__headerHelp" tabIndex={0}>
        i
        <span className="paperwork-expandTable__headerTooltip" role="tooltip">
          {help}
        </span>
      </span>
    </span>
  )
}

function ResultBadge(props: { value: number | null }) {
  const value = props.value ?? 0
  const label = value > 0 ? 'Ganando' : value < 0 ? 'Perdiendo' : 'Neutro'
  const tone = value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral'

  return <span className={`paperwork-resultBadge paperwork-resultBadge--${tone}`}>{label}</span>
}

function ExpandedInvoicePanel(props: { symbol: string; invoices: InvoiceDocumentRow[] }) {
  const { symbol, invoices } = props

  return (
    <div className="paperwork-expandTable__detailPanel">
      <div className="paperwork-expandTable__detailHeader">
        <strong>{symbol}</strong>
        <span>{formatInteger(invoices.length)} factura(s) relacionadas</span>
      </div>
      <div className="paperwork-expandTable__invoiceShell">
        <table className="paperwork-expandTable__invoiceTable">
          <thead>
            <tr>
              <th>Emitida</th>
              <th>Relacionadas</th>
              <th>Descripcion</th>
              <th>Lado</th>
              <th>Titulos</th>
              <th>Utilidad</th>
              <th>Base</th>
              <th>Impuesto</th>
              <th>Total</th>
              <th>Factura</th>
              <th>XML</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.invoiceUuid}>
                <td>{formatDateTime(invoice.issuedAt)}</td>
                <td>
                  <span className={invoice.hasRelatedInvoices ? 'paperwork-expandTable__groupLink' : undefined}>
                    {invoice.relatedInvoiceNumbers ?? '--'}
                  </span>
                </td>
                <td>{invoice.description ?? '--'}</td>
                <td>{formatSide(invoice.side)}</td>
                <td>{formatAllocatedQuantity(invoice.allocatedQuantity)}</td>
                <td>
                  <span className={toneClass(invoice.realizedPnl ?? 0)}>
                    {invoice.side === 'sell' ? formatSignedMoney(invoice.realizedPnl ?? 0) : '--'}
                  </span>
                </td>
                <td>{formatMoney(invoice.baseAmount)}</td>
                <td>{formatMoney(invoice.taxAmount)}</td>
                <td>{formatMoney(invoice.totalAmount)}</td>
                <td>{invoice.invoiceNumber}</td>
                <td>{invoice.sourceXmlName ?? '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function formatInteger(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(value))
}

function formatSignedMoney(value: number) {
  const rounded = Math.round(value)
  return `${rounded >= 0 ? '+' : ''}${formatMoney(rounded)}`
}

function formatPrice(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '--'
  }

  return formatMoney(value)
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '--'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '--'
  }

  return new Intl.DateTimeFormat('en-CA', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

function formatAllocatedQuantity(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '--'
  }

  return formatInteger(value)
}

function formatSide(value: InvoiceDocumentRow['side']) {
  if (value === 'buy') {
    return 'Compra'
  }
  if (value === 'sell') {
    return 'Venta'
  }
  return '--'
}

function toneClass(value: number) {
  if (value > 0) {
    return 'paperwork-expandTable__value paperwork-expandTable__value--positive'
  }
  if (value < 0) {
    return 'paperwork-expandTable__value paperwork-expandTable__value--negative'
  }
  return 'paperwork-expandTable__value'
}
