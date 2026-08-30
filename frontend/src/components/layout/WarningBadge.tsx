import { Link } from "react-router"
import { TriangleAlert } from "lucide-react"
import { useFiringAlerts } from "@/hooks/queries/useAlerts"

/**
 * Ícone de alerta em disparo — LumiTrack Home.dc.html, linhas 90-93. O
 * botão é chrome persistente do Header, sempre visível (como no
 * protótipo) — só o contador sobreposto aparece/some conforme há ou não
 * alertas disparando agora. Hidratado por `GET /api/alerts/firing`,
 * invalidado pelo `RealtimeContext` a cada evento SSE `alert-firing`
 * (start/end).
 */
export const WarningBadge = () => {
    const { data: firingAlerts = [] } = useFiringAlerts()
    const count = firingAlerts.length

    const label =
        count === 0
            ? "Alerta de consumo — nenhum alerta em disparo agora"
            : count === 1
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
            <TriangleAlert className="h-18 w-18" strokeWidth={1.5} aria-hidden="true" />
            {count > 0 && (
                <span
                    data-testid="warning-badge-count"
                    className="lt-iconbtn-badge"
                    aria-hidden="true"
                >
                    {count}
                </span>
            )}
        </Link>
    )
}
