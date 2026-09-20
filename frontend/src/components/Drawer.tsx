import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

export type DrawerProps = {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  width?: number | string;
};

export function Drawer({ open, title, onClose, children, width }: DrawerProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <div className="fid-drawer-backdrop" onMouseDown={onClose} />
      <aside className="fid-drawer" role="dialog" aria-modal="true" style={width ? { width } : undefined}>
        <div className="fid-drawer__head">
          <div className="fid-drawer__title">{title}</div>
          <button type="button" className="fid-iconbtn" aria-label="Close" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="fid-drawer__body">{children}</div>
      </aside>
    </>,
    document.body,
  );
}

export default Drawer;
