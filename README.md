# trii-jsx

Frontend React + TypeScript + Vite para la migracion de `Analytics` desde Streamlit.

## Requisitos

- Node.js 20+
- npm 10+

## Levantar la app localmente

1. Instala dependencias:

```bash
npm install
```

2. Crea tu archivo de entorno local a partir del ejemplo:

```bash
cp .env.example .env.local
```

En Windows PowerShell puedes usar:

```powershell
Copy-Item .env.example .env.local
```

3. Inicia la app:

```bash
npm run dev
```

4. Abre la URL local que muestra Vite, normalmente:

```text
http://127.0.0.1:5173
```

## Modos de desarrollo

### 1. Con mocks locales

Es el modo recomendado para UI/UX y desarrollo aislado.

Usa:

```env
VITE_USE_MOCKS=true
VITE_TRII_API_BASE_URL=/api
VITE_TRII_API_TOKEN=
VITE_ALPHA_VANTAGE_API_KEY=
```

Con esta configuracion, la app usa MSW y responde con data mockeada en el browser.

### 2. Contra API real

Solo para desarrollo local controlado.

Usa:

```env
VITE_USE_MOCKS=false
VITE_TRII_API_BASE_URL=<tu-api-gateway>
VITE_TRII_API_TOKEN=<tu-token>
VITE_ALPHA_VANTAGE_API_KEY=<tu-alpha-vantage-key>
```

Importante:
- `VITE_TRII_API_TOKEN` no debe exponerse en un frontend productivo browser-side.
- `VITE_ALPHA_VANTAGE_API_KEY` habilita la banda macro y tambien quedaria expuesta browser-side si la app se publica sin un proxy o cache server-side.
- Esto sirve solo como flujo temporal de desarrollo local.

## Market Tape En Vercel

Para despliegue productivo, la banda macro usa `api/market-tape` como proxy con cache server-side.

Configura en Vercel:

```env
ALPHA_VANTAGE_API_KEY=<tu-alpha-vantage-key>
```

En local, si `api/market-tape` no existe, la app hace fallback al cliente directo solo en modo desarrollo.

## Scripts utiles

```bash
npm run dev
npm run build
npm run test:unit
npm run test:integration
npm run test
```

## Estructura actual

```text
config/                  # vite, vitest, tsconfig secundarios
src/app/                 # app shell, providers, router
src/features/analytics/  # feature principal de analytics
src/shared/              # ui, api y config compartida
src/mocks/               # MSW para desarrollo local
src/test/                # helpers de test
public/                  # assets publicos sin bundle
```

## Estado actual de data loading

- `catalog`: carga automatica y auto-refresh.
- `current_snapshots` + `historic_stats`: carga automatica y auto-refresh realtime.
- `zscore_opportunities`: carga automatica segun `symbol + trading_date`.
- `daily_closing_snapshots`: carga automatica segun `symbol`.

No hay botones manuales para recargar datos desde Dynamo/API Gateway.

## Discrete Optimization Note

La simulacion determinista de `Overview` ahora modela el lado de salida como un problema de optimizacion discreta con restricciones.

Objetivo:

- minimizar `q`

Variables de decision:

- `q ∈ Z+`
- `ask ∈ Z+` en una grilla discreta de precio

Restricciones:

- `net_profit(q, bid, ask) >= profit_target`
- `ask_min <= ask <= ask_max`

Formalmente:

```text
min q

sujeto a

q ∈ Z+
ask_min <= ask <= ask_max
net_profit(q, bid, ask) >= profit_target
```

Donde:

- `bid` es el precio fijado por el usuario en el grafico de compra.
- `profit_target` es uno de `100K`, `200K` o `300K`.
- `ask_min = min(best_bid, microprice, last_price)`.
- `ask_max = high_price`.
- `net_profit` descuenta la comision `trii Pro` de compra y de venta.

Comision usada:

- hasta `5.000.000`: `14.875 * 50% = 7.437,5` por lado
- por encima de `5.000.000`: `monto * 0,25% * 1,19 * 50%`
- equivalente simplificado por lado para montos superiores: `monto * 0,0014875`

Estrategia de solucion implementada:

1. Se fija `bid`.
2. Se fija `profit_target`.
3. Se busca la menor cantidad entera `q` tal que exista solucion usando `ask = ask_max`.
4. Para esa `q` minima, se encuentra el menor `ask` factible dentro del rango permitido mediante busqueda binaria discreta.
5. Ese resultado se conserva como la solucion base de etapa 1.
6. En una etapa 2 separada, se usa esa solucion base para refinar el `ask` segun un rango de inversion permitido.
7. El rango de inversion objetivo para la compra es `5.000.000 <= bid * q <= 15.000.000`.
8. Para esa etapa 2, se toma el `ask` encontrado en la etapa 1 como techo y se recorren asks desde `ask_min` hasta ese valor.
9. Para cada `ask` fijo del recorrido, se resuelve de nuevo la menor `q` posible.
10. El limite superior de compra de esa etapa 2 puede cambiarse desde la UI con botones `5M`, `10M` y `15M`.
11. Se elige el primer escenario cuya compra cae dentro del rango `5M-max_buy`; ese escenario pasa a ser la recomendacion final.
12. Si no aparece ninguna mejora dentro del rango, se conserva la solucion base de etapa 1.

El grafico de `Ask` sigue permitiendo exploracion manual, pero la tabla principal ya se alimenta de la solucion optimizada calculada.
