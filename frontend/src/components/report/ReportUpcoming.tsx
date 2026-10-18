import { useMemo } from "react"
import { Link } from "react-router"
import { Blueprint } from "@/components/ui/Blueprint"
import { useReportSchedules } from "@/hooks/queries/useReportSchedules"
import type { CompareTargetGroup } from "@/lib/periodComparison"
import { buildTargetLabelIndex } from "@/lib/reportHistory"
import {
    MAX_SCHEDULES,
    UPCOMING_WINDOW_DAYS,
    describeSchedule,
    selectUpcomingSchedules,
} from "@/lib/reportSchedule"

interface ReportUpcomingProps {
    /** Alvos do cadastro, para mostrar o nome de cada configuração. */
    groups: CompareTargetGroup[]
}

/**
 * Bloco "Envios agendados" de Relatórios (LumiTrack Home v2.dc.html, view
 * `reports`) — configurações ativas com envio previsto nos próximos 15 dias,
 * uma linha por configuração, com atalho para gerenciá-las.
 */
export const ReportUpcoming = ({ groups }: ReportUpcomingProps) => {
    // Uma página basta: o teto de configurações por usuário cabe nela.
    const query = useReportSchedules(1, MAX_SCHEDULES)
    const targetLabels = useMemo(() => buildTargetLabelIndex(groups), [groups])
    const upcoming = useMemo(
        () => (query.data ? selectUpcomingSchedules(query.data.items, new Date()) : []),
        [query.data],
    )

    return (
        <Blueprint className="max-w-xl p-0" data-testid="report-upcoming">
            <div className="border-divider flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
                <div>
                    <span className="font-heading text-17 font-semibold uppercase">
                        Envios agendados
                    </span>
                    <span className="text-muted mt-0.5 block text-xs">
                        Ativos com envio nos próximos {UPCOMING_WINDOW_DAYS} dias.
                    </span>
                </div>
                <Link to="/configuracoes/relatorios" className="btn btn-secondary">
                    Gerenciar
                </Link>
            </div>

            {query.isPending && (
                <p role="status" className="text-muted px-5 py-8 text-center text-sm">
                    Carregando...
                </p>
            )}
            {query.isError && (
                <p role="alert" className="text-status-danger px-5 py-8 text-center text-sm">
                    Não foi possível carregar os envios agendados.
                </p>
            )}
            {query.data && upcoming.length === 0 && (
                <p className="text-muted px-5 py-8 text-center text-sm">
                    Nenhum envio ativo nos próximos {UPCOMING_WINDOW_DAYS} dias.
                </p>
            )}
            {upcoming.length > 0 && (
                <ul>
                    {upcoming.map((schedule) => {
                        const view = describeSchedule(schedule, targetLabels)
                        return (
                            <li
                                key={schedule.id}
                                className="border-divider min-w-0 border-t px-5 py-3.5"
                                data-testid="report-upcoming-row"
                            >
                                <span className="block text-sm font-semibold">{view.title}</span>
                                <span className="text-muted mt-1 block text-xs">{view.meta}</span>
                                <span className="text-muted mt-0.5 block text-xs">
                                    Próximo envio: {view.nextRun}
                                </span>
                            </li>
                        )
                    })}
                </ul>
            )}
        </Blueprint>
    )
}
