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
    firing: "border-status-warning/40 bg-status-warning/10 text-status-warning",
    normal: "border-status-success/40 bg-status-success/10 text-status-success",
}

/**
 * Badge visual do status de um alerta — "firing"/"normal", já
 * resolvido pelo backend (`AlertEvaluator.isFiring`). Diferente do modelo
 * one-shot antigo, um alerta pode voltar a "firing" quantas vezes a
 * potência sair da faixa, enquanto habilitado.
 *
 * Badge quadrado com borda (fiel ao `miniBadge` de `LumiTrack Home.dc.html`
 * — o protótipo não usa pill `rounded-full` pra isso).
 */
export const AlertStatusBadge = ({ alert, className }: AlertStatusBadgeProps) => (
    <span
        data-testid={`alert-status-badge-${alert.id}`}
        data-status={alert.status}
        className={cn(
            "font-heading inline-flex items-center border px-2 py-0.5 text-[11px] font-semibold uppercase",
            STATUS_STYLES[alert.status],
            className,
        )}
    >
        {STATUS_LABELS[alert.status]}
    </span>
)
