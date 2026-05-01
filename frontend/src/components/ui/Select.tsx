import { forwardRef, useId, type SelectHTMLAttributes, type ReactNode } from "react"
import { cn } from "@/lib/cn"

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    label?: string
    error?: string
    helperText?: string
    children: ReactNode
}

/**
 * Select nativo estilizado. Mantém consistência visual com Input.
 *
 * Por que <select> nativo em vez de Radix Select?
 *   - Acessibilidade nativa: keyboard, screen reader, mobile picker.
 *   - Zero dependência adicional.
 *   - Estilização "aceitável" — não é pixel-perfect cross-browser, mas
 *     pra um app interno é mais que suficiente.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
    ({ label, error, helperText, className, id, children, ...rest }, ref) => {
        const generatedId = useId()
        const selectId = id ?? generatedId
        const hasError = Boolean(error)

        return (
            <div className="flex flex-col gap-1.5">
                {label && (
                    <label
                        htmlFor={selectId}
                        className="text-sm font-medium text-slate-700 dark:text-slate-200"
                    >
                        {label}
                    </label>
                )}
                <select
                    id={selectId}
                    ref={ref}
                    aria-invalid={hasError}
                    aria-describedby={
                        hasError
                            ? `${selectId}-error`
                            : helperText
                                ? `${selectId}-helper`
                                : undefined
                    }
                    className={cn(
                        "h-10 rounded-md border px-3 text-sm",
                        "bg-white text-slate-900",
                        "dark:bg-slate-900 dark:text-slate-100",
                        "focus:outline-none focus:ring-2 focus:ring-offset-0",
                        "disabled:cursor-not-allowed disabled:opacity-60",
                        hasError
                            ? "border-red-500 focus:ring-red-500 dark:border-red-500"
                            : "border-slate-300 focus:ring-brand-500 dark:border-slate-700",
                        className,
                    )}
                    {...rest}
                >
                    {children}
                </select>
                {hasError ? (
                    <span
                        id={`${selectId}-error`}
                        role="alert"
                        className="text-xs text-red-600 dark:text-red-400"
                    >
                        {error}
                    </span>
                ) : helperText ? (
                    <span
                        id={`${selectId}-helper`}
                        className="text-xs text-slate-500 dark:text-slate-400"
                    >
                        {helperText}
                    </span>
                ) : null}
            </div>
        )
    },
)

Select.displayName = "Select"