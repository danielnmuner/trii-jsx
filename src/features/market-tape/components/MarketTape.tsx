import clsx from 'clsx'
import Marquee from 'react-fast-marquee'
import { useMemo } from 'react'
import { useMarketTape } from '../hooks/useMarketTape'

const MarqueeComponent =
  (Marquee as unknown as { default?: typeof Marquee }).default ?? Marquee

function formatTapeValue(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: value >= 1000 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatTapeDelta(value: number) {
  const absoluteValue = Math.abs(value)
  const formattedValue = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: absoluteValue >= 1000 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(absoluteValue)

  return `${value >= 0 ? '+' : '-'}${formattedValue}`
}

function formatTapePercent(value: number) {
  return `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(2)}%`
}

function formatTapeDate(value: string) {
  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
  }).format(parsedDate)
}

export function MarketTape() {
  const tapeQuery = useMarketTape()
  const quotes = tapeQuery.data?.quotes ?? []

  const tickerItems = useMemo(
    () => [...quotes, ...quotes],
    [quotes],
  )

  if (quotes.length === 0 && !tapeQuery.isLoading) {
    return (
      <section className="market-tape" aria-label="Macro market tape">
        <div className="market-tape__track market-tape__track--fallback">
          <div className="market-tape__fallback">
            <span className="market-tape__fallbackLabel">Macro tape unavailable</span>
            <span className="market-tape__fallbackText">
              Waiting for Alpha Vantage cache to recover.
            </span>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="market-tape" aria-label="Macro market tape">
      <div className="market-tape__track">
        <MarqueeComponent autoFill pauseOnHover gradient={false} speed={30}>
          {tickerItems.map((quote, index) => {
            const tone = quote.delta > 0 ? 'positive' : quote.delta < 0 ? 'negative' : 'neutral'

            return (
              <article
                key={`${quote.id}-${index}`}
                className={clsx('market-tape__item', `market-tape__item--${quote.assetClass}`)}
                title={`${quote.label} · ${formatTapeDate(quote.asOf)}`}
              >
                <div className="market-tape__head">
                  <span className="market-tape__label">{quote.label}</span>
                  <span className="market-tape__date">{formatTapeDate(quote.asOf)}</span>
                </div>

                <div className="market-tape__body">
                  <span className="market-tape__price">{formatTapeValue(quote.price)}</span>
                  <span className={clsx('market-tape__delta', `market-tape__delta--${tone}`)}>
                    {formatTapeDelta(quote.delta)} · {formatTapePercent(quote.deltaPercent)}
                  </span>
                </div>
              </article>
            )
          })}
        </MarqueeComponent>
      </div>
    </section>
  )
}
