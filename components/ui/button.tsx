import * as React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline";
};

export function Button({ className = "", variant = "default", ...props }: ButtonProps) {
  const base = "px-4 py-2 rounded-none text-sm transition focus:outline-none focus:ring-0";
  const variants: Record<string, string> = {
    default: "bg-black text-white dark:bg-white dark:text-black border border-black dark:border-white hover:opacity-90",
    outline: "bg-transparent text-black dark:text-white border border-black dark:border-white hover:bg-black/5 dark:hover:bg-white/10",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export default Button;


