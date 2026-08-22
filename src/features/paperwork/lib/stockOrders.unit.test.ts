import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseStockOrdersCsv } from './stockOrders'

const ORDERS_FILE_PATH = resolve(process.cwd(), '..', 'trii', 'orders-trii.csv')

describe('parseStockOrdersCsv', () => {
  it('parses the Trii sample CSV with bogota timestamps', async () => {
    const bytes = await readFile(ORDERS_FILE_PATH)
    const file = new File([bytes], 'orders-trii.csv', { type: 'text/csv' })

    const result = await parseStockOrdersCsv(file)

    expect(result.recordCount).toBeGreaterThan(0)
    expect(result.symbols).toContain('NUCO')
    expect(result.columns[0]).toBe('Fecha y hora')
    expect(result.storageName).toMatch(/^stock-order-\d{8}T\d{6}-america-bogota-trii\.csv$/)
    expect(result.records[0]?.created_at).toBe('2026-08-14T09:38:00-05:00')
    expect(result.previewRows[0]?.created_at).toBe('2026-08-14T09:38:00-05:00')
  })

  it('rejects files with missing columns', async () => {
    const file = new File(
      ['Fecha y hora,Símbolo de la acción\n14 ago 2026,NUCO\n'],
      'invalid.csv',
      { type: 'text/csv' },
    )

    await expect(parseStockOrdersCsv(file)).rejects.toThrow(/estructura esperada/i)
  })
})
