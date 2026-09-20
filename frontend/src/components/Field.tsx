import type { ReactNode } from "react";

export type FieldProps = {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
};

export function Field({ label, hint, error, children, className, htmlFor }: FieldProps): JSX.Element {
  return (
    <div className={`fid-field${className ? ` ${className}` : ""}`}>
      {label ? (
        <label className="fid-field__label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : null}
      {children}
      {error ? <div className="fid-field__error" role="alert">{error}</div> : hint ? <div className="fid-field__hint">{hint}</div> : null}
    </div>
  );
}

export default Field;
