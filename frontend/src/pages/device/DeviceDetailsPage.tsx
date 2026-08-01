import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import {
    AlertCircle,
    ArrowLeft,
    Cpu,
    Gauge,
    Home,
    LayoutGrid,
    Pencil,
    Tag,
    type LucideIcon,
} from "lucide-react"
import { useDevice } from "@/hooks/queries/useDevices"
import { useArea } from "@/hooks/queries/useAreas"
import { useProperty } from "@/hooks/queries/useProperties"
import { Button } from "@/components/ui/Button"
import { DeviceMenu } from "@/components/device/DeviceMenu"
import { DeviceFormDialog } from "@/components/device/DeviceFormDialog"
import { cn } from "@/lib/cn"
import type { Device } from "@/types/device.types"
import type { Area } from "@/types/area.types"
import type { Property } from "@/types/property.types"
import { DeviceConsumptionSection } from "@/components/consumption/ConsumptionSection"
import { MeterSection } from "@/components/meter/MeterSection"

/**
 * Página de detalhes de um dispositivo.
 *
 * Estrutura:
 *   1. Breadcrumb (voltar pra área pai)
 *   2. Header em card destacado: nome + chips (área pai, propriedade avó,
 *      marca/modelo, potência) + ações (Editar / ⋯)
 *   3. Seção de Consumo (real, com filtro por período) + 2 seções
 *      ainda placeholder: Alertas e IoT
 *
 * Carrega TRÊS queries em paralelo: device, area, property.
 *
 * Erro no Device é fatal; erros em Area/Property viram fallback nos
 * respectivos chips.
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

    const handleAfterDelete = () => {
        // Após excluir, volta pra área pai. replace evita que o botão
        // "voltar" do navegador traga de volta a página do device deletado.
        navigate(`/propriedades/${propertyId}/areas/${areaId}`, {
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
            className={cn(
                "inline-flex w-fit items-center gap-1 text-sm",
                "text-slate-600 hover:text-slate-900",
                "dark:text-slate-400 dark:hover:text-slate-200",
            )}
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

    const brandModelLabel = [device.brand, device.model]
        .filter(Boolean)
        .join(" · ")

    return (
        <div
            className={cn(
                "relative rounded-lg border bg-white p-6 shadow-sm",
                "border-slate-200 dark:border-slate-800 dark:bg-slate-900",
            )}
        >
            {/* Menu ⋯ — absolute, no canto superior direito.
                showEdit=false porque o botão "Editar dispositivo" abaixo já
                cobre essa ação de forma mais visível. */}
            <DeviceMenu
                device={device}
                showEdit={false}
                onAfterDelete={onAfterDelete}
            />

            <div className="flex items-start gap-3 pr-10">
                <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-brand-50 dark:bg-brand-500/10"
                    aria-hidden="true"
                >
                    <Cpu className="h-6 w-6 text-brand-500" />
                </div>
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-2xl font-bold text-slate-900 dark:text-slate-100">
                        {device.name}
                    </h1>
                </div>
            </div>

            {/* Chips — hierarquia (área pai + propriedade avó) e metadados */}
            <div className="mt-4 flex flex-wrap gap-2">
                <Chip
                    icon={Home}
                    label={
                        isPropertyLoading
                            ? "Carregando..."
                            : property
                            ? property.name
                            : "Propriedade não disponível"
                    }
                    variant="brand"
                    testId="device-property-chip"
                />
                <Chip
                    icon={LayoutGrid}
                    label={
                        isAreaLoading
                            ? "Carregando..."
                            : area
                            ? area.name
                            : "Área não disponível"
                    }
                    variant="brand"
                    testId="device-area-chip"
                />
                {brandModelLabel && (
                    <Chip icon={Tag} label={brandModelLabel} />
                )}
                {device.powerWatts !== null && (
                    <Chip
                        icon={Gauge}
                        label={`${device.powerWatts}W`}
                    />
                )}
            </div>

            {/* Ações */}
            <div className="mt-6 flex flex-wrap gap-2">
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

interface ChipProps {
    icon: LucideIcon
    label: string
    variant?: "brand" | "default"
    testId?: string
}

const Chip = ({ icon: Icon, label, variant = "default", testId }: ChipProps) => {
    const styles =
        variant === "brand"
            ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"

    return (
        <span
            data-testid={testId}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
                styles,
            )}
        >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="max-w-70 truncate">{label}</span>
        </span>
    )
}

const DetailsSkeleton = () => (
    <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
            <div className="h-12 w-12 shrink-0 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
            <div className="flex-1 space-y-2">
                <div className="h-6 w-1/2 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            </div>
        </div>
        <div className="mt-4 flex gap-2">
            <div className="h-7 w-32 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
            <div className="h-7 w-32 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
        </div>
    </div>
)

interface ErrorStateProps {
    message: string
}

const ErrorState = ({ message }: ErrorStateProps) => (
    <div
        className={cn(
            "flex items-start gap-3 rounded-lg border p-4",
            "border-red-200 bg-red-50 text-red-900",
            "dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200",
        )}
        role="alert"
    >
        <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
        <p className="text-sm">{message}</p>
    </div>
)