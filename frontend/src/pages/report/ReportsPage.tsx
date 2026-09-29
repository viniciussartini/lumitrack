import { useMemo } from "react"
import { Link } from "react-router"
import { FileText } from "lucide-react"
import { toast } from "sonner"
import { ReportEmissionForm } from "@/components/report/ReportEmissionForm"
import { Blueprint } from "@/components/ui/Blueprint"
import { Button } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { useGenerateReport, useDownloadReport } from "@/hooks/queries/useReportMutations"
import { usePropertyTree } from "@/hooks/queries/usePropertyTree"
import { downloadFile } from "@/lib/download/downloadFile"
import { buildCompareTargetGroups } from "@/lib/periodComparison"
import { extractErrorMessage } from "@/services/api"
import type { Report } from "@/types/report.types"

/**
 * Relatórios (LumiTrack Home v2.dc.html, view `reports`) — emissão sob
 * demanda de um relatório em PDF ou CSV. Depois de gerar, o arquivo é
 * oferecido para download.
 */
export const ReportsPage = () => {
    const treeQuery = usePropertyTree()
    const generate = useGenerateReport()
    const download = useDownloadReport()

    const groups = useMemo(
        () => (treeQuery.data ? buildCompareTargetGroups(treeQuery.data) : []),
        [treeQuery.data],
    )

    const handleDownload = (report: Pick<Report, "id" | "fileName">) =>
        download.mutate(report, {
            onSuccess: ({ fileName, blob }) => downloadFile(fileName, blob.type, blob),
            onError: (error) =>
                toast.error("Não foi possível baixar o relatório", {
                    description: extractErrorMessage(error),
                }),
        })

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
                title="Nada para reportar ainda"
                description="Cadastre uma propriedade, com seu medidor, para gerar relatórios."
                action={
                    <Link to="/configuracoes/cadastro" className="btn btn-primary">
                        Ir para o cadastro
                    </Link>
                }
            />
        )
    }

    return (
        <div className="flex flex-col gap-[clamp(20px,2.4vw,28px)]">
            <Blueprint className="max-w-xl p-0">
                <div className="border-divider border-b px-5 py-4">
                    <span className="font-heading text-17 font-semibold uppercase">
                        Gerar relatório agora
                    </span>
                    <span className="text-muted mt-0.5 block text-xs">
                        Escolha o escopo, o tipo, o período e o formato do arquivo.
                    </span>
                </div>
                <ReportEmissionForm
                    groups={groups}
                    onSubmit={(input) =>
                        generate.mutate(input, {
                            onError: (error) =>
                                toast.error("Não foi possível gerar o relatório", {
                                    description: extractErrorMessage(error),
                                }),
                        })
                    }
                    isSubmitting={generate.isPending}
                />
            </Blueprint>

            {generate.data && (
                <Blueprint
                    className="flex max-w-xl flex-wrap items-center justify-between gap-3 p-4"
                    data-testid="report-generated"
                >
                    <div className="min-w-0">
                        <span className="block text-sm font-semibold">Relatório gerado</span>
                        <span className="text-muted block truncate text-xs">
                            {generate.data.fileName}
                        </span>
                    </div>
                    <Button
                        type="button"
                        variant="secondary"
                        isLoading={download.isPending}
                        onClick={() => handleDownload(generate.data)}
                    >
                        Baixar
                    </Button>
                </Blueprint>
            )}
        </div>
    )
}
