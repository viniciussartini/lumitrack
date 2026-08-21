import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { AlertCircle, ArrowLeft, Cpu, Pencil } from "lucide-react"
import { useDevice } from "@/hooks/queries/useDevices"
import { useArea } from "@/hooks/queries/useAreas"
import { useProperty } from "@/hooks/queries/useProperties"
import { useMeterByTarget } from "@/hooks/queries/useMeters"
import { useRealtime } from "@/contexts/RealtimeContext"
import { Button } from "@/components/ui/Button"
import { Tag } from "@/components/ui/Tag"
import { DeviceMenu } from "@/components/device/DeviceMenu"
import { DeviceFormDialog } from "@/components/device/DeviceFormDialog"
import { DeviceConsumptionSection } from "@/components/consumption/ConsumptionSection"
import { MeterSection } from "@/components/meter/MeterSection"
import { RealtimeChartCard } from "@/components/realtime/RealtimeChartCard"
import { formatPowerKw } from "@/lib/format"
import type { Device } from "@/types/device.types"
import type { Area } from "@/types/area.types"
import type { Property } from "@/types/property.types"

/**
 * Página de detalhes de um dispositivo — LumiTrack Home.dc.html,
 * `deviceDetailView`. Nível folha da hierarquia (Property → Area → Device):
 * sem grid de filhos nem comparação, ao contrário das outras duas páginas.
 *
 * Estrutura:
 *   1. Breadcrumb (voltar pra área pai)
 *   2. Header em blueprint: nome + tags (propriedade avó, área pai,
 *      marca/modelo, potência) + ações (Editar dispositivo / ⋯)
 *   3. KPI "Potência agora" (só quando há medidor com leitura real — mesma
 *      decisão de "sem inventar dado": Consumo hoje/Custo projetado ficam de
 *      fora por não terem dado/lógica real)
 *   4. Seção de Medidor
 *   5. Seção de Consumo
 *
 * Carrega TRÊS queries em paralelo: device, area, property.
 * Erro no Device é fatal; erros em Area/Property viram fallback nas tags.
 *
 * NOTA: O DeviceMenu aqui usa `showEdit={false}` (já temos botão Editar
 * explícito no header) e `onAfterDelete` que navega de volta pra área pai —
 * sem isso, depois de excluir o device a URL apontaria pra recurso
 * inexistente e a página tentaria recarregá-lo num loop visual.
 */
export const DeviceDetailsPage = () => {
    const { propertyId, areaId, deviceId } = useParams<{
        propertyId: string
        areaId: string
        deviceId: string
    }>()
    const navigate = useNavigate()

    const deviceQuery = useDevice(propertyId, areaId, deviceId)
    const areaQuery = useArea(propertyId, areaId)
    const propertyQuery = useProperty(propertyId)
    // KPI "Potência agora" — mesma fonte que MeterSection usa internamente
    // (useMeterByTarget dedupe via cache do TanStack Query) + useRealtime
    // (SSE) pra leitura ao vivo.
    const meterQuery = useMeterByTarget("DEVICE", deviceId)
    const { readingsByMeterId } = useRealtime()
    // Estado (não Date.now() direto) pra recalcular a "idade" da leitura
    // periodicamente sem violar a regra de pureza de render — mesmo padrão
    // de MeterSection.tsx/PropertyDetailsPage.tsx/AreaDetailsPage.tsx.
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 2_000)
        return () => clearInterval(interval)
    }, [])

    if (deviceQuery.isLoading) {
        return (
            <div className="flex flex-col gap-6">
                <BackLink propertyId={propertyId} areaId={areaId} />
                <DetailsSkeleton />
            </div>
        )
    }

    if (deviceQuery.isError || !deviceQuery.data) {
        return (
            <div className="flex flex-col gap-6">
                <BackLink propertyId={propertyId} areaId={areaId} />
                <ErrorState
                    propertyId={propertyId}
                    areaId={areaId}
                    message={
                        deviceQuery.error instanceof Error
                            ? deviceQuery.error.message
                            : "Dispositivo não encontrado"
                    }
                />
            </div>
        )
    }

    const device = deviceQuery.data
    const area = areaQuery.data
    const property = propertyQuery.data
    const meter = meterQuery.data
    const reading = meter ? readingsByMeterId[meter.id] : undefined
    const isReadingStale = !reading || now - new Date(reading.receivedAt).getTime() > 10_000

    const handleAfterDelete = () => {
        // Após excluir, volta pra área pai. replace evita que o botão
        // "voltar" do navegador traga de volta a página do device deletado.
        void navigate(`/propriedades/${propertyId}/areas/${areaId}`, {
            replace: true,
        })
    }

    return (
        <div className="flex flex-col gap-6">
            <BackLink propertyId={propertyId} areaId={areaId} />

            <DeviceHeaderCard
                device={device}
                area={area}
                property={property}
                isAreaLoading={areaQuery.isLoading}
                isPropertyLoading={propertyQuery.isLoading}
                onAfterDelete={handleAfterDelete}
            />

            {meter && (
                <div className="blueprint w-fit min-w-[220px] px-5 py-[18px]">
                    <i className="corner tl" />
                    <i className="corner tr" />
                    <i className="corner bl" />
                    <i className="corner br" />
                    <div className="font-heading flex items-center gap-2 text-[11px] font-semibold tracking-[.07em] uppercase">
                        <span
                            className="h-2 w-2 rounded-full bg-[#3f8f52]"
                            style={{ animation: "lt-pulse 1.6s ease-in-out infinite" }}
                            aria-hidden="true"
                        />
                        Potência agora
                    </div>
                    <div className="font-heading mt-2.5 font-features-['tnum'_1] text-[30px] leading-none font-semibold">
                        {!isReadingStale && reading ? (
                            formatPowerKw(reading.powerW)
                        ) : (
                            <span className="text-muted">—</span>
                        )}
                    </div>
                </div>
            )}

            {meter && (
                <RealtimeChartCard
                    targetType="DEVICE"
                    targetId={deviceId!}
                    meterId={meter.id}
                    title="Consumo em tempo real"
                    subtitle={device.name}
                />
            )}

            <MeterSection targetType="DEVICE" targetId={deviceId!} />
            <DeviceConsumptionSection
                propertyId={propertyId!}
                areaId={areaId!}
                deviceId={deviceId!}
            />
        </div>
    )
}

interface BackLinkProps {
    propertyId: string | undefined
    areaId: string | undefined
}

const BackLink = ({ propertyId, areaId }: BackLinkProps) => {
    const href =
        propertyId && areaId
            ? `/propriedades/${propertyId}/areas/${areaId}`
            : propertyId
              ? `/propriedades/${propertyId}`
              : "/propriedades"

    return (
        <Link
            to={href}
            className="text-muted hover:text-text inline-flex w-fit items-center gap-1.5 text-sm"
        >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar para área
        </Link>
    )
}

interface DeviceHeaderCardProps {
    device: Device
    area: Area | undefined
    property: Property | undefined
    isAreaLoading: boolean
    isPropertyLoading: boolean
    onAfterDelete: () => void
}

const DeviceHeaderCard = ({
    device,
    area,
    property,
    isAreaLoading,
    isPropertyLoading,
    onAfterDelete,
}: DeviceHeaderCardProps) => {
    const { propertyId, areaId } = useParams<{
        propertyId: string
        areaId: string
    }>()
    const [isEditOpen, setIsEditOpen] = useState(false)

    const brandModelLabel = [device.brand, device.model].filter(Boolean).join(" · ")

    return (
        <div className="blueprint p-[26px]">
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />

            <div className="flex min-w-0 items-start gap-[15px]">
                <span
                    className="border-accent text-accent flex h-[52px] w-[52px] shrink-0 items-center justify-center border-[1.5px]"
                    aria-hidden="true"
                >
                    <Cpu className="h-[26px] w-[26px]" strokeWidth={1.5} />
                </span>
                <div className="min-w-0 flex-1">
                    <h1 className="font-heading truncate text-[clamp(24px,2.6vw,32px)] leading-none font-semibold uppercase">
                        {device.name}
                    </h1>
                </div>
            </div>

            {/* Tags — hierarquia (propriedade avó + área pai) e metadados */}
            <div className="mt-[18px] flex flex-wrap gap-[9px]">
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

            <div className="mt-[22px] flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setIsEditOpen(true)}>
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    Editar dispositivo
                </Button>
                {/*
                    showEdit=false: botão "Editar dispositivo" explícito
                    acima, no menu sobra apenas Excluir.
                */}
                <DeviceMenu device={device} showEdit={false} onAfterDelete={onAfterDelete} />
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
