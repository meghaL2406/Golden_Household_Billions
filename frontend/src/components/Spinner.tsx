export function Spinner({ size = "md", className }: { size?: "md" | "lg"; className?: string }): JSX.Element {
  return <span className={`fid-spinner${size === "lg" ? " fid-spinner--lg" : ""}${className ? ` ${className}` : ""}`} role="status" aria-label="Loading" />;
}

export default Spinner;
