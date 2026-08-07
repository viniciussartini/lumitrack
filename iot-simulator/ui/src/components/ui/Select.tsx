import { forwardRef, useId, type SelectHTMLAttributes, type ReactNode } from "react"
import { cn } from "@/lib/cn"

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    label?: string
    error?: string
    helperText?: string
    children: ReactNode
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
    ({ label, error, helperText, className, id, children, ...rest }, ref) => {
        const generatedId = useId()
        const selectId = id ?? generatedId
        const hasError = Boolean(error)

        return (
            <div className={cn("sim-field", className)}>
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
                    className={cn("sim-input", hasError && "border-status-danger")}
                    {...rest}
                >
                    {children}
                </select>
                {hasError ? (
                    <span
                        id={`${selectId}-error`}
                        role="alert"
                        className="text-status-danger mt-1.5 block text-xs"
                    >
                        {error}
                    </span>
                ) : helperText ? (
                    <span id={`${selectId}-helper`} className="text-muted mt-1.5 block text-xs">
                        {helperText}
                    </span>
                ) : null}
            </div>
        )
    },
)

Select.displayName = "Select"
