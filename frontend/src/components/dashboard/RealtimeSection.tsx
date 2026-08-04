import { useState } from "react"
import { Link } from "react-router"
import { AlertCircle, Radio } from "lucide-react"
import { useMeterByTarget } from "@/hooks/queries/useMeters"
import { useLiveMeterReading } from "@/hooks/useLiveMeterReading"
import { usePowerHistory } from "@/hooks/usePowerHistory"
import { EmptyState } from "@/components/ui/EmptyState"
import { Button } from "@/components/ui/Button"
import { DashboardKpiRow } from "@/components/dashboard/DashboardKpiRow"
import { TariffFlagListCard } from "@/components/dashboard/TariffFlagListCard"
import {
    RealtimeWindowToggle,
    type RealtimeWindow,
} from "@/components/dashboard/RealtimeWindowToggle"
import { RealtimePowerChart } from "@/components/dashboard/RealtimePowerChart"

interface RealtimeSectionProps {
    propertyId: string
    propertyName: string
}

const WINDOW_LABELS: Record<RealtimeWindow, string> = {
    "1h": "última hora",
    "24h": "24 horas",
}

/**
 * Bloco `isDashboard` do handoff — KPIs de topo (#116/#117), gráfico
 * "Consumo em tempo real" (#116) e card "Bandeiras tarifárias" (#117) da
 * propriedade ativa.
 *
 * Usa só o medidor vinculado DIRETAMENTE à propriedade (não soma
 * Área/Dispositivo) — mesmo padrão já usado em `PropertyDetailsPage`, evita
 * a dupla contagem que o backend também evita deliberadamente em
 * `/api/consumption` (ver comentário em `consumption.service.ts`). Como
 * "Consumo hoje"/"Custo projetado" (#117) usam o mesmo `/api/consumption`
 * do medidor direto, a seção inteira continua atrás do mesmo gate de
 * "propriedade tem medidor próprio" — inclusive "Bandeira vigente", que é
 * dado global e não dependeria disso, mas fica junto por coerência visual
 * (evita um dashboard parcialmente populado).
 */
export const RealtimeSection = ({ propertyId, propertyName }: RealtimeSectionProps) => {
    const meterQuery = useMeterByTarget("PROPERTY", propertyId)
    const meter = meterQuery.data
    const { reading, isStale } = useLiveMeterReading(meter?.id)
    const history = usePowerHistory(reading)
    const [timeWindow, setTimeWindow] = useState<RealtimeWindow>("1h")

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

    return (
        <div className="flex flex-col gap-4">
            <DashboardKpiRow propertyId={propertyId} reading={reading} isStale={isStale} />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
                <div className="blueprint p-0">
                    <i className="corner tl" />
                    <i className="corner tr" />
                    <i className="corner bl" />
                    <i className="corner br" />
                    <div className="border-divider flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
                        <div>
                            <span className="font-heading text-[17px] font-semibold uppercase">
                                Consumo em tempo real
                            </span>
                            <span className="text-muted mt-0.5 block text-xs">
                                {propertyName} · {WINDOW_LABELS[timeWindow]}
                            </span>
                        </div>
                        <div className="flex items-center gap-3.5">
                            <RealtimeWindowToggle value={timeWindow} onChange={setTimeWindow} />
                            <span className="font-heading inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[.07em] text-[#3f8f52] uppercase">
                                <span
                                    className="h-2 w-2 rounded-full bg-[#3f8f52]"
                                    style={{ animation: "lt-pulse 1.6s ease-in-out infinite" }}
                                    aria-hidden="true"
                                />
                                Ao vivo
                            </span>
                        </div>
                    </div>
                    <div className="p-4">
                        <RealtimePowerChart history={history} timeWindow={timeWindow} />
                    </div>
                </div>

                <TariffFlagListCard />
            </div>
        </div>
    )
}
