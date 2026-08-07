import { forwardRef, useId, type SelectHTMLAttributes, type ReactNode } from "react"
import { cn } from "@/lib/cn"

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    label?: string
    error?: string
    helperText?: string
    children: ReactNode
}

/**
 * Select nativo estilizado com as classes do Industry (.field/.input).
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
            <div className="field">
                {label && <label htmlFor={selectId}>{label}</label>}
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
                        "input lt-input w-full",
                        hasError && "border-status-danger",
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
                        className="text-status-danger text-xs"
                    >
                        {error}
                    </span>
                ) : helperText ? (
                    <span id={`${selectId}-helper`} className="text-muted text-xs">
                        {helperText}
                    </span>
                ) : null}
            </div>
        )
    },
)

Select.displayName = "Select"
