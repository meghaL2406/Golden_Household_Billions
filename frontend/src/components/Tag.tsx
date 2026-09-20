import type { ReactNode } from "react";
import { statusTone, titleCase, type Tone } from "../lib/format";

export type TagTone = Tone | "steel" | "cement" | "textiles" | "chemicals";

export type TagProps = {
  tone?: TagTone;
  children: ReactNode;
  className?: string;
  title?: string;
};

export function Tag({ tone = "neutral", children, className, title }: TagProps): JSX.Element {
  return (
    <span className={`fid-tag fid-tag--${tone}${className ? ` ${className}` : ""}`} title={title}>
      {children}
    </span>
  );
}

export function StatusTag({ status, className }: { status: string | null | undefined; className?: string }): JSX.Element {
  return (
    <Tag tone={statusTone(status)} className={className}>
      {titleCase(status) || "Unknown"}
    </Tag>
  );
}

export default Tag;
