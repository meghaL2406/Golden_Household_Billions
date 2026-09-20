import { forwardRef, useId, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Field } from "./Field";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ label, hint, error, className, id, ...rest }, ref) {
  const autoId = useId();
  const taId = id ?? `ta-${autoId}`;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={taId}>
      <textarea
        ref={ref}
        id={taId}
        className={`fid-control${error ? " fid-control--error" : ""}${className ? ` ${className}` : ""}`}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
    </Field>
  );
});

export default Textarea;
