import type { DailyClosingRecord } from '../api/schemas'
import { isColombiaBusinessDateKey } from './colombiaBusinessCalendar'
import type { DailyOrderPositionSummary } from './orderPosition'

export type HistoricExportWindow = {
  symbol: string
  recordCount: number
  records: DailyClosingRecord[]
}

type BuildHistoricPromptInput = {
  rangeDays: number
  exportedAt: string
  windows: HistoricExportWindow[]
  orderTimelineBySymbol: Record<string, Record<string, DailyOrderPositionSummary | undefined>>
}

export function buildHistoricTransversalExportText(input: BuildHistoricPromptInput) {
  const payload = buildHistoricPayload(input)

  return [
    'Actua como analista tecnico-fundamental del mercado accionario colombiano, con enfoque transversal, comparativo y accionable para una mesa que revisa multiples emisores al mismo tiempo.',
    '',
    'Tu objetivo principal es identificar, entre todos los simbolos visibles, cual ofrece la mejor oportunidad de compra hoy.',
    'Solo si el contexto cuantitativo y el inventario disponible lo permiten, identifica tambien una oportunidad razonable de venta; de lo contrario, indica explicitamente abstenerse de vender.',
    '',
    'Contexto cuantitativo incluido exactamente en este archivo:',
    '- Un resumen transversal del rango visible actual.',
    '- Para cada simbolo: la serie diaria visible de trading_date, source_captured_at, last_price, previous_close, daily_change_amount, daily_change_percent, high_price, low_price, best_bid_price, best_ask_price, traded_volume y traded_value.',
    '- Para cada fecha que tenga contexto de hover: available_quantity, weighted_average_price, display_average_price, reference_price_vs_last, delta_value, delta_pct, buy_count, sell_count, realized_profit, total_commission, total_net_profit y el detalle de buy_orders y sell_orders con timestamp, cantidad y precio.',
    '- Para cada simbolo: resumen visible de buy days, sell days, realized pnl, total commission, total net profit y ultimo snapshot visible.',
    '',
    'Quiero la respuesta en espanol usando solo estas cuatro secciones y con estos encabezados exactos:',
    '1. Tabla de fuentes y relaciones',
    '2. Ranking transversal',
    '3. Decision operativa',
    '4. Conclusion global',
    '',
    'Reglas obligatorias:',
    '- Usa todo el contexto cuantitativo entregado abajo y no inventes datos.',
    '- La comparacion debe ser transversal entre simbolos, no analisis aislados uno por uno.',
    '- Si falta informacion para alguna conclusion, dilo de forma explicita y no la sustituyas con supuestos fuertes.',
    '- Considera precio de cierre, cambio diario, posicion dentro del rango high-low, bid, ask, volumen, valor negociado, frecuencia de compras/ventas, utilidad realizada, comisiones e inventario disponible.',
    '- Sospecha de traded_volume inusualmente alto frente a los traded_volume normales del resto del universo visible; si detectas esa desviacion, tratala como posible senal material y busca explicacion.',
    '- El objetivo mas importante es decidir que accion comprar hoy, si existe una oportunidad clara.',
    '- Solo puedes proponer venta si existe inventario disponible y si la venta resulta razonable frente al precio promedio visible, el neto observado y el contexto reciente.',
    '- Si no hay una venta razonable, debes decir abstenerse de vender y explicar por que.',
    '- La parte tecnica debe tener mas peso que la narrativa, pero debes complementar con investigacion fundamental y noticias realmente materiales.',
    '- Revisa con cuidado si hay relaciones materiales entre emisores: holdings, participaciones accionariales, exposiciones sectoriales compartidas, controlantes, subsidiarias, vinculos regulatorios o catalizadores comunes.',
    '- Si un emisor puede impactar a otro por estructura corporativa o exposicion economica, dilo explicitamente y explica el canal.',
    '- Prioriza hechos recientes y verificables; evita relleno, obviedades y afirmaciones triviales.',
    '- No hables del JSON ni del formato de entrada; solo analiza.',
    '',
    'Formato obligatorio de salida:',
    '- Seccion 1, Tabla de fuentes y relaciones: entrega una tabla markdown con estas columnas exactas: `Prioridad | Fecha | Tipo | Link (titulo) | Relacion material para la decision de hoy`.',
    '- En la seccion 1 prioriza fuentes oficiales del emisor, Superfinanciera, BVC y luego medios nacionales o internacionales confiables.',
    '- En la seccion 1 incluye tambien, cuando aplique, relaciones relevantes entre emisores del universo analizado.',
    '- Seccion 2, Ranking transversal: entrega una tabla markdown con estas columnas exactas: `Prioridad | Simbolo | Sesgo | Soporte cuantitativo clave | Lectura fundamental breve`.',
    '- En la seccion 2 ordena de mejor a peor oportunidad relativa para hoy.',
    '- Seccion 3, Decision operativa: divide la seccion en solo dos bloques breves llamados `Compra` y `Venta o abstencion`.',
    '- En `Compra` elige una sola mejor oportunidad o di explicitamente que no hay compra clara hoy.',
    '- En `Venta o abstencion` elige una sola posible venta si existe inventario suficiente y tesis razonable; si no, escribe `Abstenerse de vender` y explica por que.',
    '- Seccion 4, Conclusion global: un unico parrafo corto, sin repetir tabla por tabla.',
    '',
    'Reglas de investigacion cualitativa:',
    'Fuentes sugeridas para la investigacion cualitativa:',
    '- Oficiales:',
    '  - Superfinanciera: https://www.superfinanciera.gov.co/SIMEV2/informacionrelevantegeneral',
    '  - BVC comunicados: https://www.bvc.com.co/?tab=indices_accionarios&tabNoticias=comunicados-de-prensa',
    '- Nacionales:',
    '  - Valora Analitik: https://www.valoraanalitik.com/noticias-bolsa-de-valores/',
    '  - La Republica: https://www.larepublica.co/bolsa-de-valores-de-colombia',
    '- Internacionales:',
    '  - Bloomberg Linea: https://www.bloomberglinea.com/tags/bolsa-de-valores-de-colombia/',
    '- Usa links reales, recientes y relevantes.',
    '- Distingue si cada fuente es oficial, nacional o internacional.',
    '- Si no encuentras soporte suficiente para una tesis, dilo de forma explicita.',
    '- Si dos emisores del set estan economicamente vinculados, incorporalo en la comparacion y no los analices como casos completamente independientes.',
    '',
    'Contexto completo del tab Historic en JSON:',
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
  ].join('\n')
}

export function filterHistoricRecordsByRange(records: DailyClosingRecord[], rangeDays: number) {
  if (records.length === 0) {
    return records
  }

  const epochs = records
    .map((record) => new Date(record.source_captured_at ?? `${record.trading_date}T15:00:00-05:00`).getTime())
    .filter((value) => !Number.isNaN(value))

  if (epochs.length === 0) {
    return records
  }

  const latestEpoch = Math.max(...epochs)
  const rangeStart = latestEpoch - rangeDays * 24 * 60 * 60 * 1000

  return records.filter((record) => {
    if (!isColombiaBusinessDateKey(record.trading_date)) {
      return false
    }
    const epoch = new Date(record.source_captured_at ?? `${record.trading_date}T15:00:00-05:00`).getTime()
    return !Number.isNaN(epoch) && epoch >= rangeStart
  })
}

export function downloadHistoricPromptFile(browserWindow: Window, content: string, rangeDays: number) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = browserWindow.document.createElement('a')
  const stamp = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date())
    .replaceAll(' ', '_')
    .replaceAll(':', '-')
  anchor.href = url
  anchor.download = `historic-ai-brief-${rangeDays}d-${stamp}.txt`
  browserWindow.document.body.appendChild(anchor)
  anchor.click()
  browserWindow.document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

function buildHistoricPayload(input: BuildHistoricPromptInput) {
  const symbolPayload = input.windows.map((window) => buildSymbolPayload(window, input.orderTimelineBySymbol[window.symbol] ?? {}))
  const totalRecordCount = symbolPayload.reduce((sum, symbol) => sum + symbol.visible_record_count, 0)
  const candidatesWithInventory = symbolPayload.filter((symbol) => (symbol.latest_order_context?.available_quantity ?? 0) > 0).length

  return {
    exported_at: input.exportedAt,
    viewport_scope: {
      range_days: input.rangeDays,
      symbol_count: symbolPayload.length,
      visible_record_count: totalRecordCount,
      symbols_with_inventory: candidatesWithInventory,
    },
    cross_section_summary: symbolPayload.map((symbol, index) => ({
      priority_hint: index + 1,
      symbol: symbol.symbol,
      latest_trading_date: symbol.latest_trading_date,
      last_price: symbol.latest_snapshot?.last_price ?? null,
      daily_change_percent: symbol.latest_snapshot?.daily_change_percent ?? null,
      traded_value: symbol.latest_snapshot?.traded_value ?? null,
      traded_volume: symbol.latest_snapshot?.traded_volume ?? null,
      available_quantity: symbol.latest_order_context?.available_quantity ?? 0,
      visible_buy_days: symbol.visible_buy_days,
      visible_sell_days: symbol.visible_sell_days,
      visible_realized_pnl: symbol.visible_realized_pnl,
      visible_total_commission: symbol.visible_total_commission,
      visible_total_net_profit: symbol.visible_total_net_profit,
    })),
    symbols: symbolPayload,
  }
}

function buildSymbolPayload(window: HistoricExportWindow, timeline: Record<string, DailyOrderPositionSummary | undefined>) {
  const latestRecord = window.records[window.records.length - 1] ?? null
  const latestOrderContext = latestRecord ? timeline[latestRecord.trading_date] ?? null : null
  const visibleBuyDays = window.records.reduce((sum, record) => sum + ((timeline[record.trading_date]?.buyCount ?? 0) > 0 ? 1 : 0), 0)
  const visibleSellDays = window.records.reduce((sum, record) => sum + ((timeline[record.trading_date]?.sellCount ?? 0) > 0 ? 1 : 0), 0)
  const visibleRealizedPnl = window.records.reduce((sum, record) => sum + (timeline[record.trading_date]?.realizedProfit ?? 0), 0)
  const visibleTotalCommission = window.records.reduce((sum, record) => sum + (timeline[record.trading_date]?.totalCommission ?? 0), 0)
  const visibleTotalNetProfit = window.records.reduce((sum, record) => sum + (timeline[record.trading_date]?.totalNetProfit ?? 0), 0)

  return {
    symbol: window.symbol,
    visible_record_count: window.records.length,
    latest_trading_date: latestRecord?.trading_date ?? null,
    latest_snapshot: latestRecord
      ? {
          trading_date: latestRecord.trading_date,
          source_captured_at: latestRecord.source_captured_at ?? null,
          last_price: numberOrNull(latestRecord.last_price),
          previous_close: numberOrNull(latestRecord.previous_close),
          daily_change_amount: numberOrNull(latestRecord.daily_change_amount),
          daily_change_percent: numberOrNull(latestRecord.daily_change_percent),
          high_price: numberOrNull(latestRecord.high_price),
          low_price: numberOrNull(latestRecord.low_price),
          best_bid_price: numberOrNull(latestRecord.best_bid_price),
          best_ask_price: numberOrNull(latestRecord.best_ask_price),
          traded_volume: numberOrNull(latestRecord.traded_volume),
          traded_value: numberOrNull(latestRecord.traded_value),
        }
      : null,
    latest_order_context: latestOrderContext && shouldIncludeOrderContext(latestOrderContext)
      ? buildOrderContextPayload(latestOrderContext)
      : null,
    visible_buy_days: visibleBuyDays,
    visible_sell_days: visibleSellDays,
    visible_realized_pnl: visibleRealizedPnl,
    visible_total_commission: visibleTotalCommission,
    visible_total_net_profit: visibleTotalNetProfit,
    records: window.records.map((record) => ({
      trading_date: record.trading_date,
      source_captured_at: record.source_captured_at ?? null,
      market_snapshot: {
        last_price: numberOrNull(record.last_price),
        previous_close: numberOrNull(record.previous_close),
        daily_change_amount: numberOrNull(record.daily_change_amount),
        daily_change_percent: numberOrNull(record.daily_change_percent),
        high_price: numberOrNull(record.high_price),
        low_price: numberOrNull(record.low_price),
        best_bid_price: numberOrNull(record.best_bid_price),
        best_ask_price: numberOrNull(record.best_ask_price),
        traded_volume: numberOrNull(record.traded_volume),
        traded_value: numberOrNull(record.traded_value),
      },
      hover_context: timeline[record.trading_date] && shouldIncludeOrderContext(timeline[record.trading_date] as DailyOrderPositionSummary)
        ? buildOrderContextPayload(timeline[record.trading_date] as DailyOrderPositionSummary)
        : null,
    })),
  }
}

function buildOrderContextPayload(summary: DailyOrderPositionSummary) {
  return {
    available_quantity: summary.availableQuantity,
    weighted_average_price: numberOrNull(summary.weightedAveragePrice),
    display_average_price: numberOrNull(summary.displayAveragePrice),
    reference_price_vs_last: numberOrNull(summary.vsLastReferencePrice),
    delta_value: numberOrNull(summary.deltaValue),
    delta_pct: numberOrNull(summary.deltaPct),
    buy_count: summary.buyCount,
    sell_count: summary.sellCount,
    realized_profit: summary.realizedProfit,
    total_commission: summary.totalCommission,
    total_net_profit: summary.totalNetProfit,
    buy_orders: summary.buyOrders.map((order) => ({
      timestamp: order.timestamp ?? null,
      quantity: order.quantity,
      price: order.price,
      side: order.side,
    })),
    sell_orders: summary.sellOrders.map((order) => ({
      timestamp: order.timestamp ?? null,
      quantity: order.quantity,
      price: order.price,
      side: order.side,
    })),
  }
}

function shouldIncludeOrderContext(summary: DailyOrderPositionSummary) {
  const hasOpenInventory = summary.availableQuantity > 0
  const hasOnlyBuys = summary.buyCount > 0 && summary.sellCount === 0
  return hasOpenInventory || hasOnlyBuys
}

function numberOrNull(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
