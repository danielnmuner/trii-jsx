import clsx from 'clsx'

type TabsProps<T extends string> = {
  items: readonly T[]
  active: T
  onChange: (value: T) => void
}

export function Tabs<T extends string>({ items, active, onChange }: TabsProps<T>) {
  return (
    <div className="ui-tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          role="tab"
          aria-selected={active === item}
          className={clsx('ui-tab', active === item && 'ui-tab--active')}
          onClick={() => onChange(item)}
        >
          {item}
        </button>
      ))}
    </div>
  )
}
