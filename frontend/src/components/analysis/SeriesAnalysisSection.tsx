import { useState } from "react"
import { Blueprint } from "@/components/ui/Blueprint"
import { SeriesAnalysisForm } from "@/components/analysis/SeriesAnalysisForm"
import { SeriesAnalysisResults } from "@/components/analysis/SeriesAnalysisResults"
import { useMeterReadingSeries } from "@/hooks/queries/useMeterReadingSeries"
import type { SeriesRun } from "@/lib/meterReadingSeries"
import type { TargetType } from "@/types/meter.types"

interface SeriesAnalysisSectionProps {
    targetType: TargetType
    targetId: string
    targetName: string
}

/**
 * "Análise das grandezas" (LumiTrack Home v2.dc.html, bloco `gzView` —
 * formulário `runGz`) — consome `GET /api/meter-readings/series` para
 * plotar o gráfico de linha e a tabela Mínimo/Média/Máximo da grandeza
 * escolhida. Fica abaixo dos 5 cards ao vivo de `ElectricalQuantitiesGrid`,
 * na mesma aba "Grandezas Elétricas".
 *
 * `run` só existe depois do primeiro "Gerar análise" — antes disso a
 * consulta fica desabilitada e mostra o mesmo texto do protótipo
 * ("Defina os parâmetros e clique em Gerar análise"). Cada submissão troca
 * `run` por um objeto novo, o que o TanStack Query trata como uma consulta
 * distinta (chave própria em `queryKeys.meterReadings.series`) — não um
 * refetch da anterior.
 */
export const SeriesAnalysisSection = ({
    targetType,
    targetId,
    targetName,
}: SeriesAnalysisSectionProps) => {
    const [run, setRun] = useState<SeriesRun | undefined>(undefined)
    const seriesQuery = useMeterReadingSeries(targetType, targetId, run)

    return (
        <Blueprint className="p-0">
            <div className="border-divider border-b px-5 py-4">
                <span className="font-heading text-17 font-semibold uppercase">
                    Análise das grandezas
                </span>
                <span className="text-muted mt-0.5 block text-xs">
                    {targetName} · escolha a janela e a grandeza e gere o gráfico com a tabela.
                </span>
            </div>

            <SeriesAnalysisForm onSubmit={setRun} isSubmitting={seriesQuery.isFetching} />

            {run === undefined && (
                <p
                    data-testid="series-analysis-idle"
                    className="text-muted p-10 text-center text-sm"
                >
                    Defina os parâmetros e clique em Gerar análise.
                </p>
            )}

            {run !== undefined && seriesQuery.isPending && (
                <p role="status" className="text-muted p-10 text-center text-sm">
                    Carregando...
                </p>
            )}

            {run !== undefined && seriesQuery.isError && (
                <p role="alert" className="text-status-danger p-10 text-center text-sm">
                    Não foi possível carregar a análise.
                </p>
            )}

            {run !== undefined && seriesQuery.data && (
                <SeriesAnalysisResults run={run} items={seriesQuery.data.items} />
            )}
        </Blueprint>
    )
}
