import { type ButtonHTMLAttributes, type ReactNode } from "react"
import { cn } from "@/lib/cn"

type Variant = "primary" | "secondary" | "ghost" | "danger"
type Size = "sm" | "md" | "lg"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant
    size?: Size
    isLoading?: boolean
    leftIcon?: ReactNode
    rightIcon?: ReactNode
}

// Subset do Button do frontend principal — sem `asChild`/Radix Slot (não
// precisamos de botão polimórfico nesta ferramenta interna pequena).
const variantClass: Record<Variant, string> = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    ghost: "btn-ghost",
    danger: "btn-danger",
}

const sizeStyles: Record<Size, string> = {
    sm: "text-xs px-3 py-1",
    md: "",
    lg: "text-base px-6 py-3",
}

export const Button = ({
    variant = "primary",
    size = "md",
    isLoading = false,
    leftIcon,
    rightIcon,
    disabled,
    className,
    children,
    ...rest
}: ButtonProps) => {
    const isDisabled = disabled || isLoading

    return (
        <button
            disabled={isDisabled}
            className={cn("btn", variantClass[variant], sizeStyles[size], className)}
            {...rest}
        >
            {isLoading ? <Spinner /> : leftIcon}
            {children}
            {!isLoading && rightIcon}
        </button>
    )
}

const Spinner = () => (
    <svg
        className="h-4 w-4 animate-spin"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
    >
        <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
        />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
)
