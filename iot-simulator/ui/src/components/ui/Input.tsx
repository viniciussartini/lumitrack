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
            <div className={cn("sim-field", className)}>
                {label && <label htmlFor={inputId}>{label}</label>}
                <input
                    id={inputId}
                    ref={ref}
                    aria-invalid={hasError}
                    aria-describedby={
                        hasError ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
                    }
                    className={cn("sim-input", hasError && "border-status-danger")}
                    {...rest}
                />
                {hasError ? (
                    <span
                        id={`${inputId}-error`}
                        role="alert"
                        className="text-status-danger mt-1.5 block text-xs"
                    >
                        {error}
                    </span>
                ) : helperText ? (
                    <span id={`${inputId}-helper`} className="text-muted mt-1.5 block text-xs">
                        {helperText}
                    </span>
                ) : null}
            </div>
        )
    },
)

Input.displayName = "Input"
