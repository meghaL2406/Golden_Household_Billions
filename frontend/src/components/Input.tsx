import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { Field } from "./Field";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, hint, error, className, id, ...rest }, ref) {
  const autoId = useId();
  const inputId = id ?? `in-${autoId}`;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId}>
      <input
        ref={ref}
        id={inputId}
        className={`fid-control${error ? " fid-control--error" : ""}${className ? ` ${className}` : ""}`}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
    </Field>
  );
});

export default Input;
