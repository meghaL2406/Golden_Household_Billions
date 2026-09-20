import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export type NoticeProps = {
  tone?: "info" | "warning" | "danger" | "success";
  children: ReactNode;
  className?: string;
  icon?: boolean;
};

const ICONS: Record<NonNullable<NoticeProps["tone"]>, IconName> = {
  info: "info",
  warning: "alert",
  danger: "alert",
  success: "check",
};

export function Notice({ tone = "info", children, className, icon = true }: NoticeProps): JSX.Element {
  return (
    <div className={`fid-notice fid-notice--${tone}${className ? ` ${className}` : ""}`} role={tone === "danger" ? "alert" : "status"}>
      {icon ? <Icon name={ICONS[tone]} size={14} /> : null}
      <div className="grow">{children}</div>
    </div>
  );
}

export default Notice;
