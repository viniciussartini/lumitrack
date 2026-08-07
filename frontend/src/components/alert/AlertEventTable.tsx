import { formatDateTime, formatDurationSeconds, formatPowerW } from "@/lib/formatters/alert"
import { cn } from "@/lib/cn"
import type { AlertTriggerEvent } from "@/types/alert-event.types"

interface AlertEventTableProps {
    events: AlertTriggerEvent[]
    /** Nome do alerta ao qual os episódios pertencem (o histórico é
     * filtrado por um único `alertId` de cada vez — ver `GET /api/alert-events`). */
    alertName: string
}

/**
 * Histórico de episódios de disparo (`AlertTriggerEvent`), conforme
 * `isAlerts` de `LumiTrack Home.dc.html`. Colunas: Alerta | Início | Fim |
 * Duração | Mín | Máx | Média (potência) — "Média" em destaque
 * (`text-status-warning`), fiel ao protótipo.
 */
export const AlertEventTable = ({ events, alertName }: AlertEventTableProps) => (
    <div className="blueprint" data-testid="alert-event-table-wrapper">
        <i className="corner tl" />
        <i className="corner tr" />
        <i className="corner bl" />
        <i className="corner br" />

        <div className="overflow-x-auto">
            <table className="table min-w-[720px]" data-testid="alert-event-table">
                <thead>
                    <tr>
                        <th scope="col">Alerta</th>
                        <th scope="col">Início</th>
                        <th scope="col">Fim</th>
                        <th scope="col">Duração</th>
                        <th scope="col" className="text-right">
                            Mín
                        </th>
                        <th scope="col" className="text-right">
                            Máx
                        </th>
                        <th scope="col" className="text-right">
                            Média
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {events.map((event) => (
                        <tr key={event.id} data-testid={`alert-event-row-${event.id}`}>
                            <td className="font-semibold">{alertName}</td>
                            <td className="text-muted whitespace-nowrap">
                                {formatDateTime(event.startedAt)}
                            </td>
                            <td className="text-muted whitespace-nowrap">
                                {formatDateTime(event.endedAt)}
                            </td>
                            <td className="whitespace-nowrap">
                                {formatDurationSeconds(event.durationSeconds)}
                            </td>
                            <td className={cn("text-right", "font-features-['tnum'_1]")}>
                                {formatPowerW(event.minPowerW)}
                            </td>
                            <td className={cn("text-right", "font-features-['tnum'_1]")}>
                                {formatPowerW(event.maxPowerW)}
                            </td>
                            <td
                                className={cn(
                                    "text-status-warning text-right font-semibold",
                                    "font-features-['tnum'_1]",
                                )}
                            >
                                {formatPowerW(event.avgPowerW)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
)
