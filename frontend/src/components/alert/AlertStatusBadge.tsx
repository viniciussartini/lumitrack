import { cn } from "@/lib/cn"
import type { AlertWithStatus } from "@/types/alert.types"

interface AlertStatusBadgeProps {
    alert: AlertWithStatus
    className?: string
}

const STATUS_LABELS: Record<AlertWithStatus["status"], string> = {
    firing: "Em disparo",
    normal: "Normal",
}

const STATUS_STYLES: Record<AlertWithStatus["status"], string> = {
    firing: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    normal: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
}

/**
 * Badge visual do status de um alerta (Fase 5) — "firing"/"normal", já
 * resolvido pelo backend (`AlertEvaluator.isFiring`). Diferente do modelo
 * one-shot antigo, um alerta pode voltar a "firing" quantas vezes a
 * potência sair da faixa, enquanto habilitado.
 */
export const AlertStatusBadge = ({ alert, className }: AlertStatusBadgeProps) => (
    <span
        data-testid={`alert-status-badge-${alert.id}`}
        data-status={alert.status}
        className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            STATUS_STYLES[alert.status],
            className,
        )}
    >
        {STATUS_LABELS[alert.status]}
    </span>
)
