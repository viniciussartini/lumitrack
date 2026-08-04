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
 * Tabela de alertas — inbox global em /alertas, conforme `isAlerts` de
 * `LumiTrack Home.dc.html`. Colunas: Nome | Alvo | Referência | Tolerância |
 * Status | Habilitado | Ações. Primeiro uso real da classe `.table` do
 * Industry (`industry.css`) — antes só existia no CSS, nunca em JSX.
 */
export const AlertTable = ({ alerts, onEdit }: AlertTableProps) => (
    <div className="blueprint" data-testid="alert-table-wrapper">
        <i className="corner tl" />
        <i className="corner tr" />
        <i className="corner bl" />
        <i className="corner br" />

        <div className="border-divider border-b px-5 py-4">
            <span className="font-heading text-[17px] font-semibold uppercase">
                Alertas configurados
            </span>
        </div>

        <div className="overflow-x-auto">
            <table className="table min-w-[760px]" data-testid="alert-table">
                <thead>
                    <tr>
                        <th scope="col">Nome</th>
                        <th scope="col">Alvo</th>
                        <th scope="col" className="text-right">
                            Referência
                        </th>
                        <th scope="col" className="text-right">
                            Tolerância
                        </th>
                        <th scope="col">Status</th>
                        <th scope="col">Habilitado</th>
                        <th scope="col" className="text-right">
                            <span className="sr-only">Ações</span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {alerts.map((alert) => (
                        <Row key={alert.id} alert={alert} onEdit={onEdit} />
                    ))}
                </tbody>
            </table>
        </div>
    </div>
)

interface RowProps {
    alert: AlertWithStatus
    onEdit?: (alert: AlertWithStatus) => void
}

const Row = ({ alert, onEdit }: RowProps) => (
    <tr data-testid={`alert-row-${alert.id}`}>
        <td className="font-semibold">{alert.name}</td>
        <td className="text-muted">
            {alert.target ? (
                <Link to={alert.target.path} className="hover:text-accent hover:underline">
                    {alert.target.name}
                </Link>
            ) : (
                "—"
            )}
        </td>
        <td className={cn("text-right", "font-features-['tnum'_1]")}>
            {formatReferencePowerKw(alert.referencePowerKw)}
        </td>
        <td className={cn("text-right", "font-features-['tnum'_1]")}>
            {formatTolerancePercent(alert.tolerancePercent)}
        </td>
        <td>
            <AlertStatusBadge alert={alert} />
        </td>
        <td className={alert.enabled ? "text-status-success font-semibold" : "text-muted"}>
            {alert.enabled ? "Sim" : "Não"}
        </td>
        <td className="text-right">
            <AlertRowMenu alert={alert} onEdit={onEdit ? () => onEdit(alert) : undefined} />
        </td>
    </tr>
)
