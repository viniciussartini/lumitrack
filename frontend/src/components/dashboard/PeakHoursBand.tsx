import { useConsumption } from "@/hooks/queries/useConsumption"
import { useDistributor } from "@/hooks/queries/useDistributors"
import { findBucketForMonth } from "@/lib/dashboardKpis"
import { formatWeightPercent } from "@/lib/areaWeight"
import { describePeakWindow, peakShareOfMonth } from "@/lib/peakHours"

interface PeakHoursBandProps {
    propertyId: string
    distributorId: string
}

/**
 * Faixa "Horário de ponta" do bloco de meta (LumiTrack Home v2.dc.html,
 * Painel), só para propriedade do Grupo A: a janela de ponta da distribuidora,
 * os dias que ficam de fora e quanto do consumo do mês caiu na ponta. A janela
 * vem da configuração da distribuidora, e a participação, do kWh por posto da
 * conta do Grupo A (a mesma da fatura), no resumo mensal que o KPI de custo já
 * pede e que compartilha o cache.
 *
 * Distribuidora sem janela configurada: a faixa some. Sem consumo no mês ou
 * sem a conta apurada: a participação é "-", nunca 0%.
 */
export const PeakHoursBand = ({ propertyId, distributorId }: PeakHoursBandProps) => {
    const distributor = useDistributor(distributorId)
    const monthQuery = useConsumption("PROPERTY", propertyId, "month", 1, 1)

    const windowText = describePeakWindow(
        distributor.data?.peakWindowStartHour ?? null,
        distributor.data?.peakWindowEndHour ?? null,
    )
    if (!windowText) return null

    const bucket = findBucketForMonth(monthQuery.data?.items ?? [], new Date())
    const share = peakShareOfMonth(bucket?.groupA)

    return (
        <div
            className="border-divider bg-chart-amber/9 flex flex-wrap items-center gap-x-5 gap-y-2.5 border-t px-5 py-3.5"
            data-testid="peak-hours-band"
        >
            <span className="font-heading text-status-warning text-10 font-semibold tracking-[.07em] uppercase">
                Horário de ponta
            </span>
            <span className="text-13">{windowText}</span>
            {!monthQuery.isLoading && (
                <span className="text-text/65 text-13" data-testid="peak-hours-share">
                    {share === null
                        ? "Consumo na ponta no mês: -"
                        : `Consumo na ponta responde por ${formatWeightPercent(share)} do acumulado do mês`}
                </span>
            )}
        </div>
    )
}
