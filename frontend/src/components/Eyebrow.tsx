import type { ReactNode } from "react";

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return <span className={`eyebrow${className ? ` ${className}` : ""}`}>{children}</span>;
}

export default Eyebrow;
