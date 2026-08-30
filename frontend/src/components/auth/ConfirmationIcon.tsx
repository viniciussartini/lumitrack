import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/cn"

type ConfirmationIconTone = "accent" | "success" | "danger"

const TONE_CLASS: Record<ConfirmationIconTone, string> = {
    accent: "border-accent text-accent",
    success: "border-status-success text-status-success",
    danger: "border-status-danger text-status-danger",
}

interface ConfirmationIconProps {
    icon: LucideIcon
    tone: ConfirmationIconTone
    strokeWidth: number
}

/**
 * Círculo com ícone das telas de confirmação de autenticação (link enviado,
 * senha redefinida, e-mail confirmado, link inválido) — mesmo motivo visual
 * repetido idêntico em ForgotPasswordPage, ResetPasswordPage e
 * ConfirmEmailChangePage antes desta extração. 52px/26px/1.5px são medidas
 * próprias deste componente (não múltiplo de 3.4px — fora da escala de
 * espaçamento do Industry), mantidas locais em vez de token global por só
 * terem este único consumidor depois da extração.
 */
export const ConfirmationIcon = ({ icon: Icon, tone, strokeWidth }: ConfirmationIconProps) => (
    <div
        className={cn(
            "mx-auto flex h-[52px] w-[52px] items-center justify-center border-[1.5px]",
            TONE_CLASS[tone],
        )}
    >
        <Icon className="h-[26px] w-[26px]" strokeWidth={strokeWidth} aria-hidden="true" />
    </div>
)
