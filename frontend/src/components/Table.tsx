import type { ReactNode } from "react";

export type Column<T> = {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  width?: string;
  align?: "left" | "right";
};

export type TableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: string;
  className?: string;
};

export function Table<T>({ columns, rows, rowKey, onRowClick, empty = "Nothing to show.", className }: TableProps<T>): JSX.Element {
  const clickable = typeof onRowClick === "function";
  return (
    <div className={`fid-table-wrap${className ? ` ${className}` : ""}`}>
      <table className={`fid-table${clickable ? " fid-table--clickable" : ""}`}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={c.width ? { width: c.width } : undefined} className={c.align === "right" ? "right" : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="fid-table__empty">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={clickable ? () => onRowClick?.(row) : undefined}
                tabIndex={clickable ? 0 : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === "Enter") onRowClick?.(row);
                      }
                    : undefined
                }
              >
                {columns.map((c) => (
                  <td key={c.key} className={c.align === "right" ? "right tabular" : undefined}>
                    {c.render ? c.render(row) : ((row as any)[c.key] as ReactNode) ?? "—"}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default Table;
