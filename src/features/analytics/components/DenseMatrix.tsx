import type { ReactNode } from 'react'
import clsx from 'clsx'

type DenseMatrixColumn<Row> = {
  id: string
  label: string
  className?: string
  render: (row: Row) => ReactNode
}

type DenseMatrixProps<Row> = {
  title: string
  subtitle?: string
  columns: Array<DenseMatrixColumn<Row>>
  gridTemplateColumns?: string
  rows: Row[]
  rowKey: (row: Row) => string
}

export function DenseMatrix<Row>({
  title,
  subtitle,
  columns,
  gridTemplateColumns,
  rows,
  rowKey,
}: DenseMatrixProps<Row>) {
  return (
    <section className="dense-matrix">
      <header className="dense-matrix__header">
        <div className="dense-matrix__copy">
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <span className="dense-matrix__count">{rows.length} rows</span>
      </header>

      <div className="dense-matrix__viewport">
        <div
          className="dense-matrix__table"
          style={{ gridTemplateColumns: gridTemplateColumns ?? `repeat(${columns.length}, minmax(0, 1fr))` }}
          role="table"
          aria-label={title}
        >
          {columns.map((column) => (
            <div key={column.id} className={clsx('dense-matrix__th', column.className)} role="columnheader">
              {column.label}
            </div>
          ))}

          {rows.map((row) =>
            columns.map((column) => (
              <div
                key={`${rowKey(row)}-${column.id}`}
                className={clsx('dense-matrix__td', column.className)}
                role="cell"
                data-label={column.label}
              >
                {column.render(row)}
              </div>
            )),
          )}
        </div>
      </div>
    </section>
  )
}
