import type { ReactNode } from "react";
import { Eyebrow } from "./Eyebrow";

export type PageHeaderProps = {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, action }: PageHeaderProps): JSX.Element {
  return (
    <header className="fid-pagehead">
      <div className="grow">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="h1">{title}</h1>
        {description ? <p className="fid-pagehead__desc">{description}</p> : null}
      </div>
      {action ? <div className="fid-pagehead__action">{action}</div> : null}
    </header>
  );
}

export default PageHeader;
