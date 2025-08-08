import * as React from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className = "", ...props }: InputProps) {
  return (
    <input
      className={`w-full px-3 py-2 bg-transparent border border-black dark:border-white rounded-none focus:outline-none focus:ring-0 ${className}`}
      {...props}
    />
  );
}

export default Input;


