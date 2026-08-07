import { useState } from "react"
import { useQueries } from "@tanstack/react-query"
import { ComparisonBars } from "@/components/consumption/ComparisonBars"
import { consumptionService } from "@/services/consumption.service"
import { queryKeys } from "@/lib/queryClient"
import type { ConsumptionBucket } from "@/types/consumption.types"
import type { Property } from "@/types/property.types"

interface PropertyComparisonSectionProps {
    properties: Property[]
}

/**
 * "Comparação entre propriedades" — bloco `isDashboard` do handoff (seção
 * COMPARISON). Réplica do padrão de comparação de áreas em
 * `AreasSection` (PropertyDetailsPage.tsx): `useQueries` (uma por
 * propriedade, não N `useConsumption` em loop — violaria Regras dos Hooks),
 * bucket do mês corrente, 404 (sem medidor) vira `null` silenciosamente —
 * nunca erro, a propriedade só fica de fora da comparação.
 *
 * Independente da propriedade selecionada no seletor — compara TODAS
 * as propriedades do usuário, já carregadas em `DashboardPage` (sem
 * re-fetch). O card inteiro some quando não há nenhuma linha pra comparar
 * (0 ou 1 propriedade com dado) — resolve sozinho o critério de aceite
 * "funciona com 1 propriedade sem quebrar".
 */
export const PropertyComparisonSection = ({ properties }: PropertyComparisonSectionProps) => {
    const [unit, setUnit] = useState<"kwh" | "reais">("kwh")

    // pageSize 3 (não 1) — mesmo valor de AreasSection, deliberadamente
    // diferente do pageSize 1 que `DashboardKpiRow` usa pra granularidade
    // month da propriedade selecionada. Mesmo `targetId`/`granularity`, se o
    // pageSize também colidisse a queryKey seria idêntica à do KPI, mas com
    // queryFn de formato diferente (aqui devolve só o bucket, lá o envelope
    // paginado inteiro) — o cache compartilhado serviria o formato errado
    // pro outro consumidor. items[0] já é o mais recente (backend ordena
    // DESC), pageSize maior só evita a colisão.
    const consumptionQueries = useQueries({
        queries: properties.map((property) => ({
            queryKey: queryKeys.consumption.list("PROPERTY", property.id, "month", 1, 3),
            queryFn: async (): Promise<ConsumptionBucket | null> => {
                try {
                    const res = await consumptionService.list({
                        targetType: "PROPERTY",
                        targetId: property.id,
                        granularity: "month",
                        page: 1,
                        pageSize: 3,
                    })
                    return res.items[0] ?? null
                } catch {
                    return null
                }
            },
        })),
    })

    const comparisonRows = properties
        .map((property, i) => ({
            id: property.id,
            label: property.name,
            bucket: consumptionQueries[i]?.data,
        }))
        .filter(
            (row): row is { id: string; label: string; bucket: ConsumptionBucket } =>
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
