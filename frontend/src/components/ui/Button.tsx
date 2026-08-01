import { type ButtonHTMLAttributes, type ReactNode } from "react"
import { cn } from "@/lib/cn"
import { Slot } from "@radix-ui/react-slot"

type Variant = "primary" | "secondary" | "ghost" | "danger"
type Size = "sm" | "md" | "lg"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant
    size?: Size
    isLoading?: boolean
    leftIcon?: ReactNode
    rightIcon?: ReactNode
    asChild?: boolean
}

/**
 * Variantes no vocabulário do Industry (.btn base + modificador):
 * primary é o único objeto sólido do design system; danger não tem um .btn
 * sólido vermelho — é .btn-secondary tingido com a cor de status danger
 * (ver styles/industry.css, confirmado no botão "Excluir conta" do
 * protótipo LumiTrack Home.dc.html).
 */
const variantClass: Record<Variant, string> = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    ghost: "btn-ghost",
    danger: "btn-danger",
}

/**
 * Tamanhos não especificados pelo bundle (os protótipos de auth só usam o
 * tamanho default de .btn) — extrapolação razoável sobre a mesma escala de
 * espaçamento do Industry (0.85×, ver index.css @theme inline --spacing).
 */
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
    asChild = false,
    ...rest
}: ButtonProps) => {
    const isDisabled = disabled || isLoading
    const BtnComp = asChild ? Slot : "button"

    /**
     * Renderização do conteúdo:
     *
     * Quando asChild=true, o BtnComp é o Slot do Radix, que precisa de
     * UM ÚNICO elemento filho pra clonar (Slot propaga className/onClick/etc
     * pro filho). Se passarmos um Fragment como filho, o Slot tenta
     * propagar `className` pro Fragment — e Fragments só aceitam `key`
     * e `children`. Isso gera o warning:
     *
     *   "Invalid prop `className` supplied to React.Fragment"
     */
    const content = asChild ? (
        children
    ) : isLoading ? (
        <Spinner />
    ) : (
        <>
            {leftIcon}
            {children}
            {rightIcon}
        </>
    )

    return (
        <BtnComp
            // "button" aceita disabled nativamente; Slot/Link não.
            // Passamos apenas quando não é asChild para evitar warning.
            {...(!asChild && { disabled: isDisabled })}
            className={cn(
                "btn",
                variantClass[variant],
                sizeStyles[size],
                className,
            )}
            {...rest}
        >
            {content}
        </BtnComp>
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
