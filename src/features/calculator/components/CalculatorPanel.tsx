import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { SnapshotRecord } from '../../analytics/api/schemas'
import { SymbolIdentity } from '../../analytics/components/SymbolIdentity'
import { useDailyRangeSummary } from '../hooks/useDailyRangeSummary'
import {
  caretAfterSignificant,
  countSignificant,
  formatCop,
  formatPercent,
  formatSignedCop,
  formatSignedPercent,
  formatTypedAmount,
} from '../lib/copFormat'
import { readCalculatorState, writeCalculatorState } from '../lib/calculatorStorage'
import { parseAmount } from '../lib/parseAmount'
import {
  COMMISSION_RATE,
  COMMISSION_VAT_RATE,
  MIN_COMMISSION_BASE,
  compareScenarios,
  computeTrade,
  type SizeMode,
  type ScenarioComparison,
  type TradeResult,
  type TradeValidation,
} from '../lib/tradeCalculator'
import './calculator.css'

type CalculatorPanelProps = {
  symbols: string[]
  /** Latest snapshot per symbol: last price for the input hints, high/low for today's range. */
  snapshotBySymbol: Record<string, SnapshotRecord | undefined>
}

/** Internal slot of each scenario; never shown — scenarios are named by their stock. */
type ScenarioKey = 'A' | 'B'

type ScenarioDraft = {
  /** null until the user picks one: defaults to an issuer once the list has loaded. '' = Custom. */
  symbol: string | null
  buyPrice: string
  sellPrice: string
  sizeMode: SizeMode
  shares: string
  amount: string
}

type ResolvedDraft = ScenarioDraft & { symbol: string }

/** Default pair compared when the tab opens (used when they are among the active issuers). */
const DEFAULT_SYMBOLS: Record<ScenarioKey, string> = { A: 'ECOPETROL', B: 'NUCO' }

const emptyDraft = (symbol: string | null = null): ScenarioDraft => ({
  symbol,
  buyPrice: '',
  sellPrice: '',
  // Size is entered in COP by default; shares remain one tap away.
  sizeMode: 'amount',
  shares: '',
  amount: '',
})

export function CalculatorPanel({ symbols, snapshotBySymbol }: CalculatorPanelProps) {
  // Inputs persist in this browser, so switching tabs (which unmounts this panel) or reloading
  // never wipes a simulation; "Reiniciar" clears them.
  const [stored] = useState(() => readCalculatorState())
  const [rawDrafts, setDrafts] = useState<Record<ScenarioKey, ScenarioDraft>>(
    () => stored?.scenarios ?? { A: emptyDraft(), B: emptyDraft() },
  )
  const [compare, setCompare] = useState(stored?.compare ?? true)
  useEffect(() => {
    writeCalculatorState({ compare, scenarios: rawDrafts })
  }, [compare, rawDrafts])
  // Scenarios without an explicit choice use the default pair (ECOPETROL vs NU), falling back to
  // the first issuers if one of them is not active.
  const drafts = useMemo<Record<ScenarioKey, ResolvedDraft>>(() => {
    const fallbackA = symbols.includes(DEFAULT_SYMBOLS.A) ? DEFAULT_SYMBOLS.A : (symbols[0] ?? '')
    const fallbackB = symbols.includes(DEFAULT_SYMBOLS.B)
      ? DEFAULT_SYMBOLS.B
      : (symbols.find((symbol) => symbol !== fallbackA) ?? fallbackA)
    return {
      A: { ...rawDrafts.A, symbol: rawDrafts.A.symbol ?? fallbackA },
      B: { ...rawDrafts.B, symbol: rawDrafts.B.symbol ?? fallbackB },
    }
  }, [rawDrafts, symbols])
  const outcomes = useMemo(() => ({ A: evaluate(drafts.A), B: evaluate(drafts.B) }), [drafts])
  const activeKeys: ScenarioKey[] = compare ? ['A', 'B'] : ['A']

  // Scenarios are named by their stock; if both use the same one, the second gets a "(2)".
  const nameA = drafts.A.symbol || 'Otra'
  const nameB = compare && (drafts.B.symbol || 'Otra') === nameA ? `${nameA} (2)` : drafts.B.symbol || 'Otra'
  const names: Record<ScenarioKey, string> = { A: nameA, B: nameB }

  const updateDraft = (key: ScenarioKey, patch: Partial<ScenarioDraft>) =>
    setDrafts((current) => ({ ...current, [key]: { ...current[key], ...patch } }))

  return (
    <section className={`calc${compare ? ' calc--compare' : ''}`} aria-label="Calculadora de operaciones">
      <header className="calc-bar">
        <div className="calc-bar__title">
          <h2>Calculadora de operaciones</h2>
          <span>
            Comisión {formatPercent(COMMISSION_RATE * 100, 3)} (Trii Pro), mínimo ${formatCop(MIN_COMMISSION_BASE)}, +{' '}
            {formatPercent(COMMISSION_VAT_RATE * 100, 0)} de IVA en cada compra y venta
          </span>
        </div>
        <div className="calc-bar__actions">
          <div className="calc-switch" role="radiogroup" aria-label="Modo">
            {[false, true].map((value) => (
              <button
                key={String(value)}
                type="button"
                role="radio"
                aria-checked={compare === value}
                className={`calc-switch__option${compare === value ? ' calc-switch__option--active' : ''}`}
                onClick={() => setCompare(value)}
              >
                {value ? 'Comparar' : 'Individual'}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="calc-bar__reset"
            onClick={() => setDrafts({ A: emptyDraft(rawDrafts.A.symbol), B: emptyDraft(rawDrafts.B.symbol) })}
          >
            Reiniciar
          </button>
        </div>
      </header>

      <div className="calc-layout">
        <div className="calc-cards">
          {activeKeys.map((key) => (
            <ScenarioCard
              key={key}
              scenarioKey={key}
              draft={drafts[key]}
              outcome={outcomes[key]}
              symbols={symbols}
              snapshot={snapshotBySymbol[drafts[key].symbol] ?? null}
              onChange={(patch) => updateDraft(key, patch)}
            />
          ))}
        </div>

        {compare ? (
          <div className="calc-insights">
            <Comparison
              a={outcomes.A}
              b={outcomes.B}
              buyA={parseAmount(drafts.A.buyPrice)}
              buyB={parseAmount(drafts.B.buyPrice)}
              sellA={parseAmount(drafts.A.sellPrice)}
              sellB={parseAmount(drafts.B.sellPrice)}
              nameA={names.A}
              nameB={names.B}
            />
          </div>
        ) : null}
      </div>
    </section>
  )
}

function ScenarioCard({
  scenarioKey,
  draft,
  outcome,
  symbols,
  snapshot,
  onChange,
}: {
  scenarioKey: ScenarioKey
  draft: ResolvedDraft
  outcome: TradeValidation
  symbols: string[]
  snapshot: SnapshotRecord | null
  onChange: (patch: Partial<ScenarioDraft>) => void
}) {
  const id = useId()
  const lastPrice = snapshot?.last_price ?? null
  const range = useDailyRangeSummary(draft.symbol, snapshot)
  const result = outcome.ok ? outcome.result : null
  // Break-even and position size depend only on buy price and size: show them as soon as those are
  // valid, even before a sell price is typed.
  const position = useMemo(() => {
    const preview = evaluate({ ...draft, sellPrice: draft.buyPrice })
    return preview.ok ? preview.result : null
  }, [draft])
  const isAmount = draft.sizeMode === 'amount'

  return (
    <article className={`calc-card calc-card--${scenarioKey.toLowerCase()}`} aria-label={`Simulación ${scenarioKey === 'A' ? 1 : 2}`}>
      <header className="calc-card__head">
        <label className="calc-card__stock" htmlFor={`${id}-symbol`}>
          {draft.symbol ? <SymbolIdentity symbol={draft.symbol} /> : <span>Otra</span>}
          <select
            id={`${id}-symbol`}
            aria-label="Acción"
            value={draft.symbol}
            onChange={(event) => onChange({ symbol: event.target.value })}
          >
            {symbols.map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol}
              </option>
            ))}
            <option value="">Otra</option>
          </select>
          <span className="calc-card__caret" aria-hidden="true" />
        </label>
        {draft.symbol ? <DayRangeBadge summary={range} plannedRange={plannedRange(draft)} /> : null}
      </header>

      <div className="calc-card__inputs">
        <Field label="Compra" htmlFor={`${id}-buy`}>
          <AmountInput
            id={`${id}-buy`}
            ariaLabel="Precio de compra"
            prefix="$"
            placeholder={lastPrice ? formatCop(lastPrice) : '2.500'}
            value={draft.buyPrice}
            onChange={(buyPrice) => onChange({ buyPrice })}
          />
        </Field>

        <Field
          label="Tamaño"
          htmlFor={`${id}-size`}
          aside={
            <span className="calc-toggle" role="radiogroup" aria-label="Tamaño en">
              {(['amount', 'shares'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={draft.sizeMode === mode}
                  aria-label={mode === 'shares' ? 'Cantidad de acciones' : 'Monto en COP'}
                  className={`calc-toggle__option${draft.sizeMode === mode ? ' calc-toggle__option--active' : ''}`}
                  onClick={() => onChange({ sizeMode: mode })}
                >
                  {mode === 'shares' ? 'Acciones' : 'COP'}
                </button>
              ))}
            </span>
          }
        >
          <AmountInput
            id={`${id}-size`}
            ariaLabel="Tamaño"
            prefix={isAmount ? '$' : undefined}
            suffix={isAmount ? undefined : 'acciones'}
            allowDecimals={isAmount}
            placeholder={isAmount ? '10.000.000' : '1.000'}
            value={isAmount ? draft.amount : draft.shares}
            onChange={(value) => onChange(isAmount ? { amount: value } : { shares: value })}
          />
          {isAmount && position ? (
            <span className="calc-field__hint">
              {formatCop(position.shares)} acciones · sobran ${formatCop(position.leftoverCash)}
            </span>
          ) : null}
        </Field>

        <Field label="Venta" htmlFor={`${id}-sell`}>
          <AmountInput
            id={`${id}-sell`}
            ariaLabel="Precio de venta"
            prefix="$"
            placeholder={lastPrice ? formatCop(lastPrice) : '2.530'}
            value={draft.sellPrice}
            onChange={(sellPrice) => onChange({ sellPrice })}
          />
          {position ? (
            <span className="calc-field__hint">
              Punto de equilibrio <strong>${formatPrice(position.breakEvenSellPrice)}</strong>
            </span>
          ) : null}
        </Field>
      </div>

      {result ? <ScenarioResult result={result} /> : <p className="calc-card__empty">{outcome.ok ? '' : outcome.reason}</p>}
    </article>
  )
}

/**
 * Numeric input that re-formats as the user types ("10000000" → "10.000.000", decimals after ",")
 * and keeps the caret after the same digit.
 */
function AmountInput({
  id,
  ariaLabel,
  value,
  onChange,
  placeholder,
  prefix,
  suffix,
  allowDecimals = true,
}: {
  id: string
  ariaLabel: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  prefix?: string
  suffix?: string
  allowDecimals?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingCaret = useRef<number | null>(null)

  useLayoutEffect(() => {
    if (pendingCaret.current !== null && inputRef.current && document.activeElement === inputRef.current) {
      inputRef.current.setSelectionRange(pendingCaret.current, pendingCaret.current)
    }
    pendingCaret.current = null
  }, [value])

  return (
    <span className="calc-amount">
      {prefix ? (
        <span className="calc-amount__affix" aria-hidden="true">
          {prefix}
        </span>
      ) : null}
      <input
        ref={inputRef}
        id={id}
        aria-label={ariaLabel}
        className="calc-input"
        inputMode={allowDecimals ? 'decimal' : 'numeric'}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          const raw = event.target.value
          const caret = event.target.selectionStart ?? raw.length
          const formatted = formatTypedAmount(raw, allowDecimals)
          pendingCaret.current = caretAfterSignificant(formatted, countSignificant(raw.slice(0, caret)))
          onChange(formatted)
        }}
      />
      {suffix ? (
        <span className="calc-amount__affix calc-amount__affix--suffix" aria-hidden="true">
          {suffix}
        </span>
      ) : null}
    </span>
  )
}

function ScenarioResult({ result }: { result: TradeResult }) {
  const tone = result.netProfit > 0 ? 'positive' : result.netProfit < 0 ? 'negative' : 'neutral'

  return (
    <div className="calc-result">
      <div className="calc-result__summary">
      <div className={`calc-result__hero calc-result__hero--${tone}`}>
        <span className="calc-result__label">Resultado neto</span>
        <strong className="calc-result__value">
          {formatSignedCop(result.netProfit)}
          <small> COP</small>
        </strong>
        <span className="calc-result__return">{formatSignedPercent(result.returnPct)}</span>
      </div>

      <dl className="calc-kpis">
        <Kpi label="Ganancia por acción" value={formatSignedCop(result.netProfitPerShare, 2)} />
        <Kpi label="Comisiones" value={`$${formatCop(result.totalCommissions)}`} />
        <Kpi label="Acciones" value={formatCop(result.shares)} />
      </dl>
      </div>

      <table className="calc-ledger">
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col">Compra</th>
            <th scope="col">Venta</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Bruto</th>
            <td>{formatCop(result.buy.gross)}</td>
            <td>{formatCop(result.sell.gross)}</td>
          </tr>
          <tr>
            <th scope="row">Comisión</th>
            <td>
              {formatCop(result.buy.commission, 2)}
              <span>{feeDetail(result.buy)}</span>
            </td>
            <td>
              {formatCop(result.sell.commission, 2)}
              <span>{feeDetail(result.sell)}</span>
            </td>
          </tr>
          <tr className="calc-ledger__total">
            <th scope="row">Total</th>
            <td>${formatCop(result.buy.total)}</td>
            <td>${formatCop(result.sell.net)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function Comparison({
  a,
  b,
  buyA,
  buyB,
  sellA,
  sellB,
  nameA,
  nameB,
}: {
  a: TradeValidation
  b: TradeValidation
  buyA: number
  buyB: number
  sellA: number
  sellB: number
  nameA: string
  nameB: string
}) {
  if (!a.ok || !b.ok) {
    return <p className="calc-compare calc-compare--pending">Completa ambas simulaciones para compararlas.</p>
  }

  const comparison = compareScenarios(
    { result: a.result, buyPrice: buyA, sellPrice: sellA },
    { result: b.result, buyPrice: buyB, sellPrice: sellB },
  )

  return (
    <section className="calc-compare" aria-label="Comparación">
      <ComparisonSummary
        comparison={comparison}
        names={{ A: nameA, B: nameB }}
        results={{ A: a.result, B: b.result }}
        buys={{ A: buyA, B: buyB }}
        sells={{ A: sellA, B: sellB }}
      />
    </section>
  )
}

/**
 * Pre-written Spanish summary in one paragraph: who leaves more and by how much, both results,
 * the return on what was invested, and the sell price the other one needs to catch up.
 */
function ComparisonSummary({
  comparison,
  names,
  results,
  buys,
  sells,
}: {
  comparison: ScenarioComparison
  names: Record<ScenarioKey, string>
  results: Record<ScenarioKey, TradeResult>
  buys: Record<ScenarioKey, number>
  sells: Record<ScenarioKey, number>
}) {
  const leader = comparison.leader
  if (leader === null) {
    return (
      <p className="calc-compare__verdict">
        <Name keyName="A">{names.A}</Name> y <Name keyName="B">{names.B}</Name> dejan la misma ganancia neta,{' '}
        <strong>{formatSignedMoney(results.A.netProfit, true)}</strong>, con una rentabilidad de{' '}
        {formatSignedPercent(results.A.returnPct)} y {formatSignedPercent(results.B.returnPct)} sobre lo invertido.
      </p>
    )
  }

  const trailing: ScenarioKey = leader === 'A' ? 'B' : 'A'
  const bothGains = results.A.netProfit >= 0 && results.B.netProfit >= 0
  const returnLeader = comparison.returnLeader
  const catchUp =
    comparison.catchUpSellPrice !== null &&
    comparison.catchUpRise !== null &&
    comparison.catchUpRisePct !== null &&
    comparison.catchUpMove !== null &&
    comparison.catchUpMovePct !== null &&
    comparison.leaderMove !== null &&
    comparison.leaderMovePct !== null
      ? {
          sellPrice: comparison.catchUpSellPrice,
          rise: comparison.catchUpRise,
          risePct: comparison.catchUpRisePct,
          move: comparison.catchUpMove,
          movePct: comparison.catchUpMovePct,
          leaderMove: comparison.leaderMove,
          leaderMovePct: comparison.leaderMovePct,
        }
      : null

  return (
    <p className="calc-compare__verdict">
      <Name keyName={leader}>{names[leader]}</Name> {bothGains ? 'deja' : 'obtiene un resultado neto'}{' '}
      <strong>{`$${formatCop(comparison.difference)}`}</strong> {bothGains ? 'más de ganancia neta que' : 'mejor que'}{' '}
      <Name keyName={trailing}>{names[trailing]}</Name> ({formatSignedMoney(results[leader].netProfit, true)} frente a{' '}
      {formatSignedMoney(results[trailing].netProfit, true)}
      {comparison.differencePct !== null ? `, un ${formatPercent(comparison.differencePct, 1)} más` : ''})
      {returnLeader === leader || returnLeader === null ? (
        <>
          {' '}
          y rinde {formatSignedPercent(results[leader].returnPct)} frente a {formatSignedPercent(results[trailing].returnPct)} sobre lo
          invertido
        </>
      ) : (
        <>
          , aunque <Name keyName={returnLeader}>{names[returnLeader]}</Name> rinde más por cada peso invertido (
          {formatSignedPercent(results[returnLeader].returnPct)} frente a {formatSignedPercent(results[leader].returnPct)})
        </>
      )}
      {catchUp ? (
        <>
          . Para igualarla, <Name keyName={trailing}>{names[trailing]}</Name> tendría que venderse a{' '}
          <strong>{`$${formatPrice(catchUp.sellPrice)}`}</strong>: un rango de{' '}
          <strong>
            {formatSignedMoney(catchUp.move)} ({formatSignedPercent(catchUp.movePct)})
          </strong>{' '}
          desde su compra en {`$${formatPrice(buys[trailing])}`}, equivalente al rango de {formatSignedMoney(catchUp.leaderMove)} (
          {formatSignedPercent(catchUp.leaderMovePct)}) de <Name keyName={leader}>{names[leader]}</Name> entre{' '}
          {`$${formatPrice(buys[leader])}`} y {`$${formatPrice(sells[leader])}`}; es decir, {`$${formatPrice(catchUp.rise)}`} (
          {formatSignedPercent(catchUp.risePct)}) más que su venta actual de {`$${formatPrice(sells[trailing])}`}.
        </>
      ) : (
        '.'
      )}
    </p>
  )
}

/** Top-right of the card: today's high − low next to the typical daily range (historic median). */
function DayRangeBadge({
  summary,
  plannedRange,
}: {
  summary: ReturnType<typeof useDailyRangeSummary>
  plannedRange: number | null
}) {
  const { dayRange, typicalRange, isToday, dayKey } = summary
  if (dayRange === null && typicalRange === null && plannedRange === null) {
    return null
  }
  const dayLabel = isToday || !dayKey ? 'Rango hoy' : `Rango ${formatDayKey(dayKey)}`
  const share = dayRange !== null && typicalRange ? (dayRange / typicalRange) * 100 : null
  const plannedShare = plannedRange !== null && typicalRange ? (plannedRange / typicalRange) * 100 : null

  return (
    <dl className="calc-card__range" aria-label="Rango de variación diario">
      {plannedRange !== null ? (
        <div className="calc-card__range-planned">
          <dt>Tu rango</dt>
          <dd>
            {`$${formatPrice(plannedRange)}`}
            {plannedShare !== null ? <small>{formatPercent(plannedShare, 0)}</small> : null}
          </dd>
        </div>
      ) : null}
      <div>
        <dt>{dayLabel}</dt>
        <dd>
          {dayRange !== null ? `$${formatPrice(dayRange)}` : '—'}
          {share !== null ? <small>{formatPercent(share, 0)}</small> : null}
        </dd>
      </div>
      <div>
        <dt>Típico diario</dt>
        <dd>{typicalRange !== null ? `$${formatPrice(typicalRange)}` : '—'}</dd>
      </div>
    </dl>
  )
}

/** Distance between the typed buy and sell prices (COP), once both are valid. */
function plannedRange(draft: ScenarioDraft) {
  const buy = parseAmount(draft.buyPrice)
  const sell = parseAmount(draft.sellPrice)
  return Number.isFinite(buy) && Number.isFinite(sell) && buy > 0 && sell > 0 ? Math.abs(sell - buy) : null
}

/** "2026-11-25" → "25 nov". */
function formatDayKey(dayKey: string) {
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'short' })
    .format(new Date(`${dayKey}T12:00:00Z`))
    .replace('.', '')
}

function Name({ keyName, children }: { keyName: ScenarioKey; children: ReactNode }) {
  return <span className={`calc-compare__name calc-compare__name--${keyName.toLowerCase()}`}>{children}</span>
}

/** Peso price: whole pesos without decimals, otherwise two decimals. */
function formatPrice(value: number) {
  return formatCop(value, Math.abs(value - Math.round(value)) < 0.005 ? 0 : 2)
}

/** Signed peso amount with the currency sign: "+$612.914", "−$1.200", "+$27,40" (`whole` drops cents). */
function formatSignedMoney(value: number, whole = false) {
  const formatted = `$${whole ? formatCop(Math.abs(value)) : formatPrice(Math.abs(value))}`
  return value > 0 ? `+${formatted}` : value < 0 ? `−${formatted}` : formatted
}

function Field({
  label,
  htmlFor,
  aside,
  children,
}: {
  label: string
  htmlFor: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="calc-field">
      <div className="calc-field__top">
        <label className="calc-field__label" htmlFor={htmlFor}>
          {label}
        </label>
        {aside}
      </div>
      {children}
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="calc-kpi">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function evaluate(draft: ScenarioDraft): TradeValidation {
  return computeTrade({
    buyPrice: parseAmount(draft.buyPrice),
    sellPrice: parseAmount(draft.sellPrice),
    sizeMode: draft.sizeMode,
    shares: parseAmount(draft.shares),
    amount: parseAmount(draft.amount),
  })
}

function feeDetail(order: { commissionBase: number; commissionVat: number; minimumApplied: boolean }) {
  const detail = `${formatCop(order.commissionBase, 2)} + ${formatCop(order.commissionVat, 2)} IVA`
  return order.minimumApplied ? `mínimo · ${detail}` : detail
}
