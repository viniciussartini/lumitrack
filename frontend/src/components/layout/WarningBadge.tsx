import { Link } from "react-router"
import { TriangleAlert } from "lucide-react"
import { useFiringAlerts } from "@/hooks/queries/useAlerts"
import { cn } from "@/lib/cn"

/**
 * Badge âmbar de alertas em disparo — Fase 5. Hidratado por
 * `GET /api/alerts/firing`, invalidado pelo `RealtimeContext` a cada evento
 * SSE `alert-firing` (start/end). Some sozinho quando o consumo normaliza
 * (a lista de firing fica vazia).
 */
export const WarningBadge = () => {
    const { data: firingAlerts = [] } = useFiringAlerts()

    if (firingAlerts.length === 0) return null

    const count = firingAlerts.length
    const label =
        count === 1
            ? "1 alerta em disparo"
            : `${count} alertas em disparo`

    return (
        <Link
            to="/alertas"
            aria-label={label}
            data-testid="warning-badge"
            data-count={count}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                "bg-amber-100 text-amber-800 hover:bg-amber-200",
                "dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2",
                "dark:focus-visible:ring-offset-slate-950",
            )}
        >
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
            {count}
        </Link>
    )
}
