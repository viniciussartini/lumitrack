import { useMemo, useState } from "react"
import axios from "axios"
import { Link } from "react-router"
import { History } from "lucide-react"
import { PeriodComparisonChartCard } from "@/components/history/PeriodComparisonChartCard"
import { PeriodComparisonDifferences } from "@/components/history/PeriodComparisonDifferences"
import { PeriodComparisonForm } from "@/components/history/PeriodComparisonForm"
import { Blueprint } from "@/components/ui/Blueprint"
import { EmptyState } from "@/components/ui/EmptyState"
import { useMeterReadingComparePeriods } from "@/hooks/queries/useMeterReadingComparePeriods"
import { usePropertyTree } from "@/hooks/queries/usePropertyTree"
import { buildCompareTargetGroups, type PeriodComparisonRun } from "@/lib/periodComparison"

/**
 * Histórico e comparações (LumiTrack Home v2.dc.html, view `hist`) —
 * escolhe alvo, grandeza e dois períodos para comparar.
 *
 * `run` só existe depois do primeiro "Criar comparação"; antes disso a área
 * de resultados mostra o texto de espera, no mesmo padrão da análise das
 * grandezas. Cada submissão troca o `run` por um objeto novo, o que o
 * TanStack Query trata como uma consulta distinta.
 */
export const HistoryPage = () => {
    const treeQuery = usePropertyTree()
    const [run, setRun] = useState<PeriodComparisonRun | undefined>(undefined)
    const comparisonQuery = useMeterReadingComparePeriods(run)

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
                icon={History}
                title="Nada para comparar ainda"
                description="Cadastre uma propriedade, com seu medidor, para comparar períodos."
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
            <Blueprint className="p-0">
                <div className="border-divider border-b px-5 py-4">
                    <span className="font-heading text-17 font-semibold uppercase">
                        Nova comparação
                    </span>
                    <span className="text-muted mt-0.5 block text-xs">
                        Escolha o alvo, a grandeza medida e os dois períodos que deseja comparar.
                    </span>
                </div>
                <PeriodComparisonForm
                    groups={groups}
                    onSubmit={setRun}
                    isSubmitting={comparisonQuery.isFetching}
                />
            </Blueprint>

            <ComparisonResults run={run} query={comparisonQuery} />
        </div>
    )
}

interface ComparisonResultsProps {
    run: PeriodComparisonRun | undefined
    query: ReturnType<typeof useMeterReadingComparePeriods>
}

const ComparisonResults = ({ run, query }: ComparisonResultsProps) => {
    if (run === undefined) {
        return (
            <p data-testid="history-idle" className="text-muted p-10 text-center text-sm">
                Defina os parâmetros e clique em Criar comparação.
            </p>
        )
    }
    if (query.isPending) {
        return (
            <p role="status" className="text-muted p-10 text-center text-sm">
                Carregando...
            </p>
        )
    }
    if (query.isError) {
        return (
            <p role="alert" className="text-status-danger p-10 text-center text-sm">
                {axios.isAxiosError(query.error) && query.error.response?.status === 404
                    ? "Este alvo não tem medidor vinculado."
                    : "Não foi possível carregar a comparação."}
            </p>
        )
    }
    return (
        <>
            <PeriodComparisonDifferences run={run} data={query.data} />
            <PeriodComparisonChartCard run={run} data={query.data} />
        </>
    )
}
