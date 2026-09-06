import { describe, expect, it } from 'vitest'
import { buildPaperworkAnalytics } from './analytics'
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
})
