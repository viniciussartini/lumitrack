import { Link, useNavigate, useParams } from "react-router"
import {
    AlertCircle,
    ArrowLeft,
    Cpu,
    Home,
    LayoutGrid,
    Pencil,
    Plus,
} from "lucide-react"
import { useArea } from "@/hooks/queries/useAreas"
import { useProperty } from "@/hooks/queries/useProperties"
import { Button } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { AreaMenu } from "@/components/area/AreaMenu"
import { cn } from "@/lib/cn"
import type { Area } from "@/types/area.types"
import type { Property } from "@/types/property.types"
import { DeviceCard } from "@/components/device/DeviceCard"
import { useDevices } from "@/hooks/queries/useDevices"
import { AreaConsumptionSection } from "@/components/consumption/ConsumptionSection"
import { MeterSection } from "@/components/meter/MeterSection"

/**
 * Página de detalhes de uma área.
 *
 * Estrutura:
 *   1. Breadcrumb / voltar pra propriedade pai
 *   2. Header em card destacado: nome + descrição + chip da propriedade pai
 *      + ações (Editar / ⋯)
 *   3. Seção de Dispositivos — EmptyState placeholder ou grid de cards de dispositivos
 *   4. Seção de Consumo — registros agregados desta área (com filtro por período)
 *   5. Seção de Alertas — limites de consumo configurados
 *
 * Carrega DUAS queries em paralelo:
 *   - useArea(propertyId, areaId): a área em si
 *   - useProperty(propertyId): a propriedade pai (pra mostrar contexto no chip)
 *
 * Estados visuais:
 *   - Loading inicial (área carregando) → skeleton
 *   - Erro ao carregar área → ErrorState (fatal — sem ela não tem o que mostrar)
 *   - Área carregada mas property com erro → renderiza com fallback no chip
 *   - Sucesso → renderiza header + seção devices + seção consumption
 *
 * NOTA: O AreaMenu aqui usa `showEdit={false}` (já temos botão Editar
 * explícito no header) e `onAfterDelete` que navega de volta pra propriedade
 * pai — sem isso, depois de excluir a área a URL apontaria pra recurso
 * inexistente e a página tentaria recarregá-lo num loop visual.
 */
export const AreaDetailsPage = () => {
    const { propertyId, areaId } = useParams<{
        propertyId: string
        areaId: string
    }>()
    const navigate = useNavigate()

    const areaQuery = useArea(propertyId, areaId)
    const propertyQuery = useProperty(propertyId)

    if (areaQuery.isLoading) {
        return (
            <div className="flex flex-col gap-6">
                <BackLink propertyId={propertyId} />
                <DetailsSkeleton />
            </div>
        )
    }

    if (areaQuery.isError || !areaQuery.data) {
        return (
            <div className="flex flex-col gap-6">
                <BackLink propertyId={propertyId} />
                <ErrorState
                    message={
                        areaQuery.error instanceof Error
                            ? areaQuery.error.message
                            : "Área não encontrada"
                    }
                />
            </div>
        )
    }

    const area = areaQuery.data
    const property = propertyQuery.data

    const handleAfterDelete = () => {
        // Após excluir, volta pra propriedade pai. replace evita que o
        // botão "voltar" do navegador traga de volta a página da área que
        // não existe mais.
        navigate(`/propriedades/${propertyId}`, { replace: true })
    }

    return (
        <div className="flex flex-col gap-6">
            <BackLink propertyId={propertyId} />

            <AreaHeaderCard
                area={area}
                property={property}
                isPropertyLoading={propertyQuery.isLoading}
                onAfterDelete={handleAfterDelete}
            />

            <DevicesSection propertyId={propertyId!} areaId={areaId!} />
            <MeterSection targetType="AREA" targetId={areaId!} />
            <AreaConsumptionSection propertyId={propertyId!} areaId={areaId!} />
        </div>
    )
}

interface BackLinkProps {
    propertyId: string | undefined
}

const BackLink = ({ propertyId }: BackLinkProps) => (
    <Link
        to={propertyId ? `/propriedades/${propertyId}` : "/propriedades"}
        className={cn(
            "inline-flex w-fit items-center gap-1 text-sm",
            "text-slate-600 hover:text-slate-900",
            "dark:text-slate-400 dark:hover:text-slate-200",
        )}
    >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Voltar para propriedade
    </Link>
)

interface AreaHeaderCardProps {
    area: Area
    property: Property | undefined
    isPropertyLoading: boolean
    onAfterDelete: () => void
}

const AreaHeaderCard = ({
    area,
    property,
    isPropertyLoading,
    onAfterDelete,
}: AreaHeaderCardProps) => (
    <div
        className={cn(
            "relative rounded-lg border bg-white p-6 shadow-sm",
            "border-slate-200 dark:border-slate-800 dark:bg-slate-900",
        )}
    >
        {/* Menu ⋯ — absolute, no canto superior direito.
            showEdit=false porque o botão "Editar área" abaixo já cobre essa
            ação de forma mais visível. */}
        <AreaMenu
            area={area}
            showEdit={false}
            onAfterDelete={onAfterDelete}
        />

        <div className="flex items-start gap-3 pr-10">
            <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-brand-50 dark:bg-brand-500/10"
                aria-hidden="true"
            >
                <LayoutGrid className="h-6 w-6 text-brand-500" />
            </div>
            <div className="min-w-0 flex-1">
                <h1 className="truncate text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {area.name}
                </h1>
                {area.description && (
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                        {area.description}
                    </p>
                )}
            </div>
        </div>

        {/* Chip — propriedade pai */}
        <div className="mt-4 flex flex-wrap gap-2">
            <PropertyChip
                property={property}
                isLoading={isPropertyLoading}
            />
        </div>

        {/* Ações */}
        <div className="mt-6 flex flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm">
                <Link
                    to={`/propriedades/${area.propertyId}/areas/${area.id}/editar`}
                >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    Editar área
                </Link>
            </Button>
        </div>
    </div>
)

interface PropertyChipProps {
    property: Property | undefined
    isLoading: boolean
}

/**
 * Chip da propriedade pai. Três estados:
 *   - loading: placeholder com texto "Carregando..."
 *   - sem property (erro silencioso): "Propriedade não disponível"
 *   - property carregada: nome
 */
const PropertyChip = ({ property, isLoading }: PropertyChipProps) => {
    const label = isLoading
        ? "Carregando..."
        : property
            ? property.name
            : "Propriedade não disponível"

    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
                "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300",
            )}
        >
            <Home className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="max-w-70 truncate">{label}</span>
        </span>
    )
}

interface DevicesSectionProps {
    propertyId: string
    areaId: string
}

/**
 * Seção de Dispositivos
 *
 * Estados:
 *   - Loading: skeleton com 3 cards animados
 *   - Erro: alerta inline (não fatal — header e demais seções continuam)
 *   - Vazio: EmptyState com botão desabilitado "Adicionar dispositivo"
 *   - Com dispositivos: grid de DeviceCards
 */
const DevicesSection = ({ propertyId, areaId }: DevicesSectionProps) => {
    const devicesQuery = useDevices(propertyId, areaId)

    return (
        <section className="flex flex-col gap-3">
            <header className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Dispositivos
                </h2>
                <Button asChild variant="secondary" size="sm">
                    <Link
                        to={`/propriedades/${propertyId}/areas/${areaId}/devices/novo`}
                    >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Adicionar dispositivo
                    </Link>
                </Button>
            </header>

            {devicesQuery.isLoading && <DevicesSkeleton />}

            {devicesQuery.isError && (
                <div
                    role="alert"
                    className={cn(
                        "flex items-start gap-3 rounded-lg border p-4",
                        "border-red-200 bg-red-50 text-red-900",
                        "dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200",
                    )}
                >
                    <AlertCircle
                        className="h-5 w-5 shrink-0"
                        aria-hidden="true"
                    />
                    <p className="text-sm">
                        {devicesQuery.error instanceof Error
                            ? devicesQuery.error.message
                            : "Não foi possível carregar os dispositivos."}
                    </p>
                </div>
            )}

            {devicesQuery.isSuccess && devicesQuery.data.items.length === 0 && (
                <>
                    <EmptyState
                        icon={Cpu}
                        title="Nenhum dispositivo cadastrado"
                        description="Cadastre os dispositivos desta área para monitorar o consumo individual de cada equipamento."
                    />
                    <p
                        className="text-center text-xs italic text-slate-500 dark:text-slate-400"
                        data-testid="devices-coming-soon"
                    >
                        Em breve
                    </p>
                </>
            )}

            {devicesQuery.isSuccess && devicesQuery.data.items.length > 0 && (
                <div
                    className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
                    data-testid="devices-grid"
                >
                    {devicesQuery.data.items.map((device) => (
                        <DeviceCard key={device.id} device={device} />
                    ))}
                </div>
            )}
        </section>
    )
}

const DevicesSkeleton = () => (
    <div
        className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        aria-busy="true"
        aria-label="Carregando dispositivos"
    >
        {[0, 1, 2].map((i) => (
            <div
                key={i}
                className={cn(
                    "h-28 animate-pulse rounded-lg border bg-white",
                    "border-slate-200 dark:border-slate-800 dark:bg-slate-900",
                )}
            />
        ))}
    </div>
)

const DetailsSkeleton = () => (
    <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
            <div className="h-12 w-12 shrink-0 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
            <div className="flex-1 space-y-2">
                <div className="h-6 w-1/2 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            </div>
        </div>
        <div className="mt-4 h-7 w-40 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
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