import type { AnalyticsSymbolFeed, HistoricStat, SeasonalityProfile } from '../api/schemas'

const weekdayOrder = ['1', '2', '3', '4', '5'] as const

const weekdayMeta: Record<(typeof weekdayOrder)[number], { short: string; label: string }> = {
  '1': { short: 'M', label: 'Monday' },
  '2': { short: 'T', label: 'Tuesday' },
  '3': { short: 'W', label: 'Wednesday' },
  '4': { short: 'T', label: 'Thursday' },
  '5': { short: 'F', label: 'Friday' },
}

export function buildOverviewQualitativeOpenAiUrl(snapshot: AnalyticsSymbolFeed) {
  const prompt = buildOverviewQualitativeOpenAiPrompt(snapshot)
  const url = new URL('https://chatgpt.com/')
  url.searchParams.set('q', prompt)
  return url.toString()
}

export function buildOverviewQualitativeOpenAiPrompt(snapshot: AnalyticsSymbolFeed) {
  const payload = buildOverviewPayload(snapshot)

  return [
    'Actua como analista cualitativo del mercado accionario colombiano, con apoyo de contexto tecnico intradia y foco en informacion realmente material para la accion.',
    '',
    'Quiero una respuesta breve en espanol usando solo estas dos secciones:',
    '1. Tabla de fuentes y noticias',
    '2. Conclusion global',
    '',
    'Reglas obligatorias:',
    '- Se breve, concreto y sin relleno.',
    '- El objetivo principal es el analisis cualitativo; usa el bloque cuantitativo solo como contexto de apoyo.',
    '- No inventes noticias, hechos, links ni citas.',
    '- Usa links exactos y recientes, ordenados de mayor a menor relevancia para la decision actual.',
    '- Distingue si cada fuente es oficial, nacional o internacional.',
    '- Evita sugerencias absolutas; usa lenguaje condicional o probabilistico.',
    '- No des una recomendacion tajante de compra o venta; enfocate en lectura cualitativa accionable y prudente.',
    '- Si no encuentras noticias suficientes, dilo de forma explicita y breve.',
    '- No menciones asistentes, modelos, ChatGPT, prompts, ni el origen del trafico.',
    '- No hables del formato de entrada ni del JSON; solo entrega el analisis final.',
    '',
    'Fuentes sugeridas para la investigacion cualitativa:',
    '- Oficiales:',
    '  - Superfinanciera: https://www.superfinanciera.gov.co/SIMEV2/informacionrelevantegeneral',
    '  - BVC comunicados: https://www.bvc.com.co/?tab=indices_accionarios&tabNoticias=comunicados-de-prensa',
    '- Nacionales:',
    '  - Valora Analitik: https://www.valoraanalitik.com/noticias-bolsa-de-valores/',
    '  - La Republica: https://www.larepublica.co/bolsa-de-valores-de-colombia',
    '- Internacionales:',
    '  - Bloomberg Linea: https://www.bloomberglinea.com/tags/bolsa-de-valores-de-colombia/',
    '',
    'Formato obligatorio de salida:',
    '- Primero entrega una tabla markdown con estas columnas exactas: `Prioridad | Fecha | Tipo | Link (titulo) | Resumen objetivo`.',
    '- `Prioridad` debe ser numerica y comenzar en 1 para la noticia mas relevante.',
    '- `Fecha` debe estar en formato `YYYY-MM-DD` si es visible en la fuente; si no aparece claramente, usa `Fecha no visible`.',
    '- `Tipo` debe ser `Oficial`, `Nacional` o `Internacional`.',
    '- En `Link (titulo)`, coloca el titulo de la noticia o comunicado en formato markdown enlazado, es decir, la URL debe quedar enmascarada por el titulo.',
    '- En `Resumen objetivo`, resume de forma factual y concreta el contenido material de la noticia y su posible impacto sobre el simbolo.',
    '- Si la noticia corresponde a resultados financieros, el resumen debe ser especialmente concreto: ingresos, utilidad, EBITDA, guidance, deuda, dividendos, hechos relevantes o cualquier cambio material reportado.',
    '- Ordena la tabla de mayor a menor relevancia.',
    '- Debajo de la tabla debe haber solo una conclusion global, en un unico parrafo corto de maximo 4 oraciones.',
    '- La conclusion global debe sintetizar lo mas importante del frente cualitativo, sin repetir fila por fila la tabla.',
    '- Si una noticia es del emisor o del simbolo, debe ir por encima de notas macro genericas.',
    '- Si no encuentras enlaces realmente utiles para el simbolo, reduce la tabla en vez de rellenarla con ruido.',
    '',
    'Contexto del overview en JSON:',
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
  ].join('\n')
}

function buildOverviewPayload(snapshot: AnalyticsSymbolFeed) {
  const current = snapshot.current_snapshot
  const currentStats = snapshot.current_stats
  const seasonality = buildSeasonalityOverview(snapshot.seasonality_profile, current.captured_at)

  return {
    symbol: snapshot.symbol,
    captured_at: current.captured_at,
    trading_date: current.trading_date ?? null,
    market_snapshot: {
      last_price: numberOrNull(current.last_price),
      daily_change_amount: numberOrNull(current.daily_change_amount),
      daily_change_percent: numberOrNull(current.daily_change_percent),
      spread_bps: numberOrNull(current.spread_bps),
      high_price: numberOrNull(current.high_price),
      low_price: numberOrNull(current.low_price),
      best_ask_price: numberOrNull(current.best_ask_price),
      best_bid_price: numberOrNull(current.best_bid_price),
      mid_price: numberOrNull(current.mid_price),
      microprice: numberOrNull(current.microprice),
      cumulative_vwap: computeCumulativeVwap(current),
      spread: deriveSpread(current.best_ask_price, current.best_bid_price),
      traded_volume: numberOrNull(current.traded_volume),
      traded_value: numberOrNull(current.traded_value),
      obi_l1: numberOrNull(current.obi_l1),
      obi_top_5: numberOrNull(current.obi_top_5),
    },
    statistical_context: {
      spread_bps_zscore: buildZScoreValue(currentStats.spread_bps),
      obi_l1_zscore: buildZScoreValue(currentStats.obi_l1),
      obi_top_5_zscore: buildZScoreValue(currentStats.obi_top_5),
      sample_count: resolveSampleCount(currentStats),
    },
    seasonality,
  }
}

function buildSeasonalityOverview(profile: SeasonalityProfile | undefined, capturedAt?: string | null) {
  const weeklyProfile = profile?.weekly_profile ?? {}
  const availableDays = weekdayOrder.filter((weekday) => {
    const hours = weeklyProfile[weekday]?.hours ?? {}
    return Object.keys(hours).length > 0
  })

  const activeDay = (() => {
    const snapshotWeekday = resolveWeekdayKey(capturedAt)
    if (snapshotWeekday && availableDays.includes(snapshotWeekday)) {
      return snapshotWeekday
    }
    return availableDays[0]
  })()

  if (!profile || !activeDay) {
    return {
      metric: 'Accumulated Volume',
      active_weekday: null,
      delta_samples: 0,
      weekday_switch: ['M', 'T', 'W', 'T', 'F'],
      buckets: [],
    }
  }

  const activeProfile = weeklyProfile[activeDay]
  const bucketKeys = buildContinuousBucketKeys(collectAllHourKeys(profile), profile.bucket_granularity_minutes ?? 30)
  const activeHours = activeProfile?.hours ?? {}
  const deltaSamples = bucketKeys.reduce((sum, key) => sum + sanitizeNumber(activeHours[key]?.delta_samples), 0)

  return {
    metric: 'Accumulated Volume',
    active_weekday: weekdayMeta[activeDay].label,
    delta_samples: deltaSamples,
    weekday_switch: weekdayOrder.map((weekday) => weekdayMeta[weekday].short),
    buckets: bucketKeys.map((time) => ({
      time,
      accumulated_volume: sanitizeNumber(activeHours[time]?.accumulated_volume),
    })),
  }
}

function computeCumulativeVwap(snapshot: AnalyticsSymbolFeed['current_snapshot']) {
  if (
    typeof snapshot.traded_value !== 'number' ||
    Number.isNaN(snapshot.traded_value) ||
    typeof snapshot.traded_volume !== 'number' ||
    Number.isNaN(snapshot.traded_volume) ||
    snapshot.traded_volume === 0
  ) {
    return null
  }

  return snapshot.traded_value / snapshot.traded_volume
}

function deriveSpread(bestAsk: number | null | undefined, bestBid: number | null | undefined) {
  if (bestAsk === null || bestAsk === undefined || bestBid === null || bestBid === undefined) {
    return null
  }

  return Math.abs(bestAsk - bestBid)
}

function buildZScoreValue(stat?: HistoricStat) {
  if (
    !stat ||
    (stat.sample_count ?? 0) < 2 ||
    stat.latest_value === null ||
    stat.latest_value === undefined ||
    stat.mean === null ||
    stat.mean === undefined ||
    stat.stddev === null ||
    stat.stddev === undefined ||
    stat.stddev === 0
  ) {
    return null
  }

  return (stat.latest_value - stat.mean) / stat.stddev
}

function resolveSampleCount(currentStats: Record<string, HistoricStat>) {
  const counts = Object.values(currentStats).map((item) => item?.sample_count ?? 0)
  return Math.max(0, ...counts)
}

function resolveWeekdayKey(value: string | null | undefined): (typeof weekdayOrder)[number] | undefined {
  if (!value) {
    return undefined
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }

  const weekdayLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    weekday: 'long',
  })
    .format(date)
    .toLowerCase()

  switch (weekdayLabel) {
    case 'monday':
      return '1'
    case 'tuesday':
      return '2'
    case 'wednesday':
      return '3'
    case 'thursday':
      return '4'
    case 'friday':
      return '5'
    default:
      return undefined
  }
}

function collectAllHourKeys(profile?: SeasonalityProfile) {
  const hourKeys = new Set<string>()

  Object.values(profile?.weekly_profile ?? {}).forEach((weekday) => {
    Object.keys(weekday.hours ?? {}).forEach((key) => hourKeys.add(key))
  })

  Object.keys(profile?.pending_day?.hours ?? {}).forEach((key) => hourKeys.add(key))

  return [...hourKeys].sort((left, right) => left.localeCompare(right))
}

function buildContinuousBucketKeys(hourKeys: string[], granularityMinutes: number) {
  if (hourKeys.length === 0) {
    return []
  }

  const timestamps = hourKeys
    .map(parseHourKeyToMinutes)
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right)

  if (timestamps.length === 0) {
    return []
  }

  const step = granularityMinutes > 0 ? granularityMinutes : 30
  const buckets: string[] = []

  for (let minute = timestamps[0]; minute <= timestamps[timestamps.length - 1]; minute += step) {
    buckets.push(formatMinutesToHourKey(minute))
  }

  return buckets
}

function parseHourKeyToMinutes(value: string) {
  const [hourRaw, minuteRaw] = value.split(':')
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null
  }

  return hour * 60 + minute
}

function formatMinutesToHourKey(totalMinutes: number) {
  const hour = Math.floor(totalMinutes / 60)
  const minute = totalMinutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function sanitizeNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 0
  }
  return value
}

function numberOrNull(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
