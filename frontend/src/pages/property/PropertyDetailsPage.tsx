import { Link, useNavigate, useParams } from "react-router"
import {
    AlertCircle,
    ArrowLeft,
    Gauge,
    Home,
    LayoutGrid,
    MapPin,
    Pencil,
    Plus,
    Zap,
    Activity,
} from "lucide-react"
import { useProperty } from "@/hooks/queries/useProperties"
import { useDistributor } from "@/hooks/queries/useDistributors"
import { Button } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { PropertyMenu } from "@/components/property/PropertyMenu"
import { cn } from "@/lib/cn"
import { BILLING_CLASS_LABELS, type Property } from "@/types/property.types"
import type { Distributor } from "@/types/distributor.types"
import { useAreas } from "@/hooks/queries/useAreas"
import { AreaCard } from "@/components/area/AreaCard"
import { PropertyConsumptionSection } from "@/components/consumption/ConsumptionSection"
import { MeterSection } from "@/components/meter/MeterSection"

/**
 * Página de detalhes de uma propriedade.
 *
 * Estrutura:
 *   1. Breadcrumb / voltar
 *   2. Header em card destacado: nome + endereço + chips com dados da
 *      distribuidora vinculada + ações (Editar / ⋯)
 *   3. Seção de Áreas — EmptyState com botão desabilitado "Adicionar área"
 *      ou grid de card de áreas.
 *   4. Seção de Consumo — registros agregados desta propriedade (com filtro por período)
 *   5. Seção de Alertas — limites de consumo configurados
 *
 * Carrega DUAS queries em sequência:
 *   - useProperty(id): a propriedade (precisa pra saber o distributorId)
 *   - useDistributor(propertyData?.distributorId): a distribuidora vinculada
 *
 * O `enabled` do useDistributor (que checa `Boolean(id)`) garante que a
 * segunda query só dispara quando a primeira resolve. Sem useEffect,
 * sem race conditions.
 *
 * Estados visuais:
 *   - Loading inicial (property carregando) → skeleton
 *   - Erro ao carregar property → ErrorState
 *   - Property carregada mas distributor com erro → mostra a página com
 *     fallback "Distribuidora não disponível" no header (não é erro fatal:
 *     a propriedade existe, só perdemos um dado complementar)
 *   - Sucesso → renderiza header + seção de áreas
 */
export const PropertyDetailsPage = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()

    const propertyQuery = useProperty(id)
    const distributorQuery = useDistributor(propertyQuery.data?.distributorId)

    // Loading só do primeiro nível (property). Distributor carregando depois
    // não bloqueia a página inteira — mostramos um placeholder local.
    if (propertyQuery.isLoading) {
        return (
            <div className="flex flex-col gap-6">
                <BackLink />
                <DetailsSkeleton />
            </div>
        )
    }

    // Erro ao carregar a propriedade é fatal — sem ela não tem o que mostrar.
    if (propertyQuery.isError || !propertyQuery.data) {
        return (
            <div className="flex flex-col gap-6">
                <BackLink />
                <ErrorState
                    message={
                        propertyQuery.error instanceof Error
                            ? propertyQuery.error.message
                            : "Propriedade não encontrada"
                    }
                />
            </div>
        )
    }

    const property = propertyQuery.data
    const distributor = distributorQuery.data

    return (
        <div className="flex flex-col gap-6">
            <BackLink />

            <PropertyHeaderCard
                property={property}
                distributor={distributor}
                isDistributorLoading={distributorQuery.isLoading}
                onAfterDelete={() =>
                    navigate("/propriedades", { replace: true })
                }
            />

            <AreasSection  propertyId={property.id} />
            <MeterSection targetType="PROPERTY" targetId={property.id} />
            <PropertyConsumptionSection propertyId={property.id} />
        </div>
    )
}

interface PropertyHeaderCardProps {
    property: Property
    distributor: Distributor | undefined
    isDistributorLoading: boolean
    onAfterDelete: () => void
}

const PropertyHeaderCard = ({
    property,
    distributor,
    isDistributorLoading,
    onAfterDelete,
}: PropertyHeaderCardProps) => {
    const addressLine = formatAddress(property)

    return (
        <div
            className={cn(
                "rounded-lg border bg-white p-6 shadow-sm",
                "border-slate-200 dark:border-slate-800 dark:bg-slate-900",
            )}
        >
            {/* Linha superior: ícone + título/endereço + ações */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                    <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-brand-50 dark:bg-brand-500/10"
                        aria-hidden="true"
                    >
                        <Home className="h-6 w-6 text-brand-500" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="truncate text-2xl font-bold text-slate-900 dark:text-slate-100">
                            {property.name}
                        </h1>
                        {addressLine && (
                            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
                                <MapPin
                                    className="h-4 w-4 shrink-0"
                                    aria-hidden="true"
                                />
                                <span className="truncate">{addressLine}</span>
                            </p>
                        )}
                    </div>
                </div>

                {/* Ações */}
                <div className="flex shrink-0 items-center gap-2">
                    <Button asChild variant="secondary" size="sm">
                        <Link to={`/propriedades/${property.id}/editar`}>
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                            Editar propriedade
                        </Link>
                    </Button>
                    {/*
                        showEdit=false: botão "Editar" explícito acima,
                        no menu sobra apenas Excluir.
                        onAfterDelete: navega de volta — sem isso, ficaríamos
                        numa rota /propriedades/:id que não existe mais (404).
                    */}
                    <PropertyMenu
                        property={property}
                        showEdit={false}
                        onAfterDelete={onAfterDelete}
                    />
                </div>
            </div>

            {/* Chips com dados da distribuidora */}
            <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Distribuidora vinculada
                </h2>
                <DistributorChips
                    distributor={distributor}
                    isLoading={isDistributorLoading}
                />
            </div>

            {/* Chips com o faturamento da própria propriedade (Fase 1: migrou
                da distribuidora — sistema elétrico, classe, CIP) */}
            <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Faturamento
                </h2>
                <div className="flex flex-wrap gap-2">
                    <Chip
                        icon={Activity}
                        label={formatElectricalSystem(property.electricalSystem)}
                    />
                    <Chip icon={Gauge} label={BILLING_CLASS_LABELS[property.billingClass]} />
                    {property.publicLightingFeeBrl !== null && (
                        <Chip
                            icon={Zap}
                            label={`CIP: ${formatBrl(property.publicLightingFeeBrl)}`}
                        />
                    )}
                </div>
            </div>
        </div>
    )
}

interface DistributorChipsProps {
    distributor: Distributor | undefined
    isLoading: boolean
}

const DistributorChips = ({
    distributor,
    isLoading,
}: DistributorChipsProps) => {
    if (isLoading) {
        return (
            <div
                className="flex flex-wrap gap-2"
                aria-busy="true"
                aria-label="Carregando dados da distribuidora"
            >
                {[0, 1, 2, 3].map((i) => (
                    <div
                        key={i}
                        className="h-8 w-32 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800"
                    />
                ))}
            </div>
        )
    }

    if (!distributor) {
        return (
            <p className="text-sm italic text-slate-500 dark:text-slate-400">
                Distribuidora não disponível
            </p>
        )
    }

    return (
        <div className="flex flex-wrap gap-2">
            <Chip icon={Zap} label={distributor.name} variant="brand" />
            <Chip icon={MapPin} label={distributor.state} />
            <Chip icon={Zap} label={`TUSD ${formatBrl(distributor.tusdPerKwh)}/kWh`} />
            <Chip icon={Zap} label={`TE ${formatBrl(distributor.tePerKwh)}/kWh`} />
        </div>
    )
}

interface ChipProps {
    icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
    label: string
    /** "brand" usa as cores de destaque (verde do brand); default usa cinza neutro */
    variant?: "brand" | "default"
}

const Chip = ({ icon: Icon, label, variant = "default" }: ChipProps) => {
    const styles =
        variant === "brand"
            ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"

    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
                styles,
            )}
        >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span className="max-w-70 truncate">{label}</span>
        </span>
    )
}

interface AreasSectionProps {
    propertyId: string
}

/**
 * Lista as áreas da propriedade.
 *
 * Estados:
 *   - Loading: skeleton
 *   - Erro: mensagem inline (não fatal — header e demais seções continuam)
 *   - Vazio: EmptyState com botão desabilitado "Adicionar área"
 *   - Com áreas: grid de AreaCards
 */
const AreasSection = ({ propertyId }: AreasSectionProps) => {
    const areasQuery = useAreas(propertyId)

    return (
        <section className="flex flex-col gap-3">
            <header className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Áreas
                </h2>
                <Button asChild variant="secondary" size="sm">
                    <Link to={`/propriedades/${propertyId}/areas/nova`}>
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Adicionar área
                    </Link>
                </Button>
            </header>

            {areasQuery.isLoading && <AreasSkeleton />}

            {areasQuery.isError && (
                <div
                    role="alert"
                    className={cn(
                        "flex items-start gap-3 rounded-lg border p-4",
                        "border-red-200 bg-red-50 text-red-900",
                        "dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200",
                    )}
                >
                    <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <p className="text-sm">
                        {areasQuery.error instanceof Error
                            ? areasQuery.error.message
                            : "Não foi possível carregar as áreas."}
                    </p>
                </div>
            )}

            {areasQuery.isSuccess && areasQuery.data.items.length === 0 && (
                <>
                    <EmptyState
                        icon={LayoutGrid}
                        title="Nenhuma área cadastrada"
                        description="O cadastro de áreas estará disponível em breve. Por aqui você poderá organizar dispositivos por cômodo, setor ou unidade."
                    />
                    <p
                        className="text-center text-xs italic text-slate-500 dark:text-slate-400"
                        data-testid="areas-coming-soon"
                    >
                        Em breve
                    </p>
                </>
            )}

            {areasQuery.isSuccess && areasQuery.data.items.length > 0 && (
                <div
                    className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
                    data-testid="areas-grid"
                >
                    {areasQuery.data.items.map((area) => (
                        <AreaCard key={area.id} area={area} />
                    ))}
                </div>
            )}
        </section>
    )
}

const AreasSkeleton = () => (
    <div
        className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        aria-busy="true"
        aria-label="Carregando áreas"
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

// Estados auxiliares

const BackLink = () => (
    <Link
        to="/propriedades"
        className={cn(
            "inline-flex w-fit items-center gap-1 text-sm",
            "text-slate-600 hover:text-slate-900",
            "dark:text-slate-400 dark:hover:text-slate-200",
        )}
    >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Voltar para propriedades
    </Link>
)

const DetailsSkeleton = () => (
    <div
        className={cn(
            "h-72 animate-pulse rounded-lg border bg-white p-6",
            "border-slate-200 dark:border-slate-800 dark:bg-slate-900",
        )}
        aria-busy="true"
        aria-label="Carregando dados da propriedade"
    />
)

interface ErrorStateProps {
    message: string
}

const ErrorState = ({ message }: ErrorStateProps) => (
    <div
        role="alert"
        className={cn(
            "flex flex-col items-center justify-center gap-4 rounded-lg border border-red-200 bg-red-50 py-12 text-center",
            "dark:border-red-900 dark:bg-red-950/30",
        )}
    >
        <AlertCircle
            className="h-8 w-8 text-red-500 dark:text-red-400"
            aria-hidden="true"
        />
        <div>
            <h3 className="font-semibold text-red-900 dark:text-red-200">
                Não foi possível carregar
            </h3>
            <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                {message}
            </p>
        </div>
        <Button asChild variant="secondary">
            <Link to="/propriedades">Voltar para a lista</Link>
        </Button>
    </div>
)

// Helpers

const formatAddress = (property: Property): string | null => {
    const parts: string[] = []

    if (property.address) parts.push(property.address)

    if (property.city && property.state) {
        parts.push(`${property.city}/${property.state}`)
    } else if (property.city) {
        parts.push(property.city)
    } else if (property.state) {
        parts.push(property.state)
    }

    return parts.length > 0 ? parts.join(", ") : null
}

/**
 * Traduz o enum ElectricalSystem (do backend) pra label em português.
 * MONOPHASIC | BIPHASIC | TRIPHASIC.
 */
const formatElectricalSystem = (system: string): string => {
    const map: Record<string, string> = {
        MONOPHASIC: "Monofásico",
        BIPHASIC: "Bifásico",
        TRIPHASIC: "Trifásico",
    }
    return map[system] ?? system
}

/**
 * Formata número em Real brasileiro (R$ 0,75).
 *
 * Não reusa a versão de lib/format.ts porque é uma necessidade pontual.
 */
const formatBrl = (value: number): string =>
    value.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
    })