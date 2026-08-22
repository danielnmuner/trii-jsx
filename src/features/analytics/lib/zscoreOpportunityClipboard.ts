import type { ZscoreOpportunityRecord } from '../api/schemas'

type JsonLike = null | boolean | number | string | JsonLike[] | { [key: string]: JsonLike }

type ApprovedPositionSummary = {
  approved_buy_quantity?: number | null
  approved_sell_quantity?: number | null
  available_quantity?: number | null
  symbol?: string | null
  weighted_average_price?: number | null
}

type OrderBookLevel = {
  level?: number | null
  price?: number | null
  quantity?: number | null
}

const zscoreMetricOrder = ['obi_l1', 'obi_top_5', 'spread_bps', 'traded_value', 'traded_volume'] as const

const zscoreMetricLabels: Record<(typeof zscoreMetricOrder)[number], string> = {
  obi_l1: 'OBI L1',
  obi_top_5: 'OBI Top 5',
  spread_bps: 'Spread BPS',
  traded_value: 'Valor negociado',
  traded_volume: 'Volumen negociado',
}

const readableRootOrder = [
  'Identificadores',
  'Contexto temporal',
  'Resumen de posicion aprobada',
  'Precios y variacion de la jornada',
  'Z scores activados',
  'Profundidad del libro',
  'Campos adicionales',
] as const

const knownRootKeys = new Set([
  'snapshot_checksum',
  'approved_position_summary',
  'ask_levels',
  'bid_levels',
  'captured_at',
  'created_at',
  'daily_change_amount',
  'daily_change_percent',
  'high_price',
  'last_price',
  'low_price',
  'previous_close',
  'symbol',
  'symbol_captured_at',
  'trading_date',
  'triggered_z_scores',
])

export function buildZscoreOpportunityPrompt(record: ZscoreOpportunityRecord) {
  const orderedRecord = record as Record<string, unknown>
  const approvedSummary = extractApprovedPositionSummary(orderedRecord.approved_position_summary)
  const bidLevels = extractOrderBookLevels(orderedRecord.bid_levels)
  const askLevels = extractOrderBookLevels(orderedRecord.ask_levels)
  const readablePayload = orderReadablePayload(buildReadableEventPayload(record, approvedSummary, bidLevels, askLevels, orderedRecord))

  const availableQuantity = approvedSummary?.available_quantity
  const inventoryInstruction =
    typeof availableQuantity === 'number' && availableQuantity > 0
      ? `Hay inventario disponible para ${record.symbol}: ${availableQuantity} acciones. En la seccion "Sugerencia final" debes elegir entre "comprar mas" o "vender", pero solo puedes sugerir vender si el inventario disponible lo permite y si el precio actual, el contexto del libro y el precio promedio ponderado no implican una mala utilidad o una salida claramente ineficiente.`
      : `No hay inventario disponible para ${record.symbol}. En la seccion "Sugerencia final" nunca puedes sugerir "vender"; solo puedes sugerir "comprar" o "no comprar por ahora".`

  return [
    'Eres un trader experto en renta variable intradia del mercado colombiano, con enfoque en ejecucion, microestructura y lectura de flujo.',
    'Tambien actuas con el rigor combinado de un matematico, estadista, economista y operador de bolsa con mas de 20 anos de experiencia.',
    '',
    'Responde exclusivamente usando estas tres secciones, con estos encabezados exactos:',
    '1. Analisis cuantitativo',
    '2. Analisis cualitativo',
    '3. Sugerencia final',
    '',
    'Reglas obligatorias:',
    '- No agregues ninguna seccion adicional, ni resumen ejecutivo, ni conclusion aparte.',
    '- Debes usar todo el contexto del evento entregado abajo.',
    `- ${inventoryInstruction}`,
    '- Debes tratar el bloque "Resumen de posicion aprobada" como una restriccion operativa critica, no como contexto opcional.',
    '- No puede haber sugerencia de venta si la cantidad disponible es cero, nula o insuficiente.',
    '- No puede haber sugerencia de venta si el precio promedio ponderado de compra sugiere una mala utilidad, una perdida evitable o una salida ineficiente frente al contexto actual.',
    '- Debes interpretar los z scores como desviaciones relativas contra la historia del simbolo; no los uses de forma aislada.',
    '- Debes considerar el libro de puntas, la posicion aprobada, el movimiento del precio y la jornada.',
    '- Si algun dato no esta presente, dilo explicitamente y no lo inventes.',
    '',
    'Indicaciones por seccion:',
    '- Analisis cuantitativo: hazlo como un matematico, estadista, economista y experto en bolsa con mas de 20 anos de experiencia. Interpreta precio, variacion diaria, cierre previo, maximo, minimo, z scores activados, profundidad de compra/venta y posicion aprobada disponible. Explica relaciones, desviaciones, magnitudes relativas, consistencia estadistica de la senal y posibles implicaciones economicas de corto plazo.',
    '- Analisis cualitativo: realiza una investigacion real en la web y entrega links reales, recientes y relevantes para el simbolo. Debes incluir noticias oficiales del emisor o empresa si existen, ademas de contexto nacional e internacional que pueda afectar el activo durante el mes actual. Explica como la situacion del pais y los escenarios internacionales pueden influir en el simbolo, sin descartar comunicados oficiales ni informacion relevante del emisor.',
    '- Sugerencia final: entrega una recomendacion concreta y accionable segun las reglas de inventario. Debe quedar explicito si la sugerencia es comprar, comprar mas, vender o no comprar por ahora, y por que. Si aplica operativamente, indica el numero de ordenes sugeridas, la cantidad estimada por orden, el precio limite sugerido y si conviene ejecutar ahora, esperar, usar o evitar la subasta de cierre, o enfocar la atencion en otras acciones si esta no ofrece interes inmediato.',
    '',
    'Fuentes sugeridas para investigar noticias:',
    '- Oficiales del emisor y del mercado:',
    '  - Superfinanciera: https://www.superfinanciera.gov.co/SIMEV2/informacionrelevantegeneral',
    '  - BVC comunicados: https://www.bvc.com.co/?tab=indices_accionarios&tabNoticias=comunicados-de-prensa',
    '- Nacionales:',
    '  - Valora Analitik: https://www.valoraanalitik.com/noticias-bolsa-de-valores/',
    '  - La Republica: https://www.larepublica.co/bolsa-de-valores-de-colombia',
    '- Internacionales:'
    ,
    '  - Bloomberg Linea: https://www.bloomberglinea.com/tags/bolsa-de-valores-de-colombia/',
    '',
    'Reglas de investigacion cualitativa:',
    '- Debes citar links reales y relevantes dentro del analisis cualitativo.',
    '- Debes distinguir claramente si cada fuente es oficial, nacional o internacional.',
    '- Debes dar prioridad a hechos recientes del mes actual, sin ignorar eventos oficiales anteriores si siguen siendo materialmente relevantes.',
    '- Si no encuentras noticias suficientes, dilo explicitamente y explica la limitacion.',
    '',
    'Evento completo en formato legible:',
    '```json',
    JSON.stringify(readablePayload, null, 2),
    '```',
  ].join('\n')
}

export async function copyTextToClipboard(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard API unavailable')
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  document.body.appendChild(textarea)
  textarea.select()

  const didCopy = document.execCommand('copy')
  document.body.removeChild(textarea)

  if (!didCopy) {
    throw new Error('Clipboard copy failed')
  }
}

function buildReadableEventPayload(
  record: ZscoreOpportunityRecord,
  approvedSummary: ApprovedPositionSummary | null,
  bidLevels: OrderBookLevel[],
  askLevels: OrderBookLevel[],
  rawRecord: Record<string, unknown>,
) {
  const additionalFields = Object.fromEntries(
    Object.entries(rawRecord)
      .filter(([key]) => !knownRootKeys.has(key))
      .map(([key, value]) => [humanizeKey(key), normalizeUnknownValue(value)]),
  )

  return {
    Identificadores: {
      simbolo: record.symbol,
      checksum_snapshot: record.snapshot_checksum ?? null,
      simbolo_capturado_en: asStringOrNull(rawRecord.symbol_captured_at),
    },
    'Contexto temporal': {
      fecha_de_negociacion: record.trading_date ?? null,
      capturado_en: record.captured_at,
      creado_en: asStringOrNull(rawRecord.created_at),
    },
    'Resumen de posicion aprobada': {
      simbolo: approvedSummary?.symbol ?? record.symbol,
      cantidad_disponible: approvedSummary?.available_quantity ?? null,
      cantidad_compra_aprobada: approvedSummary?.approved_buy_quantity ?? null,
      cantidad_venta_aprobada: approvedSummary?.approved_sell_quantity ?? null,
      precio_promedio_ponderado: approvedSummary?.weighted_average_price ?? null,
    },
    'Precios y variacion de la jornada': {
      ultimo_precio: numberOrNull(record.last_price),
      variacion_diaria_valor: numberOrNull(record.daily_change_amount),
      variacion_diaria_porcentaje_reportada: numberOrNull(record.daily_change_percent),
      cierre_anterior: numberOrNull(record.previous_close),
      precio_maximo: numberOrNull(record.high_price),
      precio_minimo: numberOrNull(record.low_price),
    },
    'Z scores activados': buildReadableZscores(record),
    'Profundidad del libro': {
      compras_bid: bidLevels.map((level) => ({
        nivel: level.level ?? null,
        precio: level.price ?? null,
        cantidad: level.quantity ?? null,
      })),
      ventas_ask: askLevels.map((level) => ({
        nivel: level.level ?? null,
        precio: level.price ?? null,
        cantidad: level.quantity ?? null,
      })),
    },
    'Campos adicionales': additionalFields,
  }
}

function buildReadableZscores(record: ZscoreOpportunityRecord) {
  return Object.fromEntries(
    zscoreMetricOrder.map((metricKey) => {
      const metric = record.triggered_z_scores?.[metricKey]
      return [
        zscoreMetricLabels[metricKey],
        {
          valor_de_muestra: metric?.sample_value ?? null,
          z_score: metric?.z_score ?? null,
        },
      ]
    }),
  )
}

function orderReadablePayload(payload: Record<string, JsonLike>) {
  const ordered: Array<[string, JsonLike]> = []
  const seen = new Set<string>()

  for (const key of readableRootOrder) {
    if (key in payload) {
      ordered.push([key, payload[key]])
      seen.add(key)
    }
  }

  for (const key of Object.keys(payload)) {
    if (!seen.has(key)) {
      ordered.push([key, payload[key]])
    }
  }

  return Object.fromEntries(ordered)
}

function extractApprovedPositionSummary(value: unknown): ApprovedPositionSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const summary = value as Record<string, unknown>
  return {
    approved_buy_quantity: toOptionalNumber(summary.approved_buy_quantity),
    approved_sell_quantity: toOptionalNumber(summary.approved_sell_quantity),
    available_quantity: toOptionalNumber(summary.available_quantity),
    symbol: typeof summary.symbol === 'string' ? summary.symbol : null,
    weighted_average_price: toOptionalNumber(summary.weighted_average_price),
  }
}

function extractOrderBookLevels(value: unknown): OrderBookLevel[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => ({
      level: toOptionalNumber(entry.level),
      price: toOptionalNumber(entry.price),
      quantity: toOptionalNumber(entry.quantity),
    }))
}

function normalizeUnknownValue(value: unknown): JsonLike {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeUnknownValue(entry))
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [humanizeKey(key), normalizeUnknownValue(nested)]),
    )
  }

  return String(value)
}

function humanizeKey(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function toOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asStringOrNull(value: unknown) {
  return typeof value === 'string' ? value : null
}

function numberOrNull(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
