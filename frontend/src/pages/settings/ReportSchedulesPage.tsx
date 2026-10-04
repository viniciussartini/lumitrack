import { useMemo } from "react"
import { Link } from "react-router"
import { FileText } from "lucide-react"
import { toast } from "sonner"
import { ReportScheduleForm } from "@/components/report/ReportScheduleForm"
import { ReportScheduleList } from "@/components/report/ReportScheduleList"
import { Blueprint } from "@/components/ui/Blueprint"
import { EmptyState } from "@/components/ui/EmptyState"
import { useCreateReportSchedule } from "@/hooks/queries/useReportSchedules"
import { usePropertyTree } from "@/hooks/queries/usePropertyTree"
import { buildCompareTargetGroups, type CompareTargetGroup } from "@/lib/periodComparison"
import { extractErrorMessage } from "@/services/api"

/**
 * Configurações → Relatórios (LumiTrack Home v2.dc.html) — geração e envio
 * automático de relatórios por e-mail: formulário de criação e a lista das
 * configurações já criadas.
 */
export const ReportSchedulesPage = () => {
    const treeQuery = usePropertyTree()
    const groups = useMemo(
        () => (treeQuery.data ? buildCompareTargetGroups(treeQuery.data) : []),
        [treeQuery.data],
    )

    if (treeQuery.isPending) {
        return (
            <p role="status" className="text-muted p-10 text-center text-sm">
                Carregando...
            </p>
        )
    }

    if (treeQuery.isError) {
        return (
            <p role="alert" className="text-status-danger p-10 text-center text-sm">
                Não foi possível carregar suas propriedades.
            </p>
        )
    }

    if (groups.length === 0) {
        return (
            <EmptyState
                icon={FileText}
                title="Nada para agendar ainda"
                description="Cadastre uma propriedade, com seu medidor, para agendar relatórios."
                action={
                    <Link to="/configuracoes/cadastro" className="btn btn-primary">
                        Ir para o cadastro
                    </Link>
                }
            />
        )
    }

    return (
        <div className="flex flex-col gap-[clamp(16px,2vw,20px)]">
            <CreateScheduleCard groups={groups} />
            <ReportScheduleList groups={groups} />
        </div>
    )
}

const CreateScheduleCard = ({ groups }: { groups: CompareTargetGroup[] }) => {
    const create = useCreateReportSchedule()

    return (
        <Blueprint className="p-0">
            <div className="border-divider border-b px-5 py-4">
                <span className="font-heading text-17 font-semibold uppercase">
                    Geração automática
                </span>
                <span className="text-muted mt-0.5 block text-xs">
                    O relatório é gerado e enviado por e-mail no período escolhido.
                </span>
            </div>
            <div className="p-5">
                <ReportScheduleForm
                    groups={groups}
                    isSubmitting={create.isPending}
                    onSubmit={(input) =>
                        create.mutate(input, {
                            onError: (error) =>
                                toast.error("Não foi possível salvar a configuração", {
                                    description: extractErrorMessage(error),
                                }),
                        })
                    }
                />
            </div>
        </Blueprint>
    )
}
