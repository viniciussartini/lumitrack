import { useState } from "react"
import { AlertCircle, LineChart } from "lucide-react"
import { EmptyState } from "@/components/ui/EmptyState"
import { HistoryRangeToggle, type HistoryRange } from "@/components/dashboard/HistoryRangeToggle"
import { ConsumptionChart } from "@/components/consumption/ConsumptionChart"
import { useConsumption } from "@/hooks/queries/useConsumption"
import { useMeterByTarget } from "@/hooks/queries/useMeters"

interface ConsumptionHistorySectionProps {
    propertyId: string
    propertyName: string
}

/**
 * "Histórico de consumo" — bloco `isDashboard` do handoff (seção HISTORY),
 * gráfico mensal (kWh) com toggle 6/12 meses, sem tabela/paginação (o
 * handoff só tem o chart).
 *
 * Gate de medidor PRÓPRIO — mesmo padrão independente de `ConsumptionSection`
 * (`useMeterByTarget` → `hasMeter` → só então dispara `useConsumption`), não
 * o de `RealtimeSection`. É redundante mostrar "sem medidor" 2x na mesma
 * página quando a propriedade selecionada não tem medidor, mas é a mesma
 * convenção já em produção em `PropertyDetailsPage` (MeterSection +
 * ConsumptionSection, cada um com seu próprio aviso) — não uma
 * inconsistência nova desta issue.
 */
export const ConsumptionHistorySection = ({
    propertyId,
    propertyName,
}: ConsumptionHistorySectionProps) => {
    const [range, setRange] = useState<HistoryRange>(6)

    const meterQuery = useMeterByTarget("PROPERTY", propertyId)
    const hasMeter = Boolean(meterQuery.data)

    const query = useConsumption(
        "PROPERTY",
        hasMeter ? propertyId : undefined,
        "month",
        1,
        range,
    )

    const buckets = query.data?.items ?? []

    return (
        <div className="blueprint p-0" data-testid="consumption-history-section">
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />

            <div className="border-divider flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
                <div>
                    <span className="font-heading text-[17px] font-semibold uppercase">
                        Histórico de consumo
                    </span>
                    <span className="text-muted mt-[3px] block text-[12.5px]">
                        {propertyName} · consumo mensal (kWh)
                    </span>
                </div>
                <HistoryRangeToggle value={range} onChange={setRange} />
            </div>

            <div className="px-5 py-5">
                {!meterQuery.isLoading && !hasMeter && (
                    <EmptyState
                        icon={LineChart}
                        title="Sem histórico para exibir"
                        description="Configure um medidor na propriedade para começar a acompanhar o consumo mensal."
                    />
                )}

                {hasMeter && query.isLoading && <HistorySkeleton />}

                {hasMeter && query.isError && (
                    <div
                        role="alert"
                        className="border-status-danger/40 flex items-start gap-3 border p-4"
                    >
                        <AlertCircle className="text-status-danger h-5 w-5 shrink-0" aria-hidden="true" />
                        <p className="text-status-danger/85 text-sm">
                            {query.error instanceof Error
                                ? query.error.message
                                : "Não foi possível carregar o histórico."}
                        </p>
                    </div>
                )}

                {hasMeter && query.isSuccess && (
                    <ConsumptionChart
                        buckets={buckets}
                        granularity="month"
                        isRefetching={query.isFetching}
                    />
                )}
            </div>
        </div>
    )
}

const HistorySkeleton = () => (
    <div
        className="border-divider flex flex-col gap-2 border p-2"
        aria-busy="true"
        aria-label="Carregando histórico de consumo"
        data-testid="consumption-history-skeleton"
    >
        {[0, 1, 2].map((i) => (
            <div key={i} className="bg-divider h-10 animate-pulse" />
        ))}
    </div>
)
