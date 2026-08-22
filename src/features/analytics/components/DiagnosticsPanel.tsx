import 'katex/dist/katex.min.css'

import katex from 'katex'
import { useState } from 'react'
import {
  alertDiagnosticReferences,
  faqEntries,
  tacticalDiagnosticReferences,
  type DiagnosticReferenceItem,
  type UserGuideFaqItem,
} from '../lib/diagnosticReferences'

const newsReferences = [
  {
    label: 'Valora Analitik',
    href: 'https://www.valoraanalitik.com/noticias-bolsa-de-valores/',
    logo: '/icons/valoraanalitik.png',
  },
  {
    label: 'La Republica',
    href: 'https://www.larepublica.co/bolsa-de-valores-de-colombia',
    logo: '/icons/lr.png',
  },
  {
    label: 'Bloomberg Linea',
    href: 'https://www.bloomberglinea.com/tags/bolsa-de-valores-de-colombia/',
    logo: '/icons/bloomberg.png',
  },
  {
    label: 'BVC',
    href: 'https://www.bvc.com.co/?tab=indices_accionarios&tabNoticias=comunicados-de-prensa',
    logo: '/icons/bvc.png',
  },
  {
    label: 'Superfinanciera',
    href: 'https://www.superfinanciera.gov.co/SIMEV2/informacionrelevantegeneral',
    logo: '/icons/sfc.png',
  },
] as const

export function DiagnosticsPanel() {
  const [activeCard, setActiveCard] = useState<string | null>(null)
  const [activeFaq, setActiveFaq] = useState<string | null>(faqEntries[0]?.question ?? null)

  return (
    <section className="user-guide">
      <div className="user-guide__layout">
        <section className="user-guide__faqSection">
          <div className="user-guide__sectionBar">
            <span className="user-guide__sectionTag">FAQs</span>
          </div>

          <div className="user-guide__faqList">
            {faqEntries.map((entry) => (
              <FaqCard
                key={entry.question}
                entry={entry}
                isOpen={activeFaq === entry.question}
                onToggle={() => setActiveFaq((current) => (current === entry.question ? null : entry.question))}
              />
            ))}
          </div>
        </section>

        <section className="user-guide__formulaColumn">
          <GuideShelf
            accent="execution"
            items={tacticalDiagnosticReferences}
            sectionKey="execution"
            title="Execution"
            activeCard={activeCard}
            onActiveCardChange={setActiveCard}
          />

          <GuideShelf
            accent="risk"
            items={alertDiagnosticReferences}
            sectionKey="risk"
            title="Risk"
            activeCard={activeCard}
            onActiveCardChange={setActiveCard}
          />

          <section className="user-guide__formulaSection">
            <div className="user-guide__sectionBar">
              <span className="user-guide__sectionTag user-guide__sectionTag--news">News Flow</span>
            </div>

            <div className="user-guide__newsGrid">
              {newsReferences.map((reference) => (
                <a
                  key={reference.label}
                  className="user-guide__newsLink"
                  href={reference.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={reference.label}
                  title={reference.label}
                >
                  <img
                    src={reference.logo}
                    alt={reference.label}
                    className="user-guide__newsLogo"
                  />
                </a>
              ))}
            </div>
          </section>
        </section>
      </div>
    </section>
  )
}

function GuideShelf({
  accent,
  activeCard,
  items,
  onActiveCardChange,
  sectionKey,
  title,
}: {
  accent: 'execution' | 'risk'
  activeCard: string | null
  items: DiagnosticReferenceItem[]
  onActiveCardChange: (value: string | null) => void
  sectionKey: string
  title: string
}) {
  return (
    <section className="user-guide__formulaSection">
      <div className="user-guide__sectionBar">
        <span className={`user-guide__sectionTag user-guide__sectionTag--${accent}`}>{title}</span>
      </div>

      <div className="user-guide__formulaGrid">
        {items.map((item) => {
          const cardKey = `${sectionKey}-${item.title}`
          return (
            <GuideFormulaCard
              key={cardKey}
              accent={accent}
              active={activeCard === cardKey}
              item={item}
              onActiveChange={(nextActive) => onActiveCardChange(nextActive ? cardKey : null)}
            />
          )
        })}
      </div>
    </section>
  )
}

function GuideFormulaCard({
  accent,
  active,
  item,
  onActiveChange,
}: {
  accent: 'execution' | 'risk'
  active: boolean
  item: DiagnosticReferenceItem
  onActiveChange: (value: boolean) => void
}) {
  return (
    <article
      className={`user-guide__formulaCard user-guide__formulaCard--${accent} ${active ? 'user-guide__formulaCard--active' : ''}`}
      onMouseEnter={() => onActiveChange(true)}
      onMouseLeave={() => onActiveChange(false)}
    >
      <button
        type="button"
        className="user-guide__formulaTrigger"
        aria-expanded={active}
        onFocus={() => onActiveChange(true)}
        onBlur={() => onActiveChange(false)}
        onClick={() => onActiveChange(!active)}
      >
        <span className="user-guide__formulaTitle">{item.title}</span>
        <LatexLine className="user-guide__formulaLine" expression={item.primaryFormula} />
        <span className="user-guide__formulaHint">Hover for rules</span>
      </button>

      <div className={`user-guide__hoverCard ${active ? 'user-guide__hoverCard--visible' : ''}`}>
        {item.supportingFormula ? (
          <div className="user-guide__hoverBlock">
            <span className="user-guide__hoverLabel">Support</span>
            <LatexLine className="user-guide__hoverFormula" expression={item.supportingFormula} />
          </div>
        ) : null}

        <div className="user-guide__hoverBlock">
          <span className="user-guide__hoverLabel">Rules</span>
          <ul className="user-guide__ruleList">
            {item.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>

        <div className="user-guide__hoverBlock">
          <span className="user-guide__hoverLabel">Description</span>
          <p className="user-guide__hoverCopy">{item.description}</p>
        </div>
      </div>
    </article>
  )
}

function FaqCard({
  entry,
  isOpen,
  onToggle,
}: {
  entry: UserGuideFaqItem
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <article className={`user-guide__faqCard ${isOpen ? 'user-guide__faqCard--open' : ''}`}>
      <button
        type="button"
        className="user-guide__faqQuestion"
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <span>{entry.question}</span>
        <span className={`user-guide__faqIcon ${isOpen ? 'user-guide__faqIcon--open' : ''}`} aria-hidden="true">
          +
        </span>
      </button>

      <div className={`user-guide__faqAnswer ${isOpen ? 'user-guide__faqAnswer--open' : ''}`}>
        {entry.answerParagraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </article>
  )
}

function LatexLine({ className, expression }: { className?: string; expression: string }) {
  const html = katex.renderToString(expression, {
    throwOnError: false,
    displayMode: false,
    strict: 'ignore',
  })

  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
