import { LiveKpiCard } from "@/components/dashboard/LiveKpiCard"
import { formatBrl } from "@/lib/format"
import { formatKwh } from "@/lib/formatters/consumption"
import type { TargetConsumptionKpis } from "@/hooks/useTargetConsumptionKpis"

interface TargetKpiCardsProps {
    kpis: TargetConsumptionKpis
}

const LoadingValue = () => (
    <span
        role="status"
        aria-label="Carregando"
        className="bg-divider inline-block h-7 w-24 animate-pulse"
    />
)

/**
 * KPIs "Consumo hoje" e "Custo do mês" do detalhe de Área e Dispositivo —
 * dado real do resumo de consumo. Enquanto o resumo carrega mostram um
 * placeholder; sem leitura ainda, "—"; com o custo não calculável (Grupo A e
 * Tarifa Branca) o custo também é "—", explicado, e nunca zero.
 */
export const TargetKpiCards = ({ kpis }: TargetKpiCardsProps) => {
    const { isLoading, todayKwh, month } = kpis
    const isCostUnavailable = month !== null && month.costBrl === null

    return (
        <>
            <LiveKpiCard
                label="Consumo hoje"
                value={
                    isLoading ? (
                        <LoadingValue />
                    ) : todayKwh === null ? (
                        "—"
                    ) : (
                        <>
                            {formatKwh(todayKwh)}
                            <span className="text-14 text-muted ml-1 font-normal">kWh</span>
                        </>
                    )
                }
            />
            <LiveKpiCard
                label="Custo do mês"
                value={
                    isLoading ? (
                        <LoadingValue />
                    ) : month?.costBrl == null ? (
                        "—"
                    ) : (
                        formatBrl(month.costBrl)
                    )
                }
                {...(isCostUnavailable && { subValue: "Custo indisponível para esta tarifa." })}
            />
        </>
    )
}
