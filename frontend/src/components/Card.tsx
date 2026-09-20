import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { Eyebrow } from "./Eyebrow";

export type CardProps = {
  title?: ReactNode;
  eyebrow?: ReactNode;
  subnote?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
  padding?: number | string;
  style?: CSSProperties;
  hover?: boolean;
};

export function Card({ title, eyebrow, subnote, action, children, className, onClick, padding, style, hover }: CardProps): JSX.Element {
  const clickable = typeof onClick === "function";
  const classes = ["fid-card", clickable ? "fid-card--clickable" : "", hover ? "fid-card--hover" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  const hasHead = title || eyebrow || subnote || action;
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!clickable) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.();
    }
  };
  return (
    <div
      className={classes}
      style={{ ...(padding !== undefined ? { padding } : {}), ...style }}
      onClick={onClick}
      onKeyDown={onKey}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      {hasHead ? (
        <div className="fid-card__head">
          <div className="grow">
            {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
            {title ? <div className="fid-card__title">{title}</div> : null}
            {subnote ? <div className="fid-card__subnote">{subnote}</div> : null}
          </div>
          {action ? <div className="fid-card__action">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export default Card;
