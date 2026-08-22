import type { ReactNode } from 'react'
import { Card } from '../../../shared/ui/Card'

type ManualDataPanelProps = {
  title: string
  subtitle: string
  controls?: ReactNode
  body: ReactNode
}

export function ManualDataPanel({ title, subtitle, controls, body }: ManualDataPanelProps) {
  return (
    <Card className="manual-panel">
      <header className="manual-panel__header">
        <div className="manual-panel__copy">
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        {controls ? <div className="manual-panel__controls">{controls}</div> : null}
      </header>
      <div className="manual-panel__body">{body}</div>
    </Card>
  )
}
