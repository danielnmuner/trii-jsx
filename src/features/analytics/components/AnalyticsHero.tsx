import { useMemo, useState } from 'react'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DraggableAttributes,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import clsx from 'clsx'
import type { AnalyticsSymbolFeed } from '../api/schemas'
import { formatInteger, formatPercentFromWhole } from '../lib/formatters'
import { coreSortPresets, type CoreSortIntent } from '../lib/coreSymbolSorting'

type AnalyticsHeroProps = {
  from?: string
  dataStatusLabel: string
  dataStatusTone: 'loading' | 'fetching' | 'live' | 'degraded'
  to?: string
}

export function AnalyticsHero({
  dataStatusLabel,
  dataStatusTone,
  from: _from,
  to: _to,
}: AnalyticsHeroProps) {
  return (
    <section className="analytics-topbar">
      <div className="analytics-topbar__title">
        <div className="analytics-topbar__headline">
          <span className="analytics-topbar__eyebrow">Realtime desk</span>
          <span className={clsx('analytics-topbar__status', `is-${dataStatusTone}`)}>
            {dataStatusLabel}
          </span>
          <h1>Analytics</h1>
        </div>
      </div>
    </section>
  )
}

type AnalyticsFiltersProps = {
  orderedSymbols: string[]
  heldSymbols: string[]
  latestBySymbol: Record<string, AnalyticsSymbolFeed['current_snapshot'] | undefined>
  selectedSymbols: string[]
  symbols: string[]
  sortIntent: CoreSortIntent
  onSelectedSymbolsChange: (symbols: string[]) => void
  onSymbolOrderChange: (symbols: string[]) => void
  onSortIntentChange: (intent: CoreSortIntent) => void
  onOwnedSymbolsSelect: () => void
}

type SymbolChipTone = 'positive' | 'negative' | 'neutral'

type SymbolChipViewModel = {
  symbol: string
  isSelected: boolean
  tone: SymbolChipTone
  price: string | null
  delta: string | null
}

export function AnalyticsFilters({
  orderedSymbols,
  heldSymbols,
  latestBySymbol,
  selectedSymbols,
  symbols,
  sortIntent,
  onSelectedSymbolsChange,
  onSymbolOrderChange,
  onSortIntentChange,
  onOwnedSymbolsSelect,
}: AnalyticsFiltersProps) {
  const selectedSet = new Set(selectedSymbols)
  const displaySymbols = orderedSymbols.length > 0 ? orderedSymbols : symbols
  const [activeDragSymbol, setActiveDragSymbol] = useState<string | null>(null)
  const dragEnabled = sortIntent === 'manual'

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const chipModels = useMemo<Record<string, SymbolChipViewModel>>(
    () =>
      Object.fromEntries(
        displaySymbols.map((symbol) => {
          const snapshot = latestBySymbol[symbol]
          const tone =
            typeof snapshot?.daily_change_amount === 'number'
              ? snapshot.daily_change_amount < 0
                ? 'negative'
                : snapshot.daily_change_amount > 0
                  ? 'positive'
                  : 'neutral'
              : 'neutral'

          return [
            symbol,
            {
              symbol,
              isSelected: selectedSet.has(symbol),
              tone,
              price:
                snapshot?.last_price === null || snapshot?.last_price === undefined
                  ? null
                  : formatInteger(snapshot.last_price),
              delta:
                snapshot?.daily_change_amount === null || snapshot?.daily_change_amount === undefined
                  ? null
                  : `${formatInteger(snapshot.daily_change_amount)} (${formatPercentFromWhole(snapshot.daily_change_percent)})`,
            },
          ]
        }),
      ),
    [displaySymbols, latestBySymbol, selectedSet],
  )

  const activeChip = activeDragSymbol ? chipModels[activeDragSymbol] : null

  const toggleCoreSymbol = (symbol: string) => {
    const isSelected = selectedSymbols.includes(symbol)
    const nextSymbols = isSelected ? selectedSymbols.filter((item) => item !== symbol) : [...selectedSymbols, symbol]
    onSelectedSymbolsChange(nextSymbols.length > 0 ? nextSymbols : [symbol])
  }

  const handleDragStart = (event: DragStartEvent) => {
    if (!dragEnabled) {
      return
    }

    setActiveDragSymbol(String(event.active.id))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    setActiveDragSymbol(null)

    if (!dragEnabled || !overId || activeId === overId) {
      return
    }

    const oldIndex = displaySymbols.indexOf(activeId)
    const newIndex = displaySymbols.indexOf(overId)
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
      return
    }

    onSymbolOrderChange(arrayMove(displaySymbols, oldIndex, newIndex))
  }

  return (
    <section className="analytics-filterbar" aria-label="Primary filters">
      <div className="analytics-filterbar__group analytics-filterbar__group--core">
        <span className="analytics-filterbar__label">Core</span>
        <div className="analytics-sortbar" role="tablist" aria-label="Core ranking">
          {coreSortPresets.map((preset) => {
            const isActive = preset.key === sortIntent
            return (
              <button
                key={preset.key}
                type="button"
                className={clsx('analytics-sortbar__button', isActive && 'analytics-sortbar__button--active')}
                onClick={() => onSortIntentChange(preset.key)}
                aria-pressed={isActive}
              >
                {preset.label}
              </button>
            )
          })}
          <button
            type="button"
            className="analytics-sortbar__button analytics-sortbar__button--action"
            onClick={onOwnedSymbolsSelect}
            disabled={heldSymbols.length === 0}
          >
            Owned
          </button>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <SortableContext items={displaySymbols} strategy={rectSortingStrategy}>
            <div className="symbol-chip-row">
              {displaySymbols.map((symbol) => (
                <SortableSymbolChip
                  key={`core-${symbol}`}
                  dragEnabled={dragEnabled}
                  model={chipModels[symbol]}
                  onToggle={toggleCoreSymbol}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {dragEnabled && activeChip ? <SymbolChipCard model={activeChip} isDraggingOverlay /> : null}
          </DragOverlay>
        </DndContext>
      </div>
    </section>
  )
}

function SortableSymbolChip({
  dragEnabled,
  model,
  onToggle,
}: {
  dragEnabled: boolean
  model: SymbolChipViewModel
  onToggle: (symbol: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: model.symbol,
    disabled: !dragEnabled,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} className={clsx('symbol-chip-shell', isDragging && 'symbol-chip-shell--dragging')}>
      <SymbolChipCard
        model={model}
        dragAttributes={attributes}
        dragEnabled={dragEnabled}
        dragListeners={listeners}
        isDragging={isDragging}
        onToggle={onToggle}
      />
    </div>
  )
}

function SymbolChipCard({
  model,
  dragAttributes,
  dragEnabled = true,
  dragListeners,
  isDragging = false,
  isDraggingOverlay = false,
  onToggle,
}: {
  model: SymbolChipViewModel
  dragAttributes?: DraggableAttributes
  dragEnabled?: boolean
  dragListeners?: ReturnType<typeof useSortable>['listeners']
  isDragging?: boolean
  isDraggingOverlay?: boolean
  onToggle?: (symbol: string) => void
}) {
  return (
    <button
      type="button"
      className={clsx(
        'symbol-chip',
        !dragEnabled && 'symbol-chip--static',
        model.isSelected && 'symbol-chip--selected',
        isDragging && 'symbol-chip--dragging',
        isDraggingOverlay && 'symbol-chip--overlay',
      )}
      aria-pressed={model.isSelected}
      onClick={onToggle ? () => onToggle(model.symbol) : undefined}
      {...dragAttributes}
      {...dragListeners}
    >
      <img
        src={`/symbols/${model.symbol.toLowerCase()}.png`}
        alt=""
        aria-hidden="true"
        className="symbol-chip__icon"
      />
      <span className="symbol-chip__content">
        <span className="symbol-chip__symbol">{model.symbol}</span>
        {model.price ? <span className={clsx('symbol-chip__price', `symbol-chip__price--${model.tone}`)}>{model.price}</span> : null}
        {model.delta ? <span className={clsx('symbol-chip__delta', `symbol-chip__delta--${model.tone}`)}>{model.delta}</span> : null}
      </span>
    </button>
  )
}
