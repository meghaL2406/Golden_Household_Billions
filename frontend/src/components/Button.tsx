import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md";
  icon?: IconName | ReactNode;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", icon, loading = false, className, children, disabled, type = "button", ...rest },
  ref,
) {
  const iconNode = typeof icon === "string" ? <Icon name={icon as IconName} size={size === "sm" ? 14 : 15} /> : icon;
  const classes = ["fid-btn", `fid-btn--${variant}`, size === "sm" ? "fid-btn--sm" : "", loading ? "fid-btn--loading" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="fid-btn__spinner" aria-hidden="true" /> : iconNode ?? null}
      {children !== undefined && children !== null ? <span className="fid-btn__label">{children}</span> : null}
    </button>
  );
});

export default Button;
