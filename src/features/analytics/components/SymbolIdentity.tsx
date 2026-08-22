import { useState } from 'react'

type SymbolIdentityProps = {
  symbol: string
  className?: string
}

export function SymbolIdentity({ symbol, className }: SymbolIdentityProps) {
  const [iconVisible, setIconVisible] = useState(true)

  return (
    <span className={className ?? 'symbol-identity'}>
      {iconVisible ? (
        <img
          src={`/symbols/${symbol.toLowerCase()}.png`}
          alt=""
          aria-hidden="true"
          className="symbol-identity__icon"
          onError={() => setIconVisible(false)}
        />
      ) : null}
      <span>{symbol}</span>
    </span>
  )
}
