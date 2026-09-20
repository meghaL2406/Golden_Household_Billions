import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

export type ModalProps = {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number | string;
};

export function Modal({ open, title, onClose, children, footer, width }: ModalProps): JSX.Element | null {
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
    <div className="fid-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fid-modal" role="dialog" aria-modal="true" style={width ? { maxWidth: width } : undefined}>
        <div className="fid-modal__head">
          <div className="fid-modal__title">{title}</div>
          <button type="button" className="fid-iconbtn" aria-label="Close" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="fid-modal__body">{children}</div>
        {footer ? <div className="fid-modal__foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export default Modal;
