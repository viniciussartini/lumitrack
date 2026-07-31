import { Link } from "react-router"
import { AlertStatusBadge } from "@/components/alert/AlertStatusBadge"
import { AlertRowMenu } from "@/components/alert/AlertRowMenu"
import { formatReferencePowerKw, formatTolerancePercent } from "@/lib/formatters/alert"
import { cn } from "@/lib/cn"
import type { AlertWithStatus } from "@/types/alert.types"

interface AlertTableProps {
    alerts: AlertWithStatus[]
    onEdit?: (alert: AlertWithStatus) => void
}

/**
 * Tabela de alertas — inbox global em /alertas (Fase 5).
 * Colunas: Nome | Alvo | Referência | Tolerância | Status | Habilitado | Ações
 */
export const AlertTable = ({ alerts, onEdit }: AlertTableProps) => (
    <div
        className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800"
        data-testid="alert-table-wrapper"
    >
        <table className="w-full text-sm" data-testid="alert-table">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <th scope="col" className="px-4 py-3 font-medium">
                        Nome
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                        Alvo
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                        Referência
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                        Tolerância
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                        Status
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                        Habilitado
                    </th>
                    <th scope="col" className="w-px px-2 py-3">
                        <span className="sr-only">Ações</span>
                    </th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {alerts.map((alert) => (
                    <Row key={alert.id} alert={alert} onEdit={onEdit} />
                ))}
            </tbody>
        </table>
    </div>
)

interface RowProps {
    alert: AlertWithStatus
    onEdit?: (alert: AlertWithStatus) => void
}

const Row = ({ alert, onEdit }: RowProps) => (
    <tr
        data-testid={`alert-row-${alert.id}`}
        className={cn(
            "text-slate-900 dark:text-slate-100",
            "hover:bg-slate-50 dark:hover:bg-slate-900/50",
        )}
    >
        <td className="px-4 py-3">{alert.name}</td>
        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
            {alert.target ? (
                <Link
                    to={alert.target.path}
                    className="hover:underline hover:text-brand-600 dark:hover:text-brand-400"
                >
                    {alert.target.name}
                </Link>
            ) : (
                "—"
            )}
        </td>
        <td className="px-4 py-3 text-right font-mono tabular-nums">
            {formatReferencePowerKw(alert.referencePowerKw)}
        </td>
        <td className="px-4 py-3 text-right font-mono tabular-nums">
            {formatTolerancePercent(alert.tolerancePercent)}
        </td>
        <td className="px-4 py-3">
            <AlertStatusBadge alert={alert} />
        </td>
        <td className="px-4 py-3">
            <span
                className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                    alert.enabled
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
                )}
            >
                {alert.enabled ? "Sim" : "Não"}
            </span>
        </td>
        <td className="px-2 py-2">
            <AlertRowMenu alert={alert} onEdit={onEdit ? () => onEdit(alert) : undefined} />
        </td>
    </tr>
)
