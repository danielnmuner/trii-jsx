import 'katex/dist/katex.min.css'

import katex from 'katex'
import { alertDiagnosticReferences, tacticalDiagnosticReferences, type DiagnosticReferenceItem } from '../lib/diagnosticReferences'

export function DiagnosticsPanel() {
  return (
    <section className="diagnostic-reference">
      <header className="diagnostic-reference__header">
        <div className="diagnostic-reference__copy">
          <h3>Diagnostics reference</h3>
          <p>
            Practical reading guide for intraday execution. Use it as a disciplined framework, not as a rigid rulebook:
            thresholds and signal quality can vary by symbol, liquidity regime, and session state.
          </p>
        </div>
      </header>

      <DiagnosticBand
        title="Tactical reads"
        subtitle="Execution quality, top-of-book bias, and where price stands relative to session flow."
        variant="tactical"
        items={tacticalDiagnosticReferences}
      />

      <DiagnosticBand
        title="Alert reads"
        subtitle="Outlier conditions and structural mismatches that deserve extra caution before acting."
        variant="alerts"
        items={alertDiagnosticReferences}
      />
    </section>
  )
}

function DiagnosticBand({
  title,
  subtitle,
  variant,
  items,
}: {
  title: string
  subtitle: string
  variant: 'tactical' | 'alerts'
  items: DiagnosticReferenceItem[]
}) {
  return (
    <section className={`diagnostic-reference__panel diagnostic-reference__panel--${variant}`}>
      <div className="diagnostic-reference__panel-header">
        <div className="diagnostic-reference__panel-copy">
          <h4>{title}</h4>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="diagnostic-reference__band">
        {items.map((item) => (
          <ReferenceCard key={`${variant}-${item.title}`} item={item} />
        ))}
      </div>
    </section>
  )
}

function ReferenceCard({ item }: { item: DiagnosticReferenceItem }) {
  return (
    <article className="diagnostic-reference__card">
      <h5 className="diagnostic-reference__title">{item.title}</h5>

      <div className="diagnostic-reference__section">
        <div className="diagnostic-reference__label">Formula</div>
        <div className="diagnostic-reference__math-stack">
          {item.formulas.map((formula) => (
            <LatexLine key={formula} expression={formula} />
          ))}
        </div>
      </div>

      <div className="diagnostic-reference__section">
        <div className="diagnostic-reference__label">Rules</div>
        <div className="diagnostic-reference__math-stack diagnostic-reference__math-stack--rules">
          {item.rules.map((rule) => (
            <LatexLine key={rule} expression={rule} />
          ))}
        </div>
      </div>

      <div className="diagnostic-reference__section">
        <div className="diagnostic-reference__label">Description</div>
        <p className="diagnostic-reference__description">{item.description}</p>
      </div>
    </article>
  )
}

function LatexLine({ expression }: { expression: string }) {
  const html = katex.renderToString(expression, {
    throwOnError: false,
    displayMode: false,
    strict: 'ignore',
  })

  return <div className="diagnostic-reference__math-line" dangerouslySetInnerHTML={{ __html: html }} />
}
