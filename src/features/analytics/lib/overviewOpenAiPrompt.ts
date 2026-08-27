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
    'Quiero una respuesta breve en espanol usando solo estas cuatro secciones:',
    '1. Tabla de fuentes y noticias',
    '2. Matriz de variables exogenas',
    '3. Tabla de señales no oficiales del mercado',
    '4. Conclusion global',
    '',
    'Reglas obligatorias:',
    '- Se breve, concreto y sin relleno.',
    '- El objetivo principal es el analisis cualitativo; usa el bloque cuantitativo solo como contexto de apoyo.',
    '- No inventes noticias, hechos, links ni citas.',
    '- Usa links exactos y recientes, ordenados de mayor a menor relevancia para la decision actual.',
    '- Distingue si cada fuente es oficial, nacional o internacional.',
    '- Para la primera tabla y la matriz de variables exogenas, no uses referencias con antiguedad mayor a 1 mes salvo que sean imprescindibles por contexto estructural; si ocurre, justificalo brevemente.',
    '- Evita sugerencias absolutas; usa lenguaje condicional o probabilistico.',
    '- No des una recomendacion tajante de compra o venta; enfocate en lectura cualitativa accionable y prudente.',
    '- Si no encuentras noticias suficientes, dilo de forma explicita y breve.',
    '- Evita afirmaciones triviales, ambiguas o genericas sin soporte verificable.',
    '- Prioriza soporte oficial siempre que exista; si no existe fuente oficial suficiente, usa una fuente nacional o internacional confiable y dilo de forma explicita.',
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
    'Ademas de las fuentes periodisticas y oficiales, prioriza deliberadamente fuentes no oficiales del ecosistema profesional del mercado accionario colombiano:',
    '- Aproximadamente 30% de la investigacion debe centrarse en analistas de renta variable, estrategas y analistas sectoriales con cobertura comprobable de acciones colombianas.',
    '- Aproximadamente 50% debe centrarse en gestores de portafolio, traders, operadores de mesa, estrategas independientes e inversionistas institucionales que publiquen o participen publicamente en X, entrevistas, podcasts, columnas, webinars o comunidades profesionales.',
    '- Perfiles como Ricardo Sandoval, Omar Suarez, Andres Duarte o Andres Cardona son solo ejemplos de referencia y no una lista cerrada.',
    '- Busca especialmente tesis, rumores, expectativas, cambios de posicionamiento, especulacion sobre catalizadores, flujos institucionales, posibles operaciones corporativas, cambios regulatorios anticipados y narrativas que puedan estar formandose antes de convertirse en noticia oficial.',
    '- No trates esas opiniones como hechos: identifica claramente cuando se trate de especulacion o interpretacion.',
    '- Prioriza perfiles con trayectoria profesional verificable en el mercado colombiano.',
    '- Evita sesgos, nombres hardcodeados o dependencia de una sola voz; los ejemplos no son una lista cerrada.',
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
    '- La primera tabla debe limitarse a informacion de maximo 1 mes de antiguedad, salvo contexto estructural imprescindible claramente justificado.',
    '- Despues entrega una segunda tabla markdown con estas columnas exactas: `Prioridad | Variable exogena | Por que importa para este simbolo | Evidencia oficial o principal`.',
    '- La segunda tabla debe ser corta: idealmente entre 3 y 5 filas, y solo incluir variables exogenas realmente estructurales para este simbolo.',
    '- `Variable exogena` debe ser especifica, no generica. Ejemplos validos segun el simbolo: tasas, regulacion sectorial, precio internacional de un commodity, tipo de cambio, demanda de cemento, trafico aeroportuario, capex regulado, dividendos esperados, resultados del emisor, riesgo politico-regulatorio, etc.',
    '- `Por que importa para este simbolo` debe ser una frase corta y concreta, explicando el canal de transmision hacia ingresos, margenes, volumen, valorizacion o riesgo del emisor.',
    '- `Evidencia oficial o principal` debe citar de forma breve la fuente base de esa variable, priorizando comunicados del emisor, Superfinanciera, BVC u otra fuente oficial. Si no existe una fuente oficial directa, usa la fuente principal mas confiable y aclara el tipo.',
    '- Ordena la segunda tabla de la variable exogena mas importante a la menos importante.',
    '- No llenes la segunda tabla con obviedades del mercado; solo variables que realmente ayuden a leer este simbolo.',
    '- La segunda tabla tambien debe limitarse a evidencia de maximo 1 mes de antiguedad, salvo contexto estructural imprescindible claramente justificado.',
    '- Luego entrega una tercera tabla markdown con estas columnas exactas: `Prioridad | Fecha | Canal | Perfil o fuente | Link directo | Lectura puntual`.',
    '- La tercera tabla debe incluir unicamente enlaces directos a X, entrevistas, podcasts, columnas, webinars o comunidades profesionales.',
    '- `Fecha` es obligatoria y no me interesan referencias de mas de 7 dias; si no puedes verificar que esta dentro de la ultima semana, no la incluyas.',
    '- `Canal` debe ser uno de: `X`, `Entrevista`, `Podcast`, `Columna`, `Webinar` o `Comunidad`.',
    '- `Perfil o fuente` debe identificar a la persona, mesa, firma o comunidad profesional.',
    '- `Link directo` debe ser un enlace markdown con texto corto y URL exacta.',
    '- `Lectura puntual` debe decir en una frase breve que tesis, rumor, expectativa, flujo, catalizador o narrativa aporta, aclarando explicitamente si es especulacion o interpretacion.',
    '- No incluyas ruido, opiniones triviales ni voces sin trayectoria verificable.',
    '- Debajo de las tres tablas debe haber solo una conclusion global, en un unico parrafo corto de maximo 4 oraciones.',
    '- La conclusion global debe sintetizar lo mas importante del frente cualitativo, sin repetir fila por fila la tabla.',
    '- Si una noticia es del emisor o del simbolo, debe ir por encima de notas macro genericas.',
    '- Si no encuentras enlaces realmente utiles para el simbolo, reduce las tablas en vez de rellenarlas con ruido.',
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
