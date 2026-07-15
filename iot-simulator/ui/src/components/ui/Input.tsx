import { forwardRef, useId, type InputHTMLAttributes } from "react"
import { cn } from "@/lib/cn"

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string
    error?: string
    helperText?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ label, error, helperText, className, id, ...rest }, ref) => {
        const generatedId = useId()
        const inputId = id ?? generatedId
        const hasError = Boolean(error)

        return (
            <div className="flex flex-col gap-1.5">
                {label && (
                    <label htmlFor={inputId} className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        {label}
                    </label>
                )}
                <input
                    id={inputId}
                    ref={ref}
                    aria-invalid={hasError}
                    aria-describedby={hasError ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
                    className={cn(
                        "h-10 rounded-md border px-3 text-sm",
                        "bg-white text-slate-900 placeholder:text-slate-400",
                        "dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500",
                        "focus:outline-none focus:ring-2 focus:ring-offset-0",
                        "disabled:cursor-not-allowed disabled:opacity-60",
                        hasError
                            ? "border-red-500 focus:ring-red-500 dark:border-red-500"
                            : "border-slate-300 focus:ring-brand-500 dark:border-slate-700",
                        className,
                    )}
                    {...rest}
                />
                {hasError ? (
                    <span id={`${inputId}-error`} role="alert" className="text-xs text-red-600 dark:text-red-400">
                        {error}
                    </span>
                ) : helperText ? (
                    <span id={`${inputId}-helper`} className="text-xs text-slate-500 dark:text-slate-400">
                        {helperText}
                    </span>
                ) : null}
            </div>
        )
    },
)

Input.displayName = "Input"
