import { useState } from "react"
import { Link, useParams } from "react-router"
import { AlertCircle, Cpu, Pencil } from "lucide-react"
import { useDevice } from "@/hooks/queries/useDevices"
import { useArea } from "@/hooks/queries/useAreas"
import { useProperty } from "@/hooks/queries/useProperties"
import { useMeterByTarget } from "@/hooks/queries/useMeters"
import { useLiveMeterReading } from "@/hooks/useLiveMeterReading"
import { useTargetConsumptionKpis } from "@/hooks/useTargetConsumptionKpis"
import { Button } from "@/components/ui/Button"
import { Tag } from "@/components/ui/Tag"
import { DeviceFormDialog } from "@/components/device/DeviceFormDialog"
import { DeviceConsumptionSection } from "@/components/consumption/ConsumptionSection"
import { TargetKpiCards } from "@/components/consumption/TargetKpiCards"
import { MeterSection } from "@/components/meter/MeterSection"
import { IconCircle } from "@/components/ui/IconCircle"
import { LiveKpiCard } from "@/components/dashboard/LiveKpiCard"
import { RealtimeChartCard } from "@/components/realtime/RealtimeChartCard"
import { formatPowerKw } from "@/lib/format"
import type { Device } from "@/types/device.types"
import type { Area } from "@/types/area.types"
import type { Property } from "@/types/property.types"

/**
 * Detalhe do dispositivo na Análise — LumiTrack Home v2.dc.html,
 * `deviceDetailView`. Vive à direita da árvore de seleção (`AnalysisLayout`).
 * Nível folha da hierarquia: sem comparação.
 *
 * Estrutura:
 *   1. Card de dados (nome, propriedade, área, marca/modelo, potência) com
 *      "Editar dispositivo" e, ao lado, o card do Medidor
 *   2. Com medidor: consumo em tempo real ao lado dos KPIs "Potência agora",
 *      "Consumo hoje" e "Custo do mês"
 *   3. Histórico de consumo (fora do protótipo, abaixo dos blocos dele)
 *
 * Criar e excluir o dispositivo vivem em Configurações → Cadastro; aqui só
 * se edita. Carrega três queries em paralelo (dispositivo, área, propriedade):
 * erro no dispositivo é fatal, nas outras vira fallback nas tags.
 */
export const DeviceDetailsPage = () => {
    const { propertyId, areaId, deviceId } = useParams<{
        propertyId: string
        areaId: string
        deviceId: string
    }>()

    const deviceQuery = useDevice(propertyId, areaId, deviceId)
    const areaQuery = useArea(propertyId, areaId)
    const propertyQuery = useProperty(propertyId)
    const meterQuery = useMeterByTarget("DEVICE", deviceId)
    const meter = meterQuery.data
    // Sem medidor não há o que consultar: o resumo omitiria o item.
    const kpis = useTargetConsumptionKpis("DEVICE", meter ? deviceId : undefined)
    const { lastKnownPowerW } = useLiveMeterReading("DEVICE", deviceId, meter?.id)

    if (deviceQuery.isLoading) return <DetailsSkeleton />

    if (deviceQuery.isError || !deviceQuery.data) {
        return (
            <ErrorState
                propertyId={propertyId}
                areaId={areaId}
                message={
                    deviceQuery.error instanceof Error
                        ? deviceQuery.error.message
                        : "Dispositivo não encontrado"
                }
            />
        )
    }

    const device = deviceQuery.data
    const property = propertyQuery.data

    return (
        <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 items-start gap-[clamp(14px,1.6vw,20px)] xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <DeviceHeaderCard
                    device={device}
                    area={areaQuery.data}
                    property={property}
                    isAreaLoading={areaQuery.isLoading}
                    isPropertyLoading={propertyQuery.isLoading}
                />
                <MeterSection targetType="DEVICE" targetId={device.id} />
            </div>

            {meter && (
                <div className="grid grid-cols-1 items-stretch gap-[clamp(14px,1.6vw,20px)] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <RealtimeChartCard
                        targetType="DEVICE"
                        targetId={device.id}
                        meterId={meter.id}
                        title="Consumo em tempo real"
                        subtitle={device.name}
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

            <DeviceConsumptionSection
                propertyId={propertyId!}
                areaId={areaId!}
                deviceId={device.id}
                tariffGroup={property?.tariffGroup}
                groupBModality={property?.groupBModality}
            />
        </div>
    )
}

interface DeviceHeaderCardProps {
    device: Device
    area: Area | undefined
    property: Property | undefined
    isAreaLoading: boolean
    isPropertyLoading: boolean
}

const DeviceHeaderCard = ({
    device,
    area,
    property,
    isAreaLoading,
    isPropertyLoading,
}: DeviceHeaderCardProps) => {
    const { propertyId, areaId } = useParams<{
        propertyId: string
        areaId: string
    }>()
    const [isEditOpen, setIsEditOpen] = useState(false)

    const brandModelLabel = [device.brand, device.model].filter(Boolean).join(" · ")

    return (
        <div className="blueprint p-26px">
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />

            <div className="gap-15px flex min-w-0 items-start">
                <IconCircle icon={Cpu} tone="accent" strokeWidth={1.5} />
                <div className="min-w-0 flex-1">
                    <h2 className="font-heading truncate text-[clamp(24px,2.6vw,32px)] leading-none font-semibold uppercase">
                        {device.name}
                    </h2>
                </div>
            </div>

            {/* Tags — hierarquia (propriedade avó + área pai) e metadados */}
            <div className="mt-18px gap-9px flex flex-wrap">
                <HierarchyTag
                    isLoading={isPropertyLoading}
                    label={property?.name}
                    fallback="Propriedade não disponível"
                />
                <HierarchyTag
                    isLoading={isAreaLoading}
                    label={area?.name}
                    fallback="Área não disponível"
                />
                {brandModelLabel && <Tag variant="neutral">{brandModelLabel}</Tag>}
                {device.powerWatts !== null && <Tag variant="neutral">{device.powerWatts}W</Tag>}
            </div>

            <div className="mt-22px flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setIsEditOpen(true)}>
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    Editar dispositivo
                </Button>
            </div>

            {propertyId && areaId && (
                <DeviceFormDialog
                    isOpen={isEditOpen}
                    onClose={() => setIsEditOpen(false)}
                    mode={{ kind: "edit", propertyId, areaId, device }}
                />
            )}
        </div>
    )
}

interface HierarchyTagProps {
    isLoading: boolean
    label: string | undefined
    fallback: string
}

/**
 * Tag de contexto (propriedade avó / área pai). Três estados:
 *   - loading: placeholder animado
 *   - sem dado (erro silencioso): fallback em itálico
 *   - carregado: nome, em Tag accent
 */
const HierarchyTag = ({ isLoading, label, fallback }: HierarchyTagProps) => {
    if (isLoading) {
        return (
            <div
                className="bg-divider h-6 w-24 animate-pulse"
                aria-busy="true"
                aria-label="Carregando"
            />
        )
    }

    if (!label) {
        return <span className="text-muted text-sm italic">{fallback}</span>
    }

    return (
        <Tag variant="accent" className="font-semibold">
            {label}
        </Tag>
    )
}

const DetailsSkeleton = () => (
    <div
        className="blueprint h-72 p-6"
        aria-busy="true"
        aria-label="Carregando dados do dispositivo"
    >
        <div className="bg-divider h-8 w-1/3 animate-pulse" />
        <div className="bg-divider mt-4 h-4 w-1/2 animate-pulse" />
    </div>
)

interface ErrorStateProps {
    propertyId: string | undefined
    areaId: string | undefined
    message: string
}

const ErrorState = ({ propertyId, areaId, message }: ErrorStateProps) => {
    const href =
        propertyId && areaId
            ? `/propriedades/${propertyId}/areas/${areaId}`
            : propertyId
              ? `/propriedades/${propertyId}`
              : "/propriedades"

    return (
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
                <Link to={href}>Voltar para a área</Link>
            </Button>
        </div>
    )
}
