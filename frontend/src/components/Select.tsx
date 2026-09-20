import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from "react";
import { Field } from "./Field";
import { Icon } from "./Icon";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  options?: { value: string; label: string }[];
  placeholder?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, className, id, options, placeholder, children, ...rest },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? `sel-${autoId}`;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={selectId}>
      <div className="fid-select-wrap">
        <select
          ref={ref}
          id={selectId}
          className={`fid-control${error ? " fid-control--error" : ""}${className ? ` ${className}` : ""}`}
          aria-invalid={error ? true : undefined}
          {...rest}
        >
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options ? options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>) : null}
          {children}
        </select>
        <span className="fid-select-wrap__chev">
          <Icon name="chevron-down" size={14} />
        </span>
      </div>
    </Field>
  );
});

export default Select;
