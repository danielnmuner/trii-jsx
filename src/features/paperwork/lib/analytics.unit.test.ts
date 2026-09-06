import { describe, expect, it } from 'vitest'
import { buildPaperworkAnalytics, derivePaperworkAvailableYears, filterPaperworkAnalyticsByYear } from './analytics'
import type { ParsedInvoiceLookupRecord, StockOrdersLookupRecord } from '../api/schemas'

describe('buildPaperworkAnalytics', () => {
  it('keeps realized pnl driven by orders and prorates sell invoices by invoice weight', () => {
    const orders: StockOrdersLookupRecord[] = [
      {
        symbol: 'TERPEL',
        order_side: 'BUY',
        normalized_status: 'approved',
        created_at: '2026-09-01T09:00:00-05:00',
        filled_quantity: 100,
        price_per_share: 1000,
        gross_amount: 100000,
        commission_amount: 100,
        imported_at: '2026-09-01T09:01:00-05:00',
        created_at_symbol: '2026-09-01T09:00:00-05:00#TERPEL',
      },
      {
        symbol: 'TERPEL',
        order_side: 'SELL',
        normalized_status: 'approved',
        created_at: '2026-09-03T10:00:00-05:00',
        filled_quantity: 100,
        price_per_share: 1200,
        gross_amount: 120000,
        commission_amount: 100,
        imported_at: '2026-09-03T10:01:00-05:00',
        created_at_symbol: '2026-09-03T10:00:00-05:00#TERPEL',
      },
    ]

    const invoices: ParsedInvoiceLookupRecord[] = [
      {
        invoice_uuid: 'sell-a',
        invoice_number: 'LIBO-A',
        order_reference_id: 'ORDER-1',
        issued_at: '2026-09-03T16:00:00-05:00',
        payable_amount: 60,
        tax_exclusive_amount: 50,
        tax_inclusive_amount: 60,
        tax_amount: 10,
        line_description: 'COMISION: VENTA ACCIONES ORDINAR ORGANIZACION TERPEL',
        extracted_order_side: 'SELL',
        source_xml_s3_key: 'invoices/user/hash/LIBO-A.xml',
      },
      {
        invoice_uuid: 'sell-b',
        invoice_number: 'LIBO-B',
        order_reference_id: 'ORDER-1',
        issued_at: '2026-09-03T16:01:00-05:00',
        payable_amount: 40,
        tax_exclusive_amount: 34,
        tax_inclusive_amount: 40,
        tax_amount: 6,
        line_description: 'COMISION: VENTA ACCIONES ORDINAR ORGANIZACION TERPEL',
        extracted_order_side: 'SELL',
        source_xml_s3_key: 'invoices/user/hash/LIBO-B.xml',
      },
    ]

    const result = buildPaperworkAnalytics({
      ordersMonthRecords: orders,
      invoicesMonthRecords: invoices,
      symbolOrderHistoryBySymbol: { TERPEL: orders },
      latestClosingPriceBySymbol: { TERPEL: null },
    })

    expect(result.rows[0]?.symbol).toBe('TERPEL')
    expect(result.rows[0]?.realizedPnl).toBe(19800)

    const sellInvoices = result.invoiceRows
      .filter((invoice) => invoice.symbol === 'TERPEL' && invoice.side === 'sell')
      .sort((left, right) => left.invoiceNumber.localeCompare(right.invoiceNumber))

    expect(sellInvoices).toHaveLength(2)
    expect(sellInvoices[0]?.allocatedQuantity).toBe(60)
    expect(sellInvoices[1]?.allocatedQuantity).toBe(40)
    expect(sellInvoices[0]?.realizedPnl).toBeCloseTo(11880, 6)
    expect(sellInvoices[1]?.realizedPnl).toBeCloseTo(7920, 6)
    expect((sellInvoices[0]?.realizedPnl ?? 0) + (sellInvoices[1]?.realizedPnl ?? 0)).toBeCloseTo(19800, 6)
  })

  it('routes dividend invoices to a separate collection and keeps them out of alerts', () => {
    const result = buildPaperworkAnalytics({
      ordersMonthRecords: [],
      invoicesMonthRecords: [
        {
          invoice_uuid: 'dividend-1',
          invoice_number: 'DIV-1',
          order_reference_id: null,
          issued_at: '2026-09-05T16:00:00-05:00',
          payable_amount: 238,
          tax_exclusive_amount: 200,
          tax_inclusive_amount: 238,
          tax_amount: 38,
          line_description: 'COBRO DE ADMINISTRACION VALORES Abono dividendos de 7 Acciones AO GRUPO ARGOS-GRUPO ARGOS S.A.',
          extracted_order_side: null,
          source_xml_s3_key: 'invoices/user/hash/DIV-1.xml',
        },
      ],
      symbolOrderHistoryBySymbol: {},
      latestClosingPriceBySymbol: {},
    })

    expect(result.invoiceRows).toHaveLength(0)
    expect(result.dividendRows).toHaveLength(1)
    expect(result.dividendRows[0]?.symbol).toBe('GRUPOARGOS')
    expect(result.alertRows).toHaveLength(0)
    expect(result.unmappedInvoices).toHaveLength(0)
  })

  it('derives available years and filters paperwork analytics without refetching', () => {
    const orders: StockOrdersLookupRecord[] = [
      {
        symbol: 'ECOPETROL',
        order_side: 'BUY',
        normalized_status: 'approved',
        created_at: '2025-12-20T09:00:00-05:00',
        filled_quantity: 10,
        price_per_share: 2000,
        gross_amount: 20000,
        commission_amount: 30,
        imported_at: '2025-12-20T09:01:00-05:00',
        created_at_symbol: '2025-12-20T09:00:00-05:00#ECOPETROL',
      },
      {
        symbol: 'ECOPETROL',
        order_side: 'SELL',
        normalized_status: 'approved',
        created_at: '2026-01-10T09:00:00-05:00',
        filled_quantity: 10,
        price_per_share: 2200,
        gross_amount: 22000,
        commission_amount: 35,
        imported_at: '2026-01-10T09:01:00-05:00',
        created_at_symbol: '2026-01-10T09:00:00-05:00#ECOPETROL',
      },
    ]

    const invoices: ParsedInvoiceLookupRecord[] = [
      {
        invoice_uuid: 'buy-2025',
        invoice_number: 'LIBO-2025',
        order_reference_id: 'BUY-2025',
        issued_at: '2025-12-20T16:00:00-05:00',
        payable_amount: 30,
        tax_exclusive_amount: 25,
        tax_inclusive_amount: 30,
        tax_amount: 5,
        line_description: 'COMISION: COMPRA ACCIONES ORDINAR ECOPETROL',
        extracted_order_side: 'BUY',
        source_xml_s3_key: 'invoices/user/hash/LIBO-2025.xml',
      },
      {
        invoice_uuid: 'sell-2026',
        invoice_number: 'LIBO-2026',
        order_reference_id: 'SELL-2026',
        issued_at: '2026-01-10T16:00:00-05:00',
        payable_amount: 35,
        tax_exclusive_amount: 29,
        tax_inclusive_amount: 35,
        tax_amount: 6,
        line_description: 'COMISION: VENTA ACCIONES ORDINAR ECOPETROL',
        extracted_order_side: 'SELL',
        source_xml_s3_key: 'invoices/user/hash/LIBO-2026.xml',
      },
    ]

    const model = buildPaperworkAnalytics({
      ordersMonthRecords: orders,
      invoicesMonthRecords: invoices,
      symbolOrderHistoryBySymbol: { ECOPETROL: orders },
      latestClosingPriceBySymbol: { ECOPETROL: 2300 },
    })

    expect(derivePaperworkAvailableYears(model)).toEqual(['2026', '2025'])

    const filtered = filterPaperworkAnalyticsByYear(model, '2026')

    expect(filtered.summary.approvedOrderCount).toBe(1)
    expect(filtered.summary.invoiceCount).toBe(1)
    expect(filtered.tableRows).toHaveLength(1)
    expect(filtered.tableRows[0]?.children).toHaveLength(1)
    expect(filtered.tableRows[0]?.children[0]?.year).toBe('2026')
  })
})
