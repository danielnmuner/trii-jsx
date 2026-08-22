type StatusStateProps = {
  title: string
  description: string
  tone?: 'info' | 'error'
}

export function StatusState({ title, description, tone = 'info' }: StatusStateProps) {
  return (
    <div className={`ui-state ui-state--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  )
}
