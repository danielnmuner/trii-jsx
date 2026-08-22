type DataTableProps = {
  rows: Array<Record<string, string>>
}

export function DataTable({ rows }: DataTableProps) {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))

  return (
    <div className="ui-table-shell">
      <table className="ui-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${index}-${row[columns[0]] ?? 'row'}`}>
              {columns.map((column) => (
                <td key={column}>{row[column] ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
