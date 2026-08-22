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
