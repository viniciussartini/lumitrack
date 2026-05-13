import { cn } from "@/lib/cn"
import {
    ALERT_STATUS_LABELS,
    getAlertStatus,
    type Alert,
    type AlertStatus,
} from "@/types/alert.types"

interface AlertStatusBadgeProps {
    alert: Alert
    className?: string
}

/**
 * Badge visual do status de um alerta.
 *
 *   ACTIVE     → cinza neutro      ("esperando algo acontecer")
 *   TRIGGERED  → vermelho          ("aconteceu — preciso de atenção")
 *   READ       → cinza fraco       ("já resolvido — desativado visualmente")
 *
 * Decisão: o status é DERIVADO do Alert via getAlertStatus, então o badge
 * recebe o Alert inteiro (não um status pré-computado).
 * callsites só precisam ter o Alert em mãos — quem chama não precisa saber a lógica
 * de precedência READ > TRIGGERED > ACTIVE.
 *
 * Como o `getAlertStatus` colapsa "READ implica TRIGGERED" em um único
 * estado READ, o badge nunca mostra dois estados ao mesmo tempo —
 * o que evita o problema clássico de "qual cor vence" sem fonte de verdade.
 */
export const AlertStatusBadge = ({ alert, className }: AlertStatusBadgeProps) => {
    const status = getAlertStatus(alert)
    const label = ALERT_STATUS_LABELS[status]

    return (
        <span
            data-testid={`alert-status-badge-${alert.id}`}
            data-status={status}
            className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                statusStyles[status],
                className,
            )}
        >
            {label}
        </span>
    )
}

/**
 * Estilos por status. Mantido como objeto puro para que o
 * prettier-plugin-tailwindcss ordene as classes na build.
 *
 * Notas:
 *   - TRIGGERED usa red-100/red-700 no light e red-500/30 no dark.
 *     Vermelho vivo demais cansa olhos em telas escuras; o /30 em alpha
 *     dá um vermelho "rebaixado" que ainda destaca sem queimar.
 *   - READ é o cinza mais apagado da escala — propositalmente menos
 *     contrastante que ACTIVE, sinalizando "já está resolvido".
 */
const statusStyles: Record<AlertStatus, string> = {
    ACTIVE:
        "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    TRIGGERED:
        "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    READ:
        "bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-500",
}