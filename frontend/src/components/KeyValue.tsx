import type { ReactNode } from "react";

export type KeyValueItem = { label: string; value: ReactNode };

export function KeyValue({ items, columns = 2, className }: { items: KeyValueItem[]; columns?: 2 | 3; className?: string }): JSX.Element {
  return (
    <dl className={`fid-kv fid-kv--${columns}${className ? ` ${className}` : ""}`}>
      {items.map((it, i) => (
        <div key={`${it.label}-${i}`}>
          <dt className="fid-kv__label">{it.label}</dt>
          <dd className="fid-kv__value" style={{ margin: 0 }}>
            {it.value === null || it.value === undefined || it.value === "" ? <span className="muted">—</span> : it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default KeyValue;
