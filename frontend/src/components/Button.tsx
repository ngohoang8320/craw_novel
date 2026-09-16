import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "success" | "ghost";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-700",
  secondary:
    "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700",
  danger: "bg-red-600 text-white hover:bg-red-700",
  success: "bg-green-600 text-white hover:bg-green-700",
  ghost: "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-2 py-1 text-xs",
  md: "px-4 py-1.5 text-sm",
};

/** Shared button styling so every action across the app looks and behaves
 * consistently. Pass any extra classes via `className` (merged on, so a
 * caller can add spacing/width without fighting the base styles). */
export function Button({ variant = "secondary", size = "md", className = "", disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...rest}
    />
  );
}
