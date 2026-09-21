import type { ReactNode } from "react"
import { AlertCircle } from "lucide-react"
import { Blueprint } from "@/components/ui/Blueprint"
import { ComparisonCard } from "@/components/consumption/ComparisonCard"
import type { ComparisonRow } from "@/components/consumption/ComparisonBars"
import { useAreas } from "@/hooks/queries/useAreas"
import { useConsumptionSummary } from "@/hooks/queries/useConsumption"

// Teto do backend por página e, ao mesmo tempo, dentro do limite de ids do
// resumo de consumo — todas as áreas de uma propriedade cabem numa página.
const AREAS_PAGE_SIZE = 31

const COMPARISON_TITLE = "Comparação de áreas"

const ComparisonMessage = ({ children, isError }: { children: ReactNode; isError?: boolean }) => (
    <Blueprint className="p-0">
        <div className="border-divider border-b px-5 py-4">
            <span className="font-heading text-17 font-semibold uppercase">{COMPARISON_TITLE}</span>
        </div>
        <p
            role={isError ? "alert" : undefined}
            className={
                isError
                    ? "text-status-danger m-0 flex items-center gap-2 px-5 py-4 text-sm"
                    : "text-muted m-0 px-5 py-4 text-sm"
            }
        >
            {isError && <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />}
            {children}
        </p>
    </Blueprint>
)

interface AreaComparisonProps {
    propertyId: string
}

/**
 * "Comparação de áreas" da propriedade — consumo do mês de cada área numa
 * única chamada ao resumo. Só entram as áreas com medidor (o resumo omite as
 * demais); sem nenhuma, o cartão explica por quê em vez de sumir.
 */
export const AreaComparison = ({ propertyId }: AreaComparisonProps) => {
    const areasQuery = useAreas(propertyId, 1, AREAS_PAGE_SIZE)
    const areas = areasQuery.data?.items ?? []
    const summaryQuery = useConsumptionSummary(
        "AREA",
        areas.map((area) => area.id),
        "month",
    )

    if (areasQuery.isError || summaryQuery.isError) {
        return (
            <ComparisonMessage isError>
                Não foi possível carregar a comparação de áreas.
            </ComparisonMessage>
        )
    }
    if (areasQuery.isLoading || summaryQuery.isLoading) {
        return (
            <Blueprint className="p-0" aria-busy="true">
                <p role="status" className="text-muted m-0 animate-pulse px-5 py-6 text-sm">
                    Carregando comparação de áreas…
                </p>
            </Blueprint>
        )
    }
    if (areas.length === 0) {
        return (
            <ComparisonMessage>
                Cadastre áreas para comparar o consumo entre elas.
            </ComparisonMessage>
        )
    }

    const bucketById = new Map((summaryQuery.data?.items ?? []).map((item) => [item.id, item]))
    const rows = areas.flatMap((area): ComparisonRow[] => {
        const bucket = bucketById.get(area.id)
        return bucket ? [{ id: area.id, label: area.name, bucket }] : []
    })
    if (rows.length === 0) {
        return <ComparisonMessage>Nenhuma área desta propriedade tem medidor.</ComparisonMessage>
    }

    return (
        <ComparisonCard
            title={COMPARISON_TITLE}
            subtitle="Consumo por área neste mês"
            rows={rows}
            testId="area-comparison"
        />
    )
}
