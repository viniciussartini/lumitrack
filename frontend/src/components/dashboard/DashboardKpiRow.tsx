import { useState } from "react"
import { useConsumption } from "@/hooks/queries/useConsumption"
import { useTariffFlag } from "@/hooks/queries/useTariffFlag"
import { LiveKpiCard } from "@/components/dashboard/LiveKpiCard"
import { formatBrl, formatPowerKw } from "@/lib/format"
import { formatKwh } from "@/lib/formatters/consumption"
import {
    computeMonthProjection,
    computeTodayDelta,
    daysInMonth,
    findBucketForDate,
    findBucketForMonth,
} from "@/lib/dashboardKpis"
import {
    TARIFF_FLAG_LABELS,
    TARIFF_FLAG_TEXT_CLASS,
    tariffFlagPer100Kwh,
} from "@/types/tariff-flag.types"
import type { ConsumptionBucket } from "@/types/consumption.types"
import type { ReadingPayload } from "@/lib/sse/appStream"

interface DashboardKpiRowProps {
    propertyId: string
    reading: ReadingPayload | undefined
    isStale: boolean
    /** Potência mais recente conhecida (SSE fresco ou fallback REST) — só
     * para o valor exibido; `isLive`/custo estimado continuam exigindo SSE
     * fresco de verdade (ver `reading`/`isStale`). */
    lastKnownPowerW: number | undefined
}

const signedPercentFormatter = new Intl.NumberFormat("pt-BR", {
    style: "percent",
    signDisplay: "always",
    maximumFractionDigits: 0,
})

/**
 * Grade de 4 KPIs do Painel — bloco `isDashboard` do handoff (linhas 159-186):
 * Potência agora (+ custo estimado ao vivo, mesmo card — corrige a divisão
 * em 2 cards), Consumo hoje, Custo projetado do mês, Bandeira
 * vigente.
 */
export const DashboardKpiRow = ({
    propertyId,
    reading,
    isStale,
    lastKnownPowerW,
}: DashboardKpiRowProps) => {
    const [now] = useState(() => new Date())

    // "Potência agora" + custo estimado — mesma conta de RealtimeSection (tarifa
    // efetiva do bucket de hora mais recente com consumo, × potência atual).
    const hourQuery = useConsumption("PROPERTY", propertyId, "hour", 1, 3)
    const dayQuery = useConsumption("PROPERTY", propertyId, "day", 1, 5)
    const monthQuery = useConsumption("PROPERTY", propertyId, "month", 1, 1)
    const tariffFlagQuery = useTariffFlag()

    const currentPowerKw = !isStale && reading ? reading.powerW / 1000 : null
    const estimatedCostPerHour = computeEstimatedCostPerHour(hourQuery.data?.items, currentPowerKw)

    const todayBucket = findBucketForDate(dayQuery.data?.items ?? [], now)
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayBucket = findBucketForDate(dayQuery.data?.items ?? [], yesterday)
    const todayKwh = todayBucket?.kwhConsumed ?? 0
    const yesterdayKwh = yesterdayBucket?.kwhConsumed ?? 0
    const todayDelta = dayQuery.isSuccess ? computeTodayDelta(todayKwh, yesterdayKwh) : null

    const currentMonthBucket = findBucketForMonth(monthQuery.data?.items ?? [], now)
    const monthCostSoFar = currentMonthBucket?.costBrl ?? 0
    const totalDaysInMonth = daysInMonth(now)
    const dayOfMonth = now.getDate()
    const projectedMonthCost = monthQuery.isSuccess
        ? computeMonthProjection(monthCostSoFar, dayOfMonth, totalDaysInMonth)
        : null
    const daysToClose = totalDaysInMonth - dayOfMonth

    const tariffFlag = tariffFlagQuery.data

    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <LiveKpiCard
                label="Potência agora"
                value={lastKnownPowerW !== undefined ? formatPowerKw(lastKnownPowerW) : "—"}
                subValue={
                    estimatedCostPerHour !== null
                        ? `≈ ${formatBrl(estimatedCostPerHour)}/h estimado`
                        : "—"
                }
                isLive={currentPowerKw !== null}
            />

            <LiveKpiCard
                label="Consumo hoje"
                value={dayQuery.isSuccess ? `${formatKwh(todayKwh)}kWh` : "—"}
                subValue={
                    todayDelta !== null ? (
                        <span
                            className={
                                todayDelta > 0 ? "text-status-danger" : "text-status-success"
                            }
                        >
                            {signedPercentFormatter.format(todayDelta)} vs. ontem
                        </span>
                    ) : (
                        "—"
                    )
                }
            />

            <LiveKpiCard
                label="Custo projetado · mês"
                value={projectedMonthCost !== null ? formatBrl(projectedMonthCost) : "—"}
                subValue={monthQuery.isSuccess ? `fechamento em ${daysToClose} dias` : "—"}
            />

            <LiveKpiCard
                label="Bandeira vigente"
                value={tariffFlag ? TARIFF_FLAG_LABELS[tariffFlag.currentFlag] : "—"}
                subValue={
                    tariffFlag ? (
                        <span className={TARIFF_FLAG_TEXT_CLASS[tariffFlag.currentFlag]}>
                            {formatFlagNote(
                                tariffFlagPer100Kwh(tariffFlag, tariffFlag.currentFlag),
                            )}
                        </span>
                    ) : (
                        "—"
                    )
                }
            />
        </div>
    )
}

/** "sem acréscimo" (bandeira verde, tipicamente 0) ou "+ R$ X / 100 kWh". */
const formatFlagNote = (per100Kwh: number): string =>
    per100Kwh === 0 ? "sem acréscimo" : `+ ${formatBrl(per100Kwh)} / 100 kWh`

/**
 * Tarifa efetiva (R$/kWh) do bucket de hora mais recente com consumo real,
 * multiplicada pela potência atual. `null` quando não há leitura ao vivo ou
 * nenhum bucket com consumo ainda — nunca fabrica um número. Movido de
 * `RealtimeSection.tsx` junto com o card que consome este cálculo.
 */
const computeEstimatedCostPerHour = (
    items: ConsumptionBucket[] | undefined,
    currentPowerKw: number | null,
): number | null => {
    if (currentPowerKw === null || !items) return null

    const bucketWithConsumption = items.find((item) => item.kwhConsumed > 0)
    if (!bucketWithConsumption) return null

    const effectiveTariff = bucketWithConsumption.costBrl / bucketWithConsumption.kwhConsumed
    return effectiveTariff * currentPowerKw
}
