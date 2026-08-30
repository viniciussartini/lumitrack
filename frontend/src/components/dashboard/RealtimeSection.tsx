import { Link } from "react-router"
import { AlertCircle, Radio } from "lucide-react"
import { useMeterByTarget } from "@/hooks/queries/useMeters"
import { useLiveMeterReading } from "@/hooks/useLiveMeterReading"
import { EmptyState } from "@/components/ui/EmptyState"
import { Button } from "@/components/ui/Button"
import { DashboardKpiRow } from "@/components/dashboard/DashboardKpiRow"
import { TariffFlagListCard } from "@/components/dashboard/TariffFlagListCard"
import { RealtimeChartCard } from "@/components/realtime/RealtimeChartCard"

interface RealtimeSectionProps {
    propertyId: string
    propertyName: string
}

/**
 * Bloco `isDashboard` do handoff — KPIs de topo, gráfico
 * "Consumo em tempo real" e card "Bandeiras tarifárias" da
 * propriedade ativa.
 *
 * Usa só o medidor vinculado DIRETAMENTE à propriedade (não soma
 * Área/Dispositivo) — mesmo padrão já usado em `PropertyDetailsPage`, evita
 * a dupla contagem que o backend também evita deliberadamente em
 * `/api/consumption` (ver comentário em `consumption.service.ts`). Como
 * "Consumo hoje"/"Custo projetado" usam o mesmo `/api/consumption`
 * do medidor direto, a seção inteira continua atrás do mesmo gate de
 * "propriedade tem medidor próprio" — inclusive "Bandeira vigente", que é
 * dado global e não dependeria disso, mas fica junto por coerência visual
 * (evita um dashboard parcialmente populado).
 */
export const RealtimeSection = ({ propertyId, propertyName }: RealtimeSectionProps) => {
    const meterQuery = useMeterByTarget("PROPERTY", propertyId)
    const meter = meterQuery.data
    const liveReading = useLiveMeterReading("PROPERTY", propertyId, meter?.id)

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
            <div role="alert" className="border-status-danger/40 flex items-start gap-3 border p-4">
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
            <DashboardKpiRow propertyId={propertyId} {...liveReading} />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
                <RealtimeChartCard
                    targetType="PROPERTY"
                    targetId={propertyId}
                    meterId={meter.id}
                    title="Consumo em tempo real"
                    subtitle={propertyName}
                />

                <TariffFlagListCard />
            </div>
        </div>
    )
}
