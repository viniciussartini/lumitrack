import { useState } from "react"
import { Link } from "react-router"
import { AlertCircle, Radio } from "lucide-react"
import { useMeterByTarget } from "@/hooks/queries/useMeters"
import { useConsumption } from "@/hooks/queries/useConsumption"
import { useLiveMeterReading } from "@/hooks/useLiveMeterReading"
import { usePowerHistory } from "@/hooks/usePowerHistory"
import { EmptyState } from "@/components/ui/EmptyState"
import { Button } from "@/components/ui/Button"
import {
    RealtimeWindowToggle,
    type RealtimeWindow,
} from "@/components/dashboard/RealtimeWindowToggle"
import { RealtimePowerChart } from "@/components/dashboard/RealtimePowerChart"
import { formatBrl, formatPowerKw } from "@/lib/format"
import type { ConsumptionBucket } from "@/types/consumption.types"

interface RealtimeSectionProps {
    propertyId: string
}

/**
 * Bloco `isDashboard` do handoff — KPIs "Potência agora"/"Custo estimado" +
 * gráfico "Consumo em tempo real" da propriedade ativa (#116).
 *
 * Usa só o medidor vinculado DIRETAMENTE à propriedade (não soma
 * Área/Dispositivo) — mesmo padrão já usado em `PropertyDetailsPage`, evita
 * a dupla contagem que o backend também evita deliberadamente em
 * `/api/consumption` (ver comentário em `consumption.service.ts`).
 */
export const RealtimeSection = ({ propertyId }: RealtimeSectionProps) => {
    const meterQuery = useMeterByTarget("PROPERTY", propertyId)
    const meter = meterQuery.data
    const { reading, isStale } = useLiveMeterReading(meter?.id)
    const history = usePowerHistory(reading)
    const [timeWindow, setTimeWindow] = useState<RealtimeWindow>("1h")

    // Custo estimado — deriva uma tarifa efetiva (R$/kWh) do bucket de hora
    // mais recente com consumo real, e multiplica pela potência atual. Sem
    // bucket com consumo ainda, não inventa número (mostra "—").
    const consumptionQuery = useConsumption(
        "PROPERTY",
        meter ? propertyId : undefined,
        "hour",
        1,
        3,
    )

    if (meterQuery.isLoading) {
        return (
            <div
                className="blueprint h-40 animate-pulse"
                aria-busy="true"
                aria-label="Carregando painel em tempo real"
            />
        )
    }

    if (meterQuery.isError) {
        return (
            <div
                role="alert"
                className="border-status-danger/40 flex items-start gap-3 border p-4"
            >
                <AlertCircle className="text-status-danger h-5 w-5 shrink-0" aria-hidden="true" />
                <p className="text-status-danger/85 text-sm">
                    {meterQuery.error instanceof Error
                        ? meterQuery.error.message
                        : "Não foi possível carregar o medidor da propriedade."}
                </p>
            </div>
        )
    }

    if (!meter) {
        return (
            <EmptyState
                icon={Radio}
                title="Esta propriedade não tem medidor vinculado"
                description="Vincule um medidor diretamente à propriedade para ver a potência em tempo real no Painel."
                action={
                    <Button asChild variant="secondary">
                        <Link to={`/propriedades/${propertyId}`}>Ver propriedade</Link>
                    </Button>
                }
            />
        )
    }

    const currentPowerKw = !isStale && reading ? reading.powerW / 1000 : null
    const estimatedCostPerHour = computeEstimatedCostPerHour(
        consumptionQuery.data?.items,
        currentPowerKw,
    )

    return (
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <LiveKpiCard
                    label="Potência agora"
                    value={currentPowerKw !== null ? formatPowerKw(reading!.powerW) : "—"}
                    isLive={currentPowerKw !== null}
                />
                <LiveKpiCard
                    label="Custo estimado"
                    value={
                        estimatedCostPerHour !== null
                            ? `≈ ${formatBrl(estimatedCostPerHour)}/h`
                            : "—"
                    }
                    isLive={false}
                />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-heading text-sm font-semibold uppercase">
                    Consumo em tempo real
                </h2>
                <RealtimeWindowToggle value={timeWindow} onChange={setTimeWindow} />
            </div>

            <RealtimePowerChart history={history} timeWindow={timeWindow} />
        </div>
    )
}

interface LiveKpiCardProps {
    label: string
    value: string
    isLive: boolean
}

const LiveKpiCard = ({ label, value, isLive }: LiveKpiCardProps) => (
    <div className="blueprint px-5 py-[18px]">
        <i className="corner tl" />
        <i className="corner tr" />
        <i className="corner bl" />
        <i className="corner br" />
        <div className="font-heading flex items-center gap-2 text-[11px] font-semibold tracking-[.07em] uppercase">
            {isLive && (
                <span
                    className="h-2 w-2 rounded-full bg-[#3f8f52]"
                    style={{ animation: "lt-pulse 1.6s ease-in-out infinite" }}
                    aria-hidden="true"
                />
            )}
            {label}
        </div>
        <div className="font-heading mt-2.5 text-[30px] leading-none font-semibold font-features-['tnum'_1]">
            {value}
        </div>
    </div>
)

/**
 * Tarifa efetiva (R$/kWh) do bucket de hora mais recente com consumo real
 * (backend ordena DESC — `items[0]` é o mais novo), multiplicada pela
 * potência atual. `null` quando não há leitura ao vivo ou nenhum bucket
 * com consumo ainda — nunca fabrica um número.
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
