export type TabItem = { key: string; label: string; count?: number };

export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}): JSX.Element {
  return (
    <div className={`fid-tabs${className ? ` ${className}` : ""}`} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={t.key === active}
          className={`fid-tab${t.key === active ? " fid-tab--active" : ""}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {typeof t.count === "number" ? <span className="fid-tab__count tabular">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export default Tabs;
