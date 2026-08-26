import { useState } from "react"
import { ComparisonBars } from "@/components/consumption/ComparisonBars"
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
    const [unit, setUnit] = useState<"kwh" | "reais">("kwh")

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
        <div className="blueprint p-0" data-testid="property-comparison-section">
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />

            <div className="border-divider flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
                <div>
                    <span className="font-heading text-[17px] font-semibold uppercase">
                        Comparação entre propriedades
                    </span>
                    <span className="text-muted mt-[3px] block text-[12.5px]">
                        Consumo do mês por unidade ({unit === "kwh" ? "kWh" : "R$"})
                    </span>
                </div>
                <div role="group" aria-label="Unidade de comparação" className="flex gap-1.5">
                    <button
                        type="button"
                        className="lt-selbtn"
                        data-on={unit === "kwh"}
                        aria-pressed={unit === "kwh"}
                        onClick={() => setUnit("kwh")}
                    >
                        kWh
                    </button>
                    <button
                        type="button"
                        className="lt-selbtn"
                        data-on={unit === "reais"}
                        aria-pressed={unit === "reais"}
                        onClick={() => setUnit("reais")}
                    >
                        R$
                    </button>
                </div>
            </div>

            <div className="px-5 pt-2 pb-5">
                <ComparisonBars rows={comparisonRows} unit={unit} />
            </div>
        </div>
    )
}
