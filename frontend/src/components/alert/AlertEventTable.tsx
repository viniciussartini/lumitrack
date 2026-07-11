import {
    formatDateTime,
    formatDurationSeconds,
    formatPowerW,
} from "@/lib/formatters/alert"
import { cn } from "@/lib/cn"
import type { AlertTriggerEvent } from "@/types/alert-event.types"

interface AlertEventTableProps {
    events: AlertTriggerEvent[]
    /** Nome do alerta ao qual os episódios pertencem (o histórico é
     * filtrado por um único `alertId` de cada vez — ver `GET /api/alert-events`). */
    alertName: string
}

/**
 * Histórico de episódios de disparo (`AlertTriggerEvent`) — Fase 5.
 * Colunas: Alerta | Início | Fim | Duração | Mín | Máx | Média (potência).
 */
export const AlertEventTable = ({ events, alertName }: AlertEventTableProps) => (
    <div
        className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800"
        data-testid="alert-event-table-wrapper"
    >
        <table className="w-full text-sm" data-testid="alert-event-table">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <th scope="col" className="px-4 py-3 font-medium">
                        Alerta
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                        Início
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                        Fim
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                        Duração
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                        Mín
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                        Máx
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                        Média
                    </th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {events.map((event) => (
                    <tr
                        key={event.id}
                        data-testid={`alert-event-row-${event.id}`}
                        className={cn(
                            "text-slate-900 dark:text-slate-100",
                            "hover:bg-slate-50 dark:hover:bg-slate-900/50",
                        )}
                    >
                        <td className="px-4 py-3">{alertName}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700 dark:text-slate-300">
                            {formatDateTime(event.startedAt)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700 dark:text-slate-300">
                            {formatDateTime(event.endedAt)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700 dark:text-slate-300">
                            {formatDurationSeconds(event.durationSeconds)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                            {formatPowerW(event.minPowerW)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                            {formatPowerW(event.maxPowerW)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                            {formatPowerW(event.avgPowerW)}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
)
