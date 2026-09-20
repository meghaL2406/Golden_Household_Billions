import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export type EmptyStateProps = {
  icon?: IconName | ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon = "layers", title, description, action, className }: EmptyStateProps): JSX.Element {
  const iconNode = typeof icon === "string" ? <Icon name={icon as IconName} size={30} /> : icon;
  return (
    <div className={`fid-empty${className ? ` ${className}` : ""}`}>
      <div className="fid-empty__icon">{iconNode}</div>
      <h2 className="h2">{title}</h2>
      {description ? <p className="fid-empty__desc">{description}</p> : null}
      {action ? <div className="fid-empty__action">{action}</div> : null}
    </div>
  );
}

export default EmptyState;
