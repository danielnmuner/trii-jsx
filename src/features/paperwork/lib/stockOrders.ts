import { buildBogotaTimestamp, getBogotaTimezoneLabel } from './time'
import { sha256Hex } from './crypto'

const EXPECTED_STOCK_ORDER_COLUMNS = [
  'Fecha y hora',
  'SÃ­mbolo de la acciÃ³n',
  'Tipo de orden',
  'Estado',
  'Acciones completadas',
  'Acciones pendientes',
  'Precio por acciÃ³n',
  'Total invertido',
  'Valor comisiÃ³n',
  'Total estimado',
] as const

const SPANISH_MONTHS: Record<string, number> = {
  ene: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dic: 12,
}

const SPANISH_DATETIME_PATTERN =
  /^\s*(?<day>\d{1,2})\s+(?<month>[A-Za-zÃ¡Ã©Ã­Ã³ÃºÃ±ÃÃ‰ÃÃ“ÃšÃ‘]{3,})\s+(?<year>\d{4}),\s+(?<hour>\d{1,2}):(?<minute>\d{2})\s+(?<meridiem>[ap])\.\s*m\.\s*$/i

type StockOrderCsvColumn = (typeof EXPECTED_STOCK_ORDER_COLUMNS)[number]

type RawCsvRow = Record<StockOrderCsvColumn, string>

export type StockOrderRecord = {
  source_file_checksum: string
  source_line_number: number
  created_at: string
  created_month: string
  created_at_symbol: string
  symbol: string
  order_side: 'buy' | 'sell'
  raw_status: string
  normalized_status: string
  execution_status: string
  requested_quantity: number
  filled_quantity: number
  unfilled_quantity: number
  pending_quantity: number
  price_per_share: string
  gross_amount: string
  commission_amount: string
  net_amount: string
  currency: 'COP'
  record_checksum: string
}

export type StockOrdersUploadResult = {
  storageName: string
  capturedAt: string
  timezone: string
  sourceRowCount: number
  recordCount: number
  duplicateRowCount: number
  duplicateSourceLineNumbers: number[]
  symbols: string[]
  columns: string[]
  previewRows: Array<Record<string, string>>
  records: StockOrderRecord[]
  sourceFileChecksum: string
}

export async function parseStockOrdersCsv(file: File): Promise<StockOrdersUploadResult> {
  const rawBytes = new Uint8Array(await file.arrayBuffer())
  const text = new TextDecoder('utf-8').decode(rawBytes).replace(/^\uFEFF/, '').trim()
  if (!text) {
    throw new Error('The CSV file is empty.')
  }

  const csvRows = parseCsvText(text)
  if (csvRows.length < 2) {
    throw new Error('The CSV file does not contain valid order rows.')
  }

  const columns = csvRows[0].map((value) => value.trim())
  validateColumns(columns)

  const rawRows = csvRows
    .slice(1)
    .map((values) => toRow(columns as StockOrderCsvColumn[], values))
    .filter((row) => Object.values(row).some((value) => value.length > 0))

  if (rawRows.length === 0) {
    throw new Error('The CSV file does not contain valid order rows.')
  }

  const capturedAt = buildBogotaTimestamp()
  const sourceFileChecksum = await sha256Hex(rawBytes)
  const normalizedResult = await normalizeRows(rawRows, sourceFileChecksum)
  const records = normalizedResult.records
  const symbols = Array.from(new Set(records.map((record) => record.symbol))).sort()

  return {
    storageName: `stock-order-${capturedAt.compact}-america-bogota-trii.csv`,
    capturedAt: capturedAt.iso,
    timezone: getBogotaTimezoneLabel(),
    sourceRowCount: rawRows.length,
    recordCount: records.length,
    duplicateRowCount: normalizedResult.duplicateSourceLineNumbers.length,
    duplicateSourceLineNumbers: normalizedResult.duplicateSourceLineNumbers,
    symbols,
    columns,
    previewRows: records.slice(0, 10).map((record) => ({
      created_at: record.created_at,
      symbol: record.symbol,
      order_side: record.order_side,
      status: record.normalized_status,
      execution_status: record.execution_status,
      requested_quantity: String(record.requested_quantity),
      filled_quantity: String(record.filled_quantity),
      unfilled_quantity: String(record.unfilled_quantity),
      pending_quantity: String(record.pending_quantity),
      price_per_share: record.price_per_share,
      gross_amount: record.gross_amount,
      commission_amount: record.commission_amount,
      net_amount: record.net_amount,
    })),
    records,
    sourceFileChecksum,
  }
}

function parseCsvText(input: string) {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentCell = ''
  let inQuotes = false

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    const nextCharacter = input[index + 1]

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentCell += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (character === ',' && !inQuotes) {
      currentRow.push(currentCell)
      currentCell = ''
      continue
    }

    if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1
      }

      currentRow.push(currentCell)
      rows.push(currentRow)
      currentRow = []
      currentCell = ''
      continue
    }

    currentCell += character
  }

  currentRow.push(currentCell)
  rows.push(currentRow)
  return rows
}

function validateColumns(columns: string[]) {
  const isExactMatch =
    columns.length === EXPECTED_STOCK_ORDER_COLUMNS.length &&
    columns.every((column, index) => column === EXPECTED_STOCK_ORDER_COLUMNS[index])

  if (isExactMatch) {
    return
  }

  const missingColumns = EXPECTED_STOCK_ORDER_COLUMNS.filter((column) => !columns.includes(column))
  const unexpectedColumns = columns.filter((column) => !EXPECTED_STOCK_ORDER_COLUMNS.includes(column as StockOrderCsvColumn))
  const details: string[] = []

  if (missingColumns.length > 0) {
    details.push(`faltan: ${missingColumns.join(', ')}`)
  }

  if (unexpectedColumns.length > 0) {
    details.push(`sobran: ${unexpectedColumns.join(', ')}`)
  }

  throw new Error(
    `El CSV de Ã³rdenes no coincide con la estructura esperada de Trii; ${details.join('; ')}.`,
  )
}

function toRow(columns: StockOrderCsvColumn[], values: string[]): RawCsvRow {
  return columns.reduce((result, column, index) => {
    result[column] = (values[index] ?? '').trim()
    return result
  }, {} as RawCsvRow)
}

async function normalizeRows(rows: RawCsvRow[], sourceFileChecksum: string) {
  const records: StockOrderRecord[] = []
  const seenChecksums = new Set<string>()
  const duplicateSourceLineNumbers: number[] = []

  for (const [index, row] of rows.entries()) {
    const record = await normalizeRow(row, sourceFileChecksum, index + 2)
    if (seenChecksums.has(record.record_checksum)) {
      duplicateSourceLineNumbers.push(index + 2)
      continue
    }

    seenChecksums.add(record.record_checksum)
    records.push(record)
  }

  return {
    records,
    duplicateSourceLineNumbers,
  }
}

async function normalizeRow(
  row: RawCsvRow,
  sourceFileChecksum: string,
  sourceLineNumber: number,
) {
  const createdAt = parseCreatedAt(row['Fecha y hora'])
  const symbol = row['SÃ­mbolo de la acciÃ³n'].trim().toUpperCase()
  const normalizedStatus = normalizeStatus(row.Estado)
  const requestedQuantity = parseRequestedQuantity(row['Acciones completadas'], row['Acciones pendientes'])
  const filledQuantity = parseQuantity(row['Acciones completadas'])
  const pendingQuantity = parseQuantity(row['Acciones pendientes'])
  const unfilledQuantity = Math.max(requestedQuantity - filledQuantity, pendingQuantity)

  const record: Omit<StockOrderRecord, 'record_checksum'> = {
    source_file_checksum: sourceFileChecksum,
    source_line_number: sourceLineNumber,
    created_at: createdAt,
    created_month: createdAt.slice(0, 7),
    created_at_symbol: `${createdAt}#${symbol}`,
    symbol,
    order_side: normalizeOrderSide(row['Tipo de orden']),
    raw_status: row.Estado,
    normalized_status: normalizedStatus,
    execution_status: deriveExecutionStatus(normalizedStatus, requestedQuantity, filledQuantity),
    requested_quantity: requestedQuantity,
    filled_quantity: filledQuantity,
    unfilled_quantity: unfilledQuantity,
    pending_quantity: pendingQuantity,
    price_per_share: parseDecimalText(row['Precio por acciÃ³n']),
    gross_amount: parseDecimalText(row['Total invertido']),
    commission_amount: parseDecimalText(row['Valor comisiÃ³n']),
    net_amount: parseDecimalText(row['Total estimado']),
    currency: 'COP',
  }

  return {
    ...record,
    record_checksum: await buildRecordChecksum(record),
  }
}

function stripAccents(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function parseCreatedAt(rawValue: string) {
  const match = SPANISH_DATETIME_PATTERN.exec(rawValue)
  if (!match?.groups) {
    throw new Error(`Fecha y hora invÃ¡lida: ${rawValue}`)
  }

  const monthKey = stripAccents(match.groups.month).slice(0, 3).toLowerCase()
  const month = SPANISH_MONTHS[monthKey]
  if (!month) {
    throw new Error(`Mes no soportado en fecha: ${rawValue}`)
  }

  let hour = Number(match.groups.hour)
  const minute = Number(match.groups.minute)
  const meridiem = match.groups.meridiem.toLowerCase()

  if (meridiem === 'p' && hour !== 12) {
    hour += 12
  }

  if (meridiem === 'a' && hour === 12) {
    hour = 0
  }

  const year = Number(match.groups.year)
  const day = Number(match.groups.day)

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-05:00`
}

function parseDecimalText(rawValue: string) {
  let value = rawValue.trim().replaceAll('$', '').replaceAll(' ', '')
  if (!value) {
    return '0'
  }

  if (value.includes(',') && value.includes('.')) {
    value = value.replaceAll(',', '')
  } else if (value.includes(',')) {
    value = value.replaceAll(',', '.')
  }

  if (!/^-?\d+(\.\d+)?$/.test(value)) {
    throw new Error(`Valor numÃ©rico invÃ¡lido: ${rawValue}`)
  }

  return value
}

function parseQuantity(rawValue: string) {
  const value = rawValue.trim()
  if (!value) {
    return 0
  }

  return Number.parseInt(value.split('/')[0] ?? '0', 10)
}

function parseRequestedQuantity(completedValue: string, pendingValue: string) {
  const pendingQuantity = parseQuantity(pendingValue)
  const completedClean = completedValue.trim()
  const filledQuantity = parseQuantity(completedClean)
  const requestedHint = completedClean.includes('/')
    ? Number.parseInt(completedClean.split('/')[1] ?? '0', 10)
    : null

  return requestedHint === null
    ? filledQuantity + pendingQuantity
    : Math.max(filledQuantity + pendingQuantity, requestedHint)
}

function normalizeStatus(rawStatus: string) {
  const mapping: Record<string, string> = {
    aprobado: 'approved',
    cancelado: 'cancelled',
    pendiente: 'pending',
    rechazado: 'rejected',
  }

  return mapping[rawStatus.trim().toLowerCase()] ?? 'unknown'
}

function deriveExecutionStatus(normalizedStatus: string, requestedQuantity: number, filledQuantity: number) {
  if (normalizedStatus === 'approved') {
    if (filledQuantity > 0 && requestedQuantity > filledQuantity) {
      return 'approved_partial'
    }

    if (filledQuantity > 0) {
      return 'approved_full'
    }
  }

  return normalizedStatus
}

function normalizeOrderSide(rawValue: string): 'buy' | 'sell' {
  const normalized = rawValue.trim().toLowerCase()
  if (normalized === 'compra') {
    return 'buy'
  }

  if (normalized === 'venta') {
    return 'sell'
  }

  throw new Error(`Tipo de orden no soportado: ${rawValue}`)
}

async function buildRecordChecksum(record: Omit<StockOrderRecord, 'record_checksum'>) {
  const canonicalPayload = {
    created_at: record.created_at,
    symbol: record.symbol,
    order_side: record.order_side,
    raw_status: record.raw_status,
    requested_quantity: record.requested_quantity,
    filled_quantity: record.filled_quantity,
    pending_quantity: record.pending_quantity,
    price_per_share: record.price_per_share,
    gross_amount: record.gross_amount,
    commission_amount: record.commission_amount,
    net_amount: record.net_amount,
    currency: record.currency,
  }

  return sha256Hex(JSON.stringify(canonicalPayload))
}
