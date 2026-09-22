import { LiveKpiCard } from "@/components/dashboard/LiveKpiCard"
import { formatBrl } from "@/lib/format"
import { formatKwh } from "@/lib/formatters/consumption"
import type { TargetConsumptionKpis } from "@/hooks/useTargetConsumptionKpis"

interface TargetKpiCardsProps {
    kpis: TargetConsumptionKpis
}

/**
 * KPIs "Consumo hoje" e "Custo do mês" do detalhe de Área e Dispositivo —
 * dado real do resumo de consumo. Sem leitura ainda mostram "—"; com o custo
 * não calculável (Grupo A e Tarifa Branca) o custo também é "—", explicado,
 * e nunca zero.
 */
export const TargetKpiCards = ({ kpis }: TargetKpiCardsProps) => {
    const { todayKwh, month } = kpis
    const isCostUnavailable = month !== null && month.costBrl === null

    return (
        <>
            <LiveKpiCard
                label="Consumo hoje"
                value={
                    todayKwh === null ? (
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
                value={month?.costBrl == null ? "—" : formatBrl(month.costBrl)}
                {...(isCostUnavailable && { subValue: "Custo indisponível para esta tarifa." })}
            />
        </>
    )
}
