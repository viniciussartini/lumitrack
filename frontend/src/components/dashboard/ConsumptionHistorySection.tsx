import { useState } from "react"
import { AlertCircle, LineChart } from "lucide-react"
import { EmptyState } from "@/components/ui/EmptyState"
import { HistoryRangeToggle, type HistoryRange } from "@/components/dashboard/HistoryRangeToggle"
import { ConsumptionChart } from "@/components/consumption/ConsumptionChart"
import { useConsumption } from "@/hooks/queries/useConsumption"
import { useMeterByTarget } from "@/hooks/queries/useMeters"
import { resolveMonthlyHistoryWindow } from "@/lib/consumptionWindow"

interface ConsumptionHistorySectionProps {
    propertyId: string
    propertyName: string
}

// Teto do backend (`paginationQuerySchema`, pageSize máx. 31) — cobre o
// pior caso de "todos os dias de um mês de 31 dias".
const MONTHLY_HISTORY_PAGE_SIZE = 31

/**
 * "Histórico de consumo" — bloco `isDashboard` do handoff (seção HISTORY),
 * gráfico com toggle **Mensal** (padrão) / 6 meses / 12 meses, sem
 * tabela/paginação (o handoff só tem o chart).
 *
 * "Mensal" muda de grandeza, não só de intervalo: em vez de "os últimos N
 * buckets de mês" (sem janela, ordem `desc` do backend), pede o consumo
 * **por dia** dentro do mês corrente, do dia 1 até ontem — janela explícita
 * (`resolveMonthlyHistoryWindow`), ordem `asc`. O dia de hoje fica de fora
 * de propósito: está incompleto, e uma barra baixa só por o dia mal ter
 * começado distorceria a leitura do gráfico.
 *
 * Gate de medidor PRÓPRIO — mesmo padrão independente de `ConsumptionSection`
 * (`useMeterByTarget` → `hasMeter` → só então dispara `useConsumption`), não
 * o de `RealtimeSection`. É redundante mostrar "sem medidor" 2x na mesma
 * página quando a propriedade selecionada não tem medidor, mas é a mesma
 * convenção já em produção em `PropertyDetailsPage` (MeterSection +
 * ConsumptionSection, cada um com seu próprio aviso) — não uma
 * inconsistência nova.
 */
export const ConsumptionHistorySection = ({
    propertyId,
    propertyName,
}: ConsumptionHistorySectionProps) => {
    const [range, setRange] = useState<HistoryRange>("month")
    const isMonthly = range === "month"

    const meterQuery = useMeterByTarget("PROPERTY", propertyId)
    const hasMeter = Boolean(meterQuery.data)

    // Sem `useMemo`: cálculo trivial (aritmética de Date), e recalcular a
    // cada render mantém o "hoje" sempre correto — inclusive se o painel
    // ficar aberto passando da meia-noite.
    const monthlyWindow = resolveMonthlyHistoryWindow()

    const query = useConsumption(
        "PROPERTY",
        hasMeter ? propertyId : undefined,
        range === "month" ? "day" : "month",
        1,
        range === "month" ? MONTHLY_HISTORY_PAGE_SIZE : range,
        range === "month"
            ? { from: monthlyWindow.from, to: monthlyWindow.to, order: "asc" }
            : undefined,
    )

    // Sem janela (6/12 meses): o backend devolve os mais recentes primeiro,
    // invertido aqui pro gráfico ler em ordem cronológica. Com janela
    // (Mensal): já pedimos `order: "asc"`, sem precisar inverter.
    const buckets = isMonthly ? (query.data?.items ?? []) : [...(query.data?.items ?? [])].reverse()

    return (
        <div className="blueprint p-0" data-testid="consumption-history-section">
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />

            <div className="border-divider flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
                <div>
                    <span className="font-heading text-17 font-semibold uppercase">
                        Histórico de consumo
                    </span>
                    <span className="text-muted text-12-5 mt-[3px] block">
                        {propertyName} · consumo {isMonthly ? "diário do mês corrente" : "mensal"}{" "}
                        (kWh)
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
                        <AlertCircle
                            className="text-status-danger h-5 w-5 shrink-0"
                            aria-hidden="true"
                        />
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
                        bucketSize={isMonthly ? "day" : "month"}
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
