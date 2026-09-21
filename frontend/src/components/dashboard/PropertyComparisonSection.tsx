import { ComparisonCard } from "@/components/consumption/ComparisonCard"
import { useConsumptionSummary } from "@/hooks/queries/useConsumption"
import type { ConsumptionSummaryItem } from "@/types/consumption.types"
import type { Property } from "@/types/property.types"

interface PropertyComparisonSectionProps {
    properties: Property[]
}

/**
 * "Comparação entre propriedades" — bloco `isDashboard` do handoff (seção
 * COMPARISON). Consumo do mês de todas as propriedades resolvido numa única
 * chamada via `useConsumptionSummary` — substitui o `useQueries` de N
 * chamadas, uma por propriedade. Propriedade sem medidor/sem leitura
 * simplesmente não aparece no resultado — nunca é erro, só fica de fora da
 * comparação.
 *
 * Independente da propriedade selecionada no seletor — compara TODAS
 * as propriedades do usuário, já carregadas em `DashboardPage` (sem
 * re-fetch). O card inteiro some quando não há nenhuma linha pra comparar
 * (0 ou 1 propriedade com dado) — resolve sozinho o critério de aceite
 * "funciona com 1 propriedade sem quebrar".
 */
export const PropertyComparisonSection = ({ properties }: PropertyComparisonSectionProps) => {
    const summaryQuery = useConsumptionSummary(
        "PROPERTY",
        properties.map((p) => p.id),
        "month",
    )
    const bucketById = new Map((summaryQuery.data?.items ?? []).map((item) => [item.id, item]))

    const comparisonRows = properties
        .map((property) => ({
            id: property.id,
            label: property.name,
            bucket: bucketById.get(property.id),
        }))
        .filter(
            (row): row is { id: string; label: string; bucket: ConsumptionSummaryItem } =>
                row.bucket != null,
        )

    if (comparisonRows.length === 0) return null

    return (
        <ComparisonCard
            title="Comparação entre propriedades"
            subtitle="Consumo do mês por unidade"
            rows={comparisonRows}
            testId="property-comparison-section"
        />
    )
}
