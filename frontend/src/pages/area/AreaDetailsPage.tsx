import { useState } from "react"
import { Link, useParams } from "react-router"
import { AlertCircle, LayoutGrid, Pencil } from "lucide-react"
import { useArea } from "@/hooks/queries/useAreas"
import { useProperty } from "@/hooks/queries/useProperties"
import { useMeterByTarget } from "@/hooks/queries/useMeters"
import { useLiveMeterReading } from "@/hooks/useLiveMeterReading"
import { useTargetConsumptionKpis } from "@/hooks/useTargetConsumptionKpis"
import { Button } from "@/components/ui/Button"
import { Tag } from "@/components/ui/Tag"
import { AreaFormDialog } from "@/components/area/AreaFormDialog"
import { DeviceComparison } from "@/components/device/DeviceComparison"
import { AreaConsumptionSection } from "@/components/consumption/ConsumptionSection"
import { TargetKpiCards } from "@/components/consumption/TargetKpiCards"
import { MeterSection } from "@/components/meter/MeterSection"
import { IconCircle } from "@/components/ui/IconCircle"
import { LiveKpiCard } from "@/components/dashboard/LiveKpiCard"
import { RealtimeChartCard } from "@/components/realtime/RealtimeChartCard"
import { formatPowerKw } from "@/lib/format"
import { formatKwh } from "@/lib/formatters/consumption"
import type { Area } from "@/types/area.types"
import type { Property } from "@/types/property.types"

/**
 * Detalhe da área na Análise — LumiTrack Home v2.dc.html, `areaDetailView`.
 * Vive à direita da árvore de seleção (`AnalysisLayout`).
 *
 * Estrutura:
 *   1. Card de dados (nome, descrição, propriedade pai, kWh/mês da própria
 *      área) com "Editar área" e, ao lado, o card do Medidor
 *   2. Com medidor: consumo em tempo real ao lado dos KPIs "Potência agora",
 *      "Consumo hoje" e "Custo do mês"
 *   3. Comparação de dispositivos
 *   4. Histórico de consumo (fora do protótipo, abaixo dos blocos dele)
 *
 * O consumo da área é o do medidor da própria área, nunca a soma dos
 * dispositivos — não existe agregação hierárquica. Criar e excluir a área
 * vivem em Configurações → Cadastro; aqui só se edita.
 */
export const AreaDetailsPage = () => {
    const { propertyId, areaId } = useParams<{
        propertyId: string
        areaId: string
    }>()

    const areaQuery = useArea(propertyId, areaId)
    const propertyQuery = useProperty(propertyId)
    const meterQuery = useMeterByTarget("AREA", areaId)
    const meter = meterQuery.data
    // Sem medidor não há o que consultar: o resumo omitiria o item.
    const kpis = useTargetConsumptionKpis("AREA", meter ? areaId : undefined)
    const { lastKnownPowerW } = useLiveMeterReading("AREA", areaId, meter?.id)

    if (areaQuery.isLoading) return <DetailsSkeleton />

    if (areaQuery.isError || !areaQuery.data) {
        return (
            <ErrorState
                propertyId={propertyId}
                message={
                    areaQuery.error instanceof Error
                        ? areaQuery.error.message
                        : "Área não encontrada"
                }
            />
        )
    }

    const area = areaQuery.data
    const property = propertyQuery.data

    return (
        <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 items-start gap-[clamp(14px,1.6vw,20px)] xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <AreaHeaderCard
                    area={area}
                    property={property}
                    isPropertyLoading={propertyQuery.isLoading}
                    monthKwh={kpis.month?.kwh ?? null}
                />
                <MeterSection targetType="AREA" targetId={area.id} />
            </div>

            {meter && (
                <div className="grid grid-cols-1 items-stretch gap-[clamp(14px,1.6vw,20px)] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <RealtimeChartCard
                        targetType="AREA"
                        targetId={area.id}
                        meterId={meter.id}
                        title="Consumo em tempo real"
                        subtitle={area.name}
                    />
                    <div className="flex flex-col gap-[clamp(12px,1.4vw,16px)]">
                        <LiveKpiCard
                            label="Potência agora"
                            value={
                                lastKnownPowerW !== undefined ? (
                                    formatPowerKw(lastKnownPowerW)
                                ) : (
                                    <span className="text-muted">—</span>
                                )
                            }
                            isLive
                        />
                        <TargetKpiCards kpis={kpis} />
                    </div>
                </div>
            )}

            <DeviceComparison propertyId={area.propertyId} areaId={area.id} />

            <AreaConsumptionSection
                propertyId={area.propertyId}
                areaId={area.id}
                {...resolvePropertyTariffFields(property)}
            />
        </div>
    )
}

/**
 * Campos de grupo tarifário da propriedade pai, para `AreaConsumptionSection`
 * decidir o ramo de renderização — extraído do componente principal só pra
 * não empurrar sua complexidade acima do teto do lint.
 */
const resolvePropertyTariffFields = (property: Property | undefined) => ({
    tariffGroup: property?.tariffGroup,
    groupBModality: property?.groupBModality,
})

interface AreaHeaderCardProps {
    area: Area
    property: Property | undefined
    isPropertyLoading: boolean
    /** Consumo do mês corrente da própria área; `null` sem leitura. */
    monthKwh: number | null
}

const AreaHeaderCard = ({ area, property, isPropertyLoading, monthKwh }: AreaHeaderCardProps) => {
    const [isEditOpen, setIsEditOpen] = useState(false)

    return (
        <div className="blueprint p-26px">
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />

            <div className="gap-15px flex min-w-0 items-start">
                <IconCircle icon={LayoutGrid} tone="accent" strokeWidth={1.5} />
                <div className="min-w-0 flex-1">
                    <h2 className="font-heading truncate text-[clamp(24px,2.6vw,32px)] leading-none font-semibold uppercase">
                        {area.name}
                    </h2>
                    {area.description && (
                        <p className="text-muted mt-2 text-sm">{area.description}</p>
                    )}
                </div>
            </div>

            <div className="mt-18px gap-9px flex flex-wrap">
                <PropertyTag property={property} isLoading={isPropertyLoading} />
                {monthKwh !== null && <Tag variant="neutral">{formatKwh(monthKwh)} kWh/mês</Tag>}
            </div>

            <div className="mt-22px flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setIsEditOpen(true)}>
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    Editar área
                </Button>
            </div>

            <AreaFormDialog
                isOpen={isEditOpen}
                onClose={() => setIsEditOpen(false)}
                mode={{ kind: "edit", propertyId: area.propertyId, area }}
            />
        </div>
    )
}

interface PropertyTagProps {
    property: Property | undefined
    isLoading: boolean
}

/**
 * Tag da propriedade pai. Três estados:
 *   - loading: placeholder animado
 *   - sem property (erro silencioso): "Propriedade não disponível"
 *   - property carregada: nome, em Tag accent
 */
const PropertyTag = ({ property, isLoading }: PropertyTagProps) => {
    if (isLoading) {
        return (
            <div
                className="bg-divider h-6 w-24 animate-pulse"
                aria-busy="true"
                aria-label="Carregando propriedade"
            />
        )
    }

    if (!property) {
        return <span className="text-muted text-sm italic">Propriedade não disponível</span>
    }

    return (
        <Tag variant="accent" className="font-semibold">
            {property.name}
        </Tag>
    )
}

const DetailsSkeleton = () => (
    <div className="blueprint h-72 p-6" aria-busy="true" aria-label="Carregando dados da área">
        <div className="bg-divider h-8 w-1/3 animate-pulse" />
        <div className="bg-divider mt-4 h-4 w-1/2 animate-pulse" />
    </div>
)

interface ErrorStateProps {
    propertyId: string | undefined
    message: string
}

const ErrorState = ({ propertyId, message }: ErrorStateProps) => (
    <div
        role="alert"
        className="border-status-danger/40 flex flex-col items-center justify-center gap-4 border py-12 text-center"
    >
        <AlertCircle className="text-status-danger h-8 w-8" aria-hidden="true" />
        <div>
            <h3 className="font-heading text-status-danger font-semibold uppercase">
                Não foi possível carregar
            </h3>
            <p className="text-status-danger/85 mt-1 text-sm">{message}</p>
        </div>
        <Button asChild variant="secondary">
            <Link to={propertyId ? `/propriedades/${propertyId}` : "/propriedades"}>
                Voltar para a propriedade
            </Link>
        </Button>
    </div>
)
