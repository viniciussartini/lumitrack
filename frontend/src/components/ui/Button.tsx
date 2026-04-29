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

// Tabela de estilos por variante. Mantida como objeto puro (não como
// função) para que o `prettier-plugin-tailwindcss` ordene as classes
// na build.
const variantStyles: Record<Variant, string> = {
    primary:
        "bg-brand-500 text-white hover:bg-brand-700 focus-visible:ring-brand-500 disabled:bg-slate-300 dark:disabled:bg-slate-700",
    secondary:
        "bg-slate-100 text-slate-900 hover:bg-slate-200 focus-visible:ring-slate-400 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
    ghost:
        "bg-transparent text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-400 dark:text-slate-200 dark:hover:bg-slate-800",
    danger:
        "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500",
}

const sizeStyles: Record<Size, string> = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
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
            className={cn(
                // Base — sempre aplicada
                "inline-flex items-center justify-center gap-2 rounded-md font-medium",
                "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-60",
                "dark:focus-visible:ring-offset-slate-950",
                variantStyles[variant],
                sizeStyles[size],
                className,
            )}
            {...rest}
        >
            {isLoading ? (
                <Spinner />
            ) : (
                <>
                    {leftIcon}
                    {children}
                    {rightIcon}
                </>
            )}
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
        <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        />
    </svg>
)