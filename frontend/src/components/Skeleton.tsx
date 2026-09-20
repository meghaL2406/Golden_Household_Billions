const WIDTHS = ["92%", "76%", "84%", "60%", "88%", "70%"];

export function Skeleton({ rows = 3, className }: { rows?: number; className?: string }): JSX.Element {
  return (
    <div className={`fid-skeleton${className ? ` ${className}` : ""}`} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="fid-skeleton__bar" style={{ width: WIDTHS[i % WIDTHS.length] }} />
      ))}
    </div>
  );
}

export default Skeleton;
