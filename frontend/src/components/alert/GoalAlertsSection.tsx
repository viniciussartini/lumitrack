import { Link } from "react-router"
import { Target } from "lucide-react"
import { Blueprint } from "@/components/ui/Blueprint"
import { Tag } from "@/components/ui/Tag"
import { useGoalAlerts } from "@/hooks/queries/useGoals"
import { formatGoalPercent } from "@/lib/goals"
import type { GoalAlert, GoalAlertPeriod } from "@/types/goal.types"

/**
 * Bloco "Alertas de meta" da página de Alertas: uma linha por meta do ano
 * corrente, com o quanto do mês e do ano o consumo já representa e se o aviso
 * já saiu. É só leitura — os percentuais se configuram em Configurações →
 * Metas. Reaproveita o padrão visual da tabela de alertas configurados.
 */
export const GoalAlertsSection = () => {
    const query = useGoalAlerts()

    return (
        <Blueprint className="p-0" data-testid="goal-alerts">
            <div className="border-divider border-b px-5 py-4">
                <span className="font-heading text-17 font-semibold uppercase">
                    Alertas de meta
                </span>
                <span className="text-muted text-12-5 mt-1 block">
                    Avisos de quando o consumo atinge o percentual da meta do mês ou da meta anual.
                </span>
            </div>
            <Body isPending={query.isPending} isError={query.isError} alerts={query.data ?? []} />
        </Blueprint>
    )
}

interface BodyProps {
    isPending: boolean
    isError: boolean
    alerts: GoalAlert[]
}

const Body = ({ isPending, isError, alerts }: BodyProps) => {
    if (isPending) {
        return (
            <p role="status" className="text-muted p-8 text-center text-sm">
                Carregando...
            </p>
        )
    }
    if (isError) {
        return (
            <p role="alert" className="text-status-danger p-8 text-center text-sm">
                Não foi possível carregar os alertas de meta.
            </p>
        )
    }
    if (alerts.length === 0) {
        return (
            <div data-testid="goal-alerts-empty" className="flex flex-col items-center gap-3 p-8">
                <Target className="text-muted h-6 w-6" aria-hidden="true" />
                <p className="text-muted text-center text-sm">
                    Nenhuma meta cadastrada para o ano corrente.
                </p>
                <Link to="/configuracoes/metas" className="btn btn-secondary">
                    Ir para as metas
                </Link>
            </div>
        )
    }

    return <GoalAlertsTable alerts={alerts} />
}

const GoalAlertsTable = ({ alerts }: { alerts: GoalAlert[] }) => (
    <div className="overflow-x-auto">
        <table className="table min-w-190">
            <thead>
                <tr>
                    <th scope="col">Meta</th>
                    <th scope="col" className="text-right">
                        Alerta ao atingir
                    </th>
                    <th scope="col">No mês</th>
                    <th scope="col">No ano</th>
                </tr>
            </thead>
            <tbody>
                {alerts.map((alert) => (
                    <tr key={alert.goalId} data-testid={`goal-alert-row-${alert.goalId}`}>
                        <td className="font-semibold">
                            {alert.propertyName} · {alert.year}
                        </td>
                        <td className="text-right">{alert.alertPercent}%</td>
                        <td>
                            <PeriodCell period={alert.monthly} />
                        </td>
                        <td>
                            <PeriodCell period={alert.annual} />
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
)

const PeriodCell = ({ period }: { period: GoalAlertPeriod }) => (
    <span className="inline-flex flex-wrap items-center gap-2">
        <span>{formatGoalPercent(period.percent)}</span>
        {period.percent !== null &&
            (period.notified ? (
                <Tag variant="accent">Notificado</Tag>
            ) : period.reached ? (
                <Tag variant="accent-2">Atingido</Tag>
            ) : (
                <Tag variant="neutral">Dentro da meta</Tag>
            ))}
    </span>
)
