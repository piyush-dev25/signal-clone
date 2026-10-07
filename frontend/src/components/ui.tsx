import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "bg-input text-fg hover:bg-hover",
  ghost: "text-accent hover:bg-hover",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`inline-flex h-button items-center justify-center gap-2 rounded-button px-4 text-body font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40 ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

/** Round, icon-only button. `label` is the accessible name and the hover tooltip. */
export function IconButton({
  label,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-icon-button shrink-0 items-center justify-center rounded-full text-fg-secondary transition-colors hover:bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent ${className}`}
      {...props}
    />
  );
}

const FIELD =
  "h-button rounded-control border border-border bg-surface px-3 text-body text-fg placeholder:text-fg-tertiary focus:border-accent focus:outline-none";

export function TextField({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${FIELD} min-w-0 ${className}`} {...props} />;
}

export function SelectField({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${FIELD} px-2 ${className}`} {...props} />;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-body-sm text-danger">
      {children}
    </p>
  );
}
