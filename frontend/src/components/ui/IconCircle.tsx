import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/cn"

type IconCircleTone = "accent" | "success" | "danger"

const TONE_CLASS: Record<IconCircleTone, string> = {
    accent: "border-accent text-accent",
    success: "border-status-success text-status-success",
    danger: "border-status-danger text-status-danger",
}

interface IconCircleProps {
    icon: LucideIcon
    tone: IconCircleTone
    strokeWidth: number
    /** Composto com as classes base via `cn` — usado pelas telas de
     * confirmação de auth para centralizar (`mx-auto`) dentro de um card;
     * as details pages de entidade dispensam, já vivem numa linha `flex`. */
    className?: string
}

/**
 * Círculo com ícone — motivo visual repetido idêntico nas telas de
 * confirmação de autenticação (link enviado, senha redefinida, e-mail
 * confirmado, link inválido) e no cabeçalho das details pages de entidade
 * (Propriedade/Área/Dispositivo). O ícone interno usa `--spacing-26px`
 * (token compartilhado, ver `styles/industry.css`); o círculo em si
 * (52px/borda 1.5px) fica arbitrário por decisão consciente, não
 * esquecimento — não estava entre os valores de alta frequência que
 * justificaram a escala de espaçamento de layout, e como este é o único
 * consumidor da medida, um token próprio não teria segundo beneficiário.
 * Por isso este arquivo está catalogado na exceção do lint anti-regressão
 * (`eslint.config.js`, grupo "só valor arbitrário") — não é dívida
 * silenciosa, é a mesma medida documentada em dois lugares.
 */
export const IconCircle = ({ icon: Icon, tone, strokeWidth, className }: IconCircleProps) => (
    <div
        className={cn(
            "flex h-[52px] w-[52px] shrink-0 items-center justify-center border-[1.5px]",
            TONE_CLASS[tone],
            className,
        )}
    >
        <Icon className="h-26px w-26px" strokeWidth={strokeWidth} aria-hidden="true" />
    </div>
)
