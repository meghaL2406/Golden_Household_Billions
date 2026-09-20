import { fmtDateTime, type Tone } from "../lib/format";

export type TimelineItem = { title: string; at?: string; note?: string; tone?: Tone };

export function Timeline({ items, className }: { items: TimelineItem[]; className?: string }): JSX.Element {
  return (
    <ol className={`fid-timeline${className ? ` ${className}` : ""}`}>
      {items.map((it, i) => (
        <li key={`${it.title}-${i}`} className={`fid-tl-item fid-tl-item--${it.tone ?? "blue"}`}>
          <span className="fid-tl-item__dot" aria-hidden="true" />
          <div className="fid-tl-item__title">{it.title}</div>
          {it.at ? <div className="fid-tl-item__at">{fmtDateTime(it.at)}</div> : null}
          {it.note ? <div className="fid-tl-item__note">{it.note}</div> : null}
        </li>
      ))}
    </ol>
  );
}

export default Timeline;
