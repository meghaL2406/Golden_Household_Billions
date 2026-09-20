import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export type StatTileProps = {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  note?: ReactNode;
  icon?: IconName | ReactNode;
};

export function StatTile({ label, value, unit, note, icon }: StatTileProps): JSX.Element {
  const iconNode = typeof icon === "string" ? <Icon name={icon as IconName} size={14} /> : icon;
  return (
    <div className="fid-stat">
      <div className="fid-stat__label">
        <span>{label}</span>
        {iconNode ?? null}
      </div>
      <div className="fid-stat__value">
        <span className="tabular">{value}</span>
        {unit ? <span className="fid-stat__unit">{unit}</span> : null}
      </div>
      {note ? <div className="fid-stat__note">{note}</div> : null}
    </div>
  );
}

export function StatRow({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return <div className={`fid-statrow${className ? ` ${className}` : ""}`}>{children}</div>;
}

export default StatTile;
