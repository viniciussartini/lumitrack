import { Link } from "react-router"
import { TriangleAlert } from "lucide-react"
import { useFiringAlerts } from "@/hooks/queries/useAlerts"

/**
 * Ícone de alerta em disparo — LumiTrack Home.dc.html, linhas 90-93.
 * Hidratado por `GET /api/alerts/firing`, invalidado pelo `RealtimeContext`
 * a cada evento SSE `alert-firing` (start/end). Some sozinho quando o
 * consumo normaliza (a lista de firing fica vazia).
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
            title="Alerta de consumo"
            aria-label={label}
            data-testid="warning-badge"
            data-count={count}
            className="lt-iconbtn"
        >
            <TriangleAlert className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden="true" />
            <span className="lt-iconbtn-badge" aria-hidden="true">
                {count}
            </span>
        </Link>
    )
}
