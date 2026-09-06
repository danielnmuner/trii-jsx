import { Fragment, useMemo, useState } from 'react'
import {
  createColumnHelper,
  rowExpandingFeature,
  tableFeatures,
  useTable,
  type ExpandedState,
} from '@tanstack/react-table'
import type { InvoiceDocumentRow, PaperworkAnalyticsRow } from '../lib/analytics'

type PaperworkExpandableTableProps = {
  rows: PaperworkAnalyticsRow[]
  invoiceRows: InvoiceDocumentRow[]
}

type PaperworkExpandableRow = PaperworkAnalyticsRow & {
  invoices: InvoiceDocumentRow[]
}

const TABLE_FEATURES = tableFeatures({
  rowExpandingFeature,
})

const COLUMN_HELPER = createColumnHelper<typeof TABLE_FEATURES, PaperworkExpandableRow>()

const COLUMNS = COLUMN_HELPER.columns([
  COLUMN_HELPER.display({
    id: 'expand',
    header: '',
    cell: ({ row }) =>
      row.getCanExpand() ? (
        <button
          type="button"
          className={`paperwork-expandTable__toggle${row.getIsExpanded() ? ' is-expanded' : ''}`}
          onClick={row.getToggleExpandedHandler()}
          aria-label={row.getIsExpanded() ? `Ocultar facturas de ${row.original.symbol}` : `Ver facturas de ${row.original.symbol}`}
          aria-expanded={row.getIsExpanded()}
        >
          {row.getIsExpanded() ? '-' : '+'}
        </button>
      ) : (
        <span className="paperwork-expandTable__togglePlaceholder" aria-hidden="true" />
      ),
  }),
  COLUMN_HELPER.accessor('symbol', {
    id: 'symbol',
    header: () => <ColumnHeader label="Simbolo" help="Ticker consolidado en ordenes y facturas mapeadas." />,
    cell: (info) => <strong className="paperwork-expandTable__symbol">{info.getValue()}</strong>,
  }),
  COLUMN_HELPER.accessor('orderCount', {
    id: 'orders',
    header: () => <ColumnHeader label="Ordenes" help="Cantidad de ordenes aprobadas en el periodo." />,
    cell: (info) => formatInteger(info.getValue()),
  }),
  COLUMN_HELPER.accessor('invoiceCount', {
    id: 'invoices',
    header: () => <ColumnHeader label="Facturas" help="Facturas Accival conciliadas al simbolo en el periodo." />,
    cell: (info) => formatInteger(info.getValue()),
  }),
  COLUMN_HELPER.accessor('tradedGrossAmount', {
    id: 'gross',
    header: () => <ColumnHeader label="Bruto" help="Valor bruto total transado en ordenes aprobadas." />,
    cell: (info) => formatMoney(info.getValue()),
  }),
  COLUMN_HELPER.accessor('orderCommission', {
    id: 'orderCommission',
    header: () => <ColumnHeader label="Comision orden" help="Comision reportada por la orden de Trii." />,
    cell: (info) => formatMoney(info.getValue()),
  }),
  COLUMN_HELPER.accessor('calculatedCommission', {
    id: 'calculatedCommission',
    header: () => <ColumnHeader label="Comision calc" help="Referencia teorica usando 12.5 bps sobre el bruto operado." />,
    cell: (info) => formatMoney(info.getValue()),
  }),
  COLUMN_HELPER.accessor('invoiceTaxAmount', {
    id: 'invoiceTax',
    header: () => <ColumnHeader label="Impuesto" help="Impuesto facturado por Accival para el simbolo." />,
    cell: (info) => formatMoney(info.getValue()),
  }),
  COLUMN_HELPER.accessor('invoiceTotalAmount', {
    id: 'invoiceTotal',
    header: () => <ColumnHeader label="Total factura" help="Total facturado consolidado para el simbolo." />,
    cell: (info) => formatMoney(info.getValue()),
  }),
  COLUMN_HELPER.accessor('openQuantity', {
    id: 'openQuantity',
    header: () => <ColumnHeader label="Qty abierta" help="Cantidad que sigue abierta luego de aplicar PEPS/FIFO." />,
    cell: (info) => formatInteger(info.getValue()),
  }),
  COLUMN_HELPER.accessor('averageCost', {
    id: 'averageCost',
    header: () => <ColumnHeader label="Costo FIFO" help="Costo promedio remanente de la posicion abierta despues de aplicar PEPS/FIFO." />,
    cell: (info) => formatPrice(info.getValue()),
  }),
  COLUMN_HELPER.accessor('closePrice', {
    id: 'closePrice',
    header: () => <ColumnHeader label="Cierre" help="Ultimo precio de cierre disponible para valorar la posicion abierta." />,
    cell: (info) => formatPrice(info.getValue()),
  }),
  COLUMN_HELPER.accessor('mtmPnl', {
    id: 'mtmPnl',
    header: () => <ColumnHeader label="PyG" help="Ganancia o perdida mark-to-market de la posicion abierta al ultimo cierre." />,
    cell: (info) => (
      <span className={toneClass(info.getValue() ?? 0)}>
        {formatSignedMoney(info.getValue() ?? 0)}
      </span>
    ),
  }),
  COLUMN_HELPER.accessor('feeGap', {
    id: 'feeGap',
    header: () => <ColumnHeader label="Dif comision" help="Diferencia entre la factura y la comision registrada en ordenes." />,
    cell: (info) => (
      <span className={toneClass(info.getValue())}>
        {formatSignedMoney(info.getValue())}
      </span>
    ),
  }),
])

export function PaperworkExpandableTable(props: PaperworkExpandableTableProps) {
  const { rows, invoiceRows } = props
  const [expanded, setExpanded] = useState<ExpandedState>({})

  const data = useMemo<PaperworkExpandableRow[]>(() => {
    const invoicesBySymbol = new Map<string, InvoiceDocumentRow[]>()

    for (const invoice of invoiceRows) {
      if (!invoice.symbol) {
        continue
      }

      const normalizedSymbol = invoice.symbol.trim().toUpperCase()
      const current = invoicesBySymbol.get(normalizedSymbol)
      if (current) {
        current.push(invoice)
      } else {
        invoicesBySymbol.set(normalizedSymbol, [invoice])
      }
    }

    return rows.map((row) => ({
      ...row,
      invoices: invoicesBySymbol.get(row.symbol) ?? [],
    }))
  }, [invoiceRows, rows])

  const table = useTable({
    data,
    columns: COLUMNS,
    features: TABLE_FEATURES,
    state: {
      expanded,
    },
    onExpandedChange: setExpanded,
    getRowId: (row) => row.symbol,
    getRowCanExpand: (row) => row.original.invoices.length > 0,
    manualExpanding: true,
  })

  return (
    <div className="paperwork-expandTableShell">
      <table className="paperwork-expandTable">
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th key={header.id} className={`paperwork-expandTable__head paperwork-expandTable__head--${header.column.id}`}>
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <Fragment key={row.id}>
              <tr className="paperwork-expandTable__row">
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className={`paperwork-expandTable__cell paperwork-expandTable__cell--${cell.column.id}`}>
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
              {row.getIsExpanded() ? (
                <tr className="paperwork-expandTable__detailRow">
                  <td colSpan={row.getAllCells().length} className="paperwork-expandTable__detailCell">
                    <ExpandedInvoicePanel symbol={row.original.symbol} invoices={row.original.invoices} />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
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
              <th>Factura</th>
              <th>Ref</th>
              <th>Lado</th>
              <th>Base</th>
              <th>Impuesto</th>
              <th>Total</th>
              <th>Descripcion</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.invoiceUuid}>
                <td>{formatDateTime(invoice.issuedAt)}</td>
                <td>{invoice.invoiceNumber}</td>
                <td>{invoice.orderReferenceId ?? '--'}</td>
                <td>{formatSide(invoice.side)}</td>
                <td>{formatMoney(invoice.baseAmount)}</td>
                <td>{formatMoney(invoice.taxAmount)}</td>
                <td>{formatMoney(invoice.totalAmount)}</td>
                <td>{invoice.description ?? '--'}</td>
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
