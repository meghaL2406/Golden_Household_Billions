import { Icon } from "./Icon";

export type Step = { label: string; done?: boolean; active?: boolean };

export function Stepper({ steps, className }: { steps: Step[]; className?: string }): JSX.Element {
  return (
    <ol className={`fid-stepper${className ? ` ${className}` : ""}`} aria-label="Progress">
      {steps.map((s, i) => {
        const cls = ["fid-step", s.done ? "fid-step--done" : "", s.active ? "fid-step--active" : ""].filter(Boolean).join(" ");
        return (
          <li key={`${s.label}-${i}`} className={cls} aria-current={s.active ? "step" : undefined}>
            <span className="fid-step__line" aria-hidden="true" />
            <span className="fid-step__dot">{s.done ? <Icon name="check" size={12} /> : i + 1}</span>
            <span className="fid-step__label">
              {s.label}
              {s.done ? <span className="sr-only"> (done)</span> : s.active ? <span className="sr-only"> (current)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default Stepper;
