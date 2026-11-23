# Estrategia: rango diario para scalping

> Estado: diseño, 2026-11-23. Nada de esto está implementado todavía.
>
> Reglas del proyecto:
> - Solo se **añade**: no se borra ni se cambia nada de lo que existe.
> - No se toca Paperwork.
> - Solo datos que ya tenemos: **sin guardar series nuevas, sin cambios en el backend y sin llamadas nuevas a la API**.

## 1. Objetivo

Saber, mientras la sesión transcurre, **en qué punto del rango diario típico está el precio**, para reconocer los momentos en que ya cayó lo que suele caer y lo más probable es que rebote.

Ejemplo: ECOPETROL suele moverse unos 65 COP entre su máximo y su mínimo del día. Si hoy ya cayó 50 COP desde el máximo, consumió la mayor parte de un día típico. Comprar ahí y vender en el rebote (20–30 COP) es una operación con el viento a favor. No importa dónde cierre el día; importa el rebote.

## 2. Datos que ya tenemos

| Dato | De dónde sale | ¿Ya se descarga en Overview? |
|---|---|---|
| Máximo, mínimo, cierre y cierre anterior **de cada día** | `GET /analytics/daily-closing` (los mismos valores High / Low que muestra trii) | **Sí.** Overview lo precarga para todos los emisores al abrirse (`primeDailyClosingCache`, caché de 24 h) |
| La trayectoria de **hoy** cada 30 s (last, mid, VWAP) | `Session Vector` | **Sí.** Es el gráfico de cada tarjeta |
| Máximo y mínimo de hoy hasta este momento | El snapshot de cada minuto (`high_price`, `low_price`) | **Sí.** La tarjeta ya los pasa al gráfico (`referenceHigh` y `referenceLow`) |

No hace falta nada más. El histórico dice **cuánto** se mueve un día normal. El Session Vector de hoy dice **dónde estamos y hacia dónde arrancó**.

## 3. Qué se calcula

Por emisor, con los días **anteriores** al día que se mira (para no hacer trampa con el propio día):

| Cálculo | Fórmula | Para qué sirve |
|---|---|---|
| Rango de cada día | `R = máximo − mínimo` | La base de todo |
| Rango típico | Media, mediana, p25, p75 y p90 de `R` en los últimos 20 y 60 días hábiles | El "tamaño" de un día normal, y de uno grande |
| Rango relativo | `R / cierre anterior` | Comparar emisores de precios muy distintos |
| Rebote desde el mínimo | `cierre − mínimo` | Piso de cuánto recupera típicamente desde el fondo del día |

Siempre se excluyen los días sin datos (como del 9 al 20 de noviembre, `HISTORIC_MONITORING_GAPS`), nunca se cuentan como rango 0.

## 4. La capa sobre el Session Vector

### 4.1 Qué se dibuja

Sobre el gráfico que ya existe, sin tocar sus líneas actuales:

1. **Punto de partida:** una línea fina en el primer precio de la sesión (la apertura).
2. **Bandas de caída típica, colgadas del máximo de hoy:**
   - `máximo − mediana(R)`: "ya cayó un día típico".
   - `máximo − p75(R)`: "ya cayó un día grande".
   - `máximo − p90(R)`: "día fuera de lo normal".
   - La franja entre la mediana y p75 se sombrea suave: es la **zona de interés para comprar**.
3. **Bandas espejo, colgadas del mínimo de hoy**, con las mismas distancias hacia arriba. Muestran cuándo una subida ya consumió lo típico y no conviene perseguirla.
4. Las bandas **se mueven en vivo**: si el día marca un máximo nuevo, todas bajan con él.

```
 2.560 ┤─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  punto de partida
       │╲
 2.550 ┤ ╲___                                        ← máximo de hoy
       │     ╲      ╱╲
       │      ╲    ╱  ╲
 2.495 ┤░░░░░░░╲░░╱░░░░╲░░░░░░░░░░░░░░░░░░░░░░░░░░░  máx − mediana (65)
       │░░░░░░░░╲╱░░░░░░╲░░░░░░░░░░░░░░░░░░░░░░░░░░  ░ zona de interés
 2.470 ┤░░░░░░░░░░░░░░░░░╲░░░░░░░░░░░░░░░░░░░░░░░░░  máx − p75 (80)
 2.455 ┤─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  máx − p90 (95)
       └──────────────────────────────────────────
        09:30                                 15:00
```

### 4.2 Qué se lee en texto

Una sola línea bajo el gráfico, compacta:

```
Rango hoy 58 de 65 típico (89 %) · desde el máximo −50 · desde la apertura −45 ↓
```

- **Rango hoy / típico:** cuánto del día normal ya se consumió.
- **Desde el máximo:** la caída que alimenta la decisión.
- **Desde la apertura, con flecha:** hacia dónde arrancó el día.

### 4.3 Cómo se usa

| Situación | Lectura |
|---|---|
| Caída desde el máximo < mediana | Todavía queda recorrido normal hacia abajo. Esperar. |
| Caída entre la mediana y p75 | **Zona de interés.** El día ya hizo lo típico. Buscar señales de freno (deja de marcar mínimos, el libro se equilibra) para entrar. |
| Caída > p90 | Día anormal: probablemente de tendencia o con noticia. **No operar** contra la caída. |
| Rango del día ya > p90 sin haber caído | Día muy volátil. Las bandas pierden confianza. |

### 4.4 Revisar días anteriores

El gráfico ya deja elegir los últimos 3 días (por ejemplo 23-11, 20-11, 19-11). Las bandas también se dibujan en esos días, calculadas con el histórico **anterior** a cada uno. Así se puede revisar dónde habría tocado la zona y qué pasó después, y entrenar el ojo sin guardar nada nuevo.

### 4.5 Detalles de implementación del gráfico

- Hoy la escala vertical se ajusta solo a los precios del día. Si una banda queda fuera, se dibuja una marca en el borde con su etiqueta en vez de comprimir el gráfico, para que la vista actual no cambie.
- La capa se puede activar y desactivar con un botón **"Rango"** en la leyenda que ya existe (junto a Last, Mid y VWAP).

## 5. Historic: el rango día a día

Además de lo que ya muestra la pestaña Historic:

- **Barras del rango de cada día** por emisor, con líneas de media y mediana (y p90 punteada).
- **Tabla resumen por emisor:** media, mediana, p25–p75, p90 y rango relativo, para 20 y 60 días.

```
ECOPETROL  rango diario (COP)                    media 69 · mediana 65 · p90 95
 140 |                        █
  95 |- - - - - - - - - - - - █ - - - - - - - - - - - - - - - - p90
  65 |──█────█──█─────█──█────█──█─────█──█──█────█───────────── mediana
     |  █ █  █  █  █  █  █ █  █  █  █  █  █  █ █  █  █
     +--------------------------------------------------------
       ago 21                                          nov 23
```

Usa los mismos datos de `daily-closing` que Historic ya descarga.

## 6. Lo que dicen los datos hoy

Datos reales del 21 de agosto al 6 de noviembre de 2026 (unos 52 días hábiles por emisor; excluidos del 9 al 20 de noviembre).

### 6.1 Rango diario por emisor

| Emisor | Mediana `R` (COP) | p25–p75 | p90 | Rango relativo | Rango / spread |
|---|---:|---:|---:|---:|---:|
| ECOPETROL | 65 | 50–80 | 95 | 2,42 % | 13,0 |
| CEMARGOS | 300 | 240–380 | 440 | 2,59 % | 30,0 |
| CIBEST | 2.440 | 1.960–3.460 | 4.100 | 2,71 % | 20,3 |
| CORFICOLCF | 680 | 560–840 | 1.100 | 3,15 % | 6,8 |
| GRUPOARGOS | 740 | 500–920 | 1.200 | 3,39 % | 12,3 |
| GRUPOSURA | 1.980 | 1.480–2.860 | 3.700 | 2,82 % | 7,1 |
| ICOLCAP | 750 | 477–1.099 | 1.337 | 2,92 % | 7,5 |
| ISA | 780 | 620–940 | 1.220 | 2,70 % | 3,5 |
| MINEROS | 820 | 580–1.100 | 1.360 | 4,01 % | 13,7 |
| NUCO | 1.700 | 1.220–1.960 | 2.500 | 3,82 % | 85,0 |
| PFCEMARGOS | 800 | 620–960 | 1.080 | 6,33 % | 1,2 |
| PFCIBEST | 1.860 | 1.580–2.380 | 2.820 | 2,46 % | 93,0 |
| PFCORFICOL | 480 | 360–620 | 720 | 2,60 % | 1,0 |
| PFDAVIGRP | 1.200 | 900–1.460 | 2.280 | 3,23 % | 1,1 |
| PFDAVVNDA | 900 | 660–1.400 | 1.900 | 3,40 % | 15,0 |
| PFGRUPOARG | 380 | 320–500 | 660 | 2,41 % | 6,3 |
| PFGRUPSURA | 1.640 | 1.320–2.020 | 2.680 | 2,83 % | 27,3 |

**Rango / spread** dice si hay espacio para scalping. Cuando vale cerca de 1 (PFCEMARGOS, PFCORFICOL, PFDAVIGRP), el spread se come todo el movimiento del día y la estrategia no aplica. El spread de la tabla es una foto del 23 de noviembre; la versión implementada debe usar el spread típico.

### 6.2 ¿Rebota después de caer? (ECOPETROL)

Días en que el mínimo quedó por debajo del cierre anterior:

| Caída hasta el mínimo | Días | Recuperó ≥ 20 COP desde el mínimo | Volvió al cierre anterior |
|---:|---:|---:|---:|
| ≥ 30 COP | 28 | 50 % | 21 % |
| ≥ 40 COP | 21 | 48 % | 14 % |
| ≥ 50 COP | 17 | 41 % | 12 % |

Cómo leerlo:
- Son **pisos**: con datos diarios solo sabemos cuánto recuperó hasta el cierre, no el rebote máximo dentro del día. El rebote real fue igual o mayor.
- **Volver al punto de partida no es lo normal**; en ECOPETROL pasa en 1 de cada 8 días con caída fuerte. Un objetivo de 20 COP desde la zona es más realista que esperar el regreso completo.
- La capa del Session Vector es la que muestra el resto: dónde estaba el mínimo, cuándo se frenó y cuánto rebotó, cada día.

## 7. Costos

Comisión de trii Pro (según el código de Paperwork): 0,125 % + IVA = 0,149 % por operación, ≈ 0,30 % ida y vuelta.

En ECOPETROL a 2.500 COP: unos 7,4 COP de comisión más 5 COP si se cruza el spread, **≈ 12 COP por acción**. Un rebote de 20–30 COP deja entre 8 y 18 COP netos. Las cifras que muestre la app deberían indicar el objetivo bruto y el neto.

## 8. Plan de implementación

Todo en el frontend, sin llamadas nuevas a la API:

| Paso | Qué | Dónde |
|---|---|---|
| 1 | Funciones puras: rango por día, estadísticas por ventana (20 y 60 días) usando solo días anteriores, y niveles de las bandas. Con tests unitarios. | Nuevo `src/features/analytics/lib/dailyRange.ts` |
| 2 | Leer el `daily-closing` que Overview ya precarga desde la caché de React Query (misma clave, sin pedirlo de nuevo) y pasar las estadísticas a cada tarjeta. | `OverviewPanel.tsx` |
| 3 | Capa de bandas, punto de partida, línea de texto y botón "Rango" en la leyenda. Una prop nueva y opcional: si no se pasa, el gráfico queda igual que hoy. | `OverviewSessionVectorTile.tsx` |
| 4 | Barras de rango día a día y tabla resumen. | Pestaña Historic (`DailyClosingPanel.tsx` o un panel nuevo debajo) |

## 9. Límites

- **Muestra pequeña:** unos 52 días por emisor. Las cifras mejoran solas con el tiempo, porque `daily-closing` sigue acumulando días.
- **Los datos diarios no dicen el orden** (si el máximo fue antes o después del mínimo). Para el día de hoy lo resuelve el Session Vector en vivo.
- **Días de tendencia o con noticias** son justo cuando "ya cayó suficiente" y sigue cayendo. Por eso la regla de no operar por debajo de p90.
- **Eventos corporativos** (ex-dividendo, por ejemplo) mueven el precio sin relación con el patrón.

## 10. Decisiones pendientes

1. **Punto de partida:** ¿la apertura (primer precio de la sesión) o el cierre del día anterior? El documento propone la apertura, que coincide con tu ejemplo.
2. **Percentiles de las bandas:** ¿mediana, p75 y p90, o prefieres otros cortes?
3. **Ventana:** ¿20 días (reacciona rápido a cambios) o 60 (más estable)? Se pueden mostrar ambas en Historic y elegir una para las bandas.
4. **Botón "Rango":** ¿activado o desactivado por defecto?
