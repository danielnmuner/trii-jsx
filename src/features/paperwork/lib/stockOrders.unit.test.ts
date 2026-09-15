import { describe, expect, it } from 'vitest'
import { parseStockOrdersCsv } from './stockOrders'

describe('parseStockOrdersCsv', () => {
  it('parses the Trii sample CSV with bogota timestamps', async () => {
    const file = new File(
      [
        'Fecha y hora,SÃ­mbolo de la acciÃ³n,Tipo de orden,Estado,Acciones completadas,Acciones pendientes,Precio por acciÃ³n,Total invertido,Valor comisiÃ³n,Total estimado\n',
        '"14 ago 2026, 9:38 a. m.",NUCO,Compra,Aprobado,511,0,46640,23833040,35451.65,23868491.65\n',
      ],
      'orders-trii.csv',
      { type: 'text/csv' },
    )

    const result = await parseStockOrdersCsv(file)

    expect(result.recordCount).toBe(1)
    expect(result.sourceRowCount).toBeGreaterThanOrEqual(result.recordCount)
    expect(result.symbols).toContain('NUCO')
    expect(result.columns[0]).toBe('Fecha y hora')
    expect(result.storageName).toMatch(/^stock-order-\d{8}T\d{6}-america-bogota-trii\.csv$/)
    expect(result.records[0]?.created_at).toBe('2026-08-14T09:38:00-05:00')
    expect(result.previewRows[0]?.created_at).toBe('2026-08-14T09:38:00-05:00')
  })

  it('rejects files with missing columns', async () => {
    const file = new File(
      ['Fecha y hora,SÃ­mbolo de la acciÃ³n\n14 ago 2026,NUCO\n'],
      'invalid.csv',
      { type: 'text/csv' },
    )

    await expect(parseStockOrdersCsv(file)).rejects.toThrow(/estructura esperada/i)
  })

  it('keeps the first duplicate row and ignores repeated checksums from the same file', async () => {
    const file = new File(
      [
        'Fecha y hora,SÃ­mbolo de la acciÃ³n,Tipo de orden,Estado,Acciones completadas,Acciones pendientes,Precio por acciÃ³n,Total invertido,Valor comisiÃ³n,Total estimado\n',
        '"14 sept 2026, 8:32 a. m.",ECOPETROL,Venta,Cancelado,0,6000,2795,16770000,0,16770000\n',
        '"14 sept 2026, 8:32 a. m.",ECOPETROL,Venta,Cancelado,0,6000,2795,16770000,0,16770000\n',
        '"14 sept 2026, 8:44 a. m.",CIBEST,Venta,Aprobado,45,0,93200,4194000,7437.5,4186562.5\n',
      ],
      'dupes.csv',
      { type: 'text/csv' },
    )

    const result = await parseStockOrdersCsv(file)

    expect(result.sourceRowCount).toBe(3)
    expect(result.normalizedRowCount).toBe(2)
    expect(result.recordCount).toBe(1)
    expect(result.duplicateRowCount).toBe(1)
    expect(result.ignoredStatusRowCount).toBe(1)
    expect(result.duplicateSourceLineNumbers).toEqual([3])
    expect(result.records.map((record) => record.symbol)).toEqual(['CIBEST'])
  })

  it('marks partially executed approved rows and keeps only the filled quantity as executed', async () => {
    const file = new File(
      [
        'Fecha y hora,SÃ­mbolo de la acciÃ³n,Tipo de orden,Estado,Acciones completadas,Acciones pendientes,Precio por acciÃ³n,Total invertido,Valor comisiÃ³n,Total estimado\n',
        '"11 sept 2026, 1:27 p. m.",CIBEST,Venta,Aprobado,135/180,0,93000,12555000,18675.562,12536324.438\n',
      ],
      'partial.csv',
      { type: 'text/csv' },
    )

    const result = await parseStockOrdersCsv(file)
    const record = result.records[0]

    expect(record?.normalized_status).toBe('approved')
    expect(record?.execution_status).toBe('approved_partial')
    expect(record?.requested_quantity).toBe(180)
    expect(record?.filled_quantity).toBe(135)
    expect(record?.unfilled_quantity).toBe(45)
    expect(record?.pending_quantity).toBe(0)
    expect(result.ignoredStatusRowCount).toBe(0)
    expect(result.previewRows[0]?.execution_status).toBe('approved_partial')
    expect(result.previewRows[0]?.filled_quantity).toBe('135')
    expect(result.previewRows[0]?.unfilled_quantity).toBe('45')
  })

  it('excludes cancelled rows from the uploadable output while keeping validation metadata', async () => {
    const file = new File(
      [
        'Fecha y hora,SÃƒÂ­mbolo de la acciÃƒÂ³n,Tipo de orden,Estado,Acciones completadas,Acciones pendientes,Precio por acciÃƒÂ³n,Total invertido,Valor comisiÃƒÂ³n,Total estimado\n',
        '"14 sept 2026, 8:32 a. m.",ECOPETROL,Venta,Cancelado,0,6000,2795,16770000,0,16770000\n',
      ],
      'cancelled-only.csv',
      { type: 'text/csv' },
    )

    const result = await parseStockOrdersCsv(file)

    expect(result.sourceRowCount).toBe(1)
    expect(result.normalizedRowCount).toBe(1)
    expect(result.recordCount).toBe(0)
    expect(result.ignoredStatusRowCount).toBe(1)
    expect(result.previewRows).toEqual([])
  })
})
