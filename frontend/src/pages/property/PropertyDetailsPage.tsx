import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { AlertCircle, ArrowLeft, Home, LayoutGrid, MapPin, Pencil, Plus } from "lucide-react"
import { useProperty } from "@/hooks/queries/useProperties"
import { useDistributor, useDistributors } from "@/hooks/queries/useDistributors"
import { useAreas } from "@/hooks/queries/useAreas"
import { useMeterByTarget } from "@/hooks/queries/useMeters"
import { useLiveMeterReading } from "@/hooks/useLiveMeterReading"
import { useConsumptionSummary } from "@/hooks/queries/useConsumption"
import { Button } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { Tag } from "@/components/ui/Tag"
import { PropertyMenu } from "@/components/property/PropertyMenu"
import { PropertyFormDialog } from "@/components/property/PropertyFormDialog"
import { AreaFormDialog } from "@/components/area/AreaFormDialog"
import { AreaCard } from "@/components/area/AreaCard"
import { PropertyConsumptionSection } from "@/components/consumption/ConsumptionSection"
import { ComparisonBars } from "@/components/consumption/ComparisonBars"
import { MeterSection } from "@/components/meter/MeterSection"
import { RealtimeChartCard } from "@/components/realtime/RealtimeChartCard"
import { formatPowerKw, formatKwhPrice, formatBrl } from "@/lib/format"
import {
    BILLING_CLASS_LABELS,
    ELECTRICAL_SYSTEM_LABELS,
    type Property,
} from "@/types/property.types"
import type { Distributor } from "@/types/distributor.types"
import type { ConsumptionBucket } from "@/types/consumption.types"

/**
 * Página de detalhes de uma propriedade — LumiTrack Home.dc.html,
 * `propDetailView`.
 *
 * Estrutura:
 *   1. Breadcrumb / voltar
 *   2. Header em blueprint: nome + endereço + tags (distribuidora/UF/TUSD/TE,
 *      sistema/faturamento/CIP) + ações (Editar / ⋯)
 *   3. KPI "Potência agora" (só quando há medidor com leitura real — sem
 *      inventar dado; ver 07-decisoes-em-aberto / ADR sobre os KPIs
 *      omitidos nesta issue: Consumo hoje, Custo projetado, Bandeira)
 *   4. Seção de Medidor
 *   5. Seção de Consumo (histórico real — ocupa o lugar do gráfico "ao vivo"
 *      bespoke do protótipo, que foi omitido por não ter dado/lógica real)
 *   6. Seção de Áreas (grid + comparação de áreas por consumo do mês)
 *
 * Carrega as queries em paralelo — `enabled`/`targetId` opcional em cada
 * hook evita disparos fadados ao erro antes do id resolver.
 */
export const PropertyDetailsPage = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()

    const propertyQuery = useProperty(id)
    const distributorQuery = useDistributor(propertyQuery.data?.distributorId)
    // Catálogo completo de distribuidoras — pro select do modal de edição
    // (distributorQuery acima é só a distribuidora JÁ vinculada, pras tags).
    const distributorsQuery = useDistributors(1, 31)
    // KPI "Potência agora" — mesma fonte que MeterSection usa internamente
    // (useMeterByTarget dedupe via cache do TanStack Query, sem query extra
    // de verdade) + useLiveMeterReading (SSE) pra leitura ao vivo.
    const meterQuery = useMeterByTarget("PROPERTY", id)
    const { reading, isStale: isReadingStale } = useLiveMeterReading(meterQuery.data?.id)

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
    const meter = meterQuery.data

    return (
        <div className="flex flex-col gap-6">
            <BackLink />

            <PropertyHeaderCard
                property={property}
                distributor={distributor}
                isDistributorLoading={distributorQuery.isLoading}
                distributors={distributorsQuery.data?.items ?? []}
                onAfterDelete={() => void navigate("/propriedades", { replace: true })}
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
                    targetType="PROPERTY"
                    targetId={property.id}
                    meterId={meter.id}
                    title="Consumo em tempo real"
                    subtitle={property.name}
                />
            )}

            <MeterSection targetType="PROPERTY" targetId={property.id} />
            <PropertyConsumptionSection propertyId={property.id} />
            <AreasSection propertyId={property.id} />
        </div>
    )
}

interface PropertyHeaderCardProps {
    property: Property
    distributor: Distributor | undefined
    isDistributorLoading: boolean
    distributors: Distributor[]
    onAfterDelete: () => void
}

const PropertyHeaderCard = ({
    property,
    distributor,
    isDistributorLoading,
    distributors,
    onAfterDelete,
}: PropertyHeaderCardProps) => {
    const addressLine = formatAddress(property)
    const [isEditOpen, setIsEditOpen] = useState(false)

    return (
        <div className="blueprint p-[26px]">
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />

            {/* Linha superior: ícone + título/endereço + ações */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-[15px]">
                    <span
                        className="border-accent text-accent flex h-[52px] w-[52px] shrink-0 items-center justify-center border-[1.5px]"
                        aria-hidden="true"
                    >
                        <Home className="h-[26px] w-[26px]" strokeWidth={1.5} />
                    </span>
                    <div className="min-w-0">
                        <h1 className="font-heading truncate text-[clamp(24px,2.6vw,32px)] leading-none font-semibold uppercase">
                            {property.name}
                        </h1>
                        {addressLine && (
                            <p className="text-muted mt-2 flex items-center gap-1.5 text-sm">
                                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span className="truncate">{addressLine}</span>
                            </p>
                        )}
                    </div>
                </div>

                {/* Ações */}
                <div className="flex shrink-0 items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setIsEditOpen(true)}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        Editar
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

            {/* Tags — distribuidora vinculada */}
            <div className="border-divider mt-[22px] border-t pt-[18px]">
                <div className="font-heading text-muted mb-3 text-[11px] font-semibold tracking-[.08em] uppercase">
                    Distribuidora vinculada
                </div>
                <DistributorTags distributor={distributor} isLoading={isDistributorLoading} />
            </div>

            {/* Tags — faturamento da própria propriedade */}
            <div className="border-divider mt-[18px] border-t pt-[18px]">
                <div className="font-heading text-muted mb-3 text-[11px] font-semibold tracking-[.08em] uppercase">
                    Faturamento
                </div>
                <div className="flex flex-wrap gap-[9px]">
                    <Tag variant="outline">
                        {ELECTRICAL_SYSTEM_LABELS[property.electricalSystem]}
                    </Tag>
                    <Tag variant="outline">{BILLING_CLASS_LABELS[property.billingClass]}</Tag>
                    {property.publicLightingFeeBrl !== null && (
                        <Tag variant="outline">CIP: {formatBrl(property.publicLightingFeeBrl)}</Tag>
                    )}
                </div>
            </div>

            <PropertyFormDialog
                isOpen={isEditOpen}
                onClose={() => setIsEditOpen(false)}
                mode={{ kind: "edit", property }}
                distributors={distributors}
            />
        </div>
    )
}

interface DistributorTagsProps {
    distributor: Distributor | undefined
    isLoading: boolean
}

const DistributorTags = ({ distributor, isLoading }: DistributorTagsProps) => {
    if (isLoading) {
        return (
            <div
                className="flex flex-wrap gap-[9px]"
                aria-busy="true"
                aria-label="Carregando dados da distribuidora"
            >
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="bg-divider h-6 w-24 animate-pulse" />
                ))}
            </div>
        )
    }

    if (!distributor) {
        return <p className="text-muted text-sm italic">Distribuidora não disponível</p>
    }

    return (
        <div className="flex flex-wrap gap-[9px]">
            <Tag variant="accent" className="font-semibold">
                {distributor.name}
            </Tag>
            <Tag variant="neutral">{distributor.state}</Tag>
            <Tag variant="neutral">TUSD {formatKwhPrice(distributor.tusdPerKwh)}</Tag>
            <Tag variant="neutral">TE {formatKwhPrice(distributor.tePerKwh)}</Tag>
        </div>
    )
}

interface AreasSectionProps {
    propertyId: string
}

/**
 * Lista as áreas da propriedade + comparação de consumo entre elas.
 *
 * O consumo mensal por área (usado tanto no kWh/mês de cada AreaCard quanto
 * nas barras de comparação) é buscado numa única chamada via
 * `useConsumptionSummary` (issue #283 — substitui o `useQueries` de N
 * chamadas, uma por área). Área sem medidor/sem leitura simplesmente não
 * aparece no resultado — não é erro, só fica de fora da comparação.
 */
const AreasSection = ({ propertyId }: AreasSectionProps) => {
    const areasQuery = useAreas(propertyId)
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [comparisonUnit, setComparisonUnit] = useState<"kwh" | "reais">("kwh")
    const areas = areasQuery.data?.items ?? []

    const summaryQuery = useConsumptionSummary(
        "AREA",
        areas.map((a) => a.id),
        "month",
    )
    const bucketById = new Map(
        (summaryQuery.data?.items ?? []).map((item) => [item.id, item as ConsumptionBucket]),
    )

    const comparisonRows = areas
        .map((area) => ({ id: area.id, label: area.name, bucket: bucketById.get(area.id) }))
        .filter(
            (row): row is { id: string; label: string; bucket: ConsumptionBucket } =>
                row.bucket != null,
        )

    return (
        <section className="flex flex-col gap-4">
            <div className="blueprint">
                <i className="corner tl" />
                <i className="corner tr" />
                <i className="corner bl" />
                <i className="corner br" />

                <div className="border-divider flex items-center justify-between border-b px-5 py-4">
                    <h2 className="font-heading text-[17px] font-semibold uppercase">Áreas</h2>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setIsCreateOpen(true)}
                        className="min-h-9 text-[13px]"
                    >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        Adicionar área
                    </Button>
                </div>

                <div className="px-5 py-4">
                    {areasQuery.isLoading && <AreasSkeleton />}

                    {areasQuery.isError && (
                        <div
                            role="alert"
                            className="border-status-danger/40 flex items-start gap-3 border p-4"
                        >
                            <AlertCircle
                                className="text-status-danger h-5 w-5 shrink-0"
                                aria-hidden="true"
                            />
                            <p className="text-status-danger/85 text-sm">
                                {areasQuery.error instanceof Error
                                    ? areasQuery.error.message
                                    : "Não foi possível carregar as áreas."}
                            </p>
                        </div>
                    )}

                    {areasQuery.isSuccess && areas.length === 0 && (
                        <>
                            <EmptyState
                                icon={LayoutGrid}
                                title="Nenhuma área cadastrada"
                                description="O cadastro de áreas estará disponível em breve. Por aqui você poderá organizar dispositivos por cômodo, setor ou unidade."
                            />
                            <p
                                className="text-muted mt-3 text-center text-xs italic"
                                data-testid="areas-coming-soon"
                            >
                                Em breve
                            </p>
                        </>
                    )}

                    {areasQuery.isSuccess && areas.length > 0 && (
                        <div
                            className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3"
                            data-testid="areas-grid"
                        >
                            {areas.map((area) => (
                                <AreaCard
                                    key={area.id}
                                    area={area}
                                    monthlyConsumption={bucketById.get(area.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {comparisonRows.length > 0 && (
                <div className="blueprint">
                    <i className="corner tl" />
                    <i className="corner tr" />
                    <i className="corner bl" />
                    <i className="corner br" />

                    <div className="border-divider flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
                        <div>
                            <span className="font-heading text-[17px] font-semibold uppercase">
                                Comparação de áreas
                            </span>
                            <span className="text-muted mt-[3px] block text-[12.5px]">
                                Consumo por área neste mês (
                                {comparisonUnit === "kwh" ? "kWh" : "R$"})
                            </span>
                        </div>
                        <div
                            role="group"
                            aria-label="Unidade de comparação"
                            className="flex gap-1.5"
                        >
                            <button
                                type="button"
                                className="lt-selbtn"
                                data-on={comparisonUnit === "kwh"}
                                aria-pressed={comparisonUnit === "kwh"}
                                onClick={() => setComparisonUnit("kwh")}
                            >
                                kWh
                            </button>
                            <button
                                type="button"
                                className="lt-selbtn"
                                data-on={comparisonUnit === "reais"}
                                aria-pressed={comparisonUnit === "reais"}
                                onClick={() => setComparisonUnit("reais")}
                            >
                                R$
                            </button>
                        </div>
                    </div>

                    <div className="px-5 pt-2 pb-5">
                        <ComparisonBars rows={comparisonRows} unit={comparisonUnit} />
                    </div>
                </div>
            )}

            <AreaFormDialog
                isOpen={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                mode={{ kind: "create", propertyId }}
            />
        </section>
    )
}

const AreasSkeleton = () => (
    <div
        className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3"
        aria-busy="true"
        aria-label="Carregando áreas"
    >
        {[0, 1, 2].map((i) => (
            <div key={i} className="border-divider h-28 animate-pulse border" />
        ))}
    </div>
)

// Estados auxiliares

const BackLink = () => (
    <Link
        to="/propriedades"
        className="text-muted hover:text-text inline-flex w-fit items-center gap-1.5 text-sm"
    >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Voltar para propriedades
    </Link>
)

const DetailsSkeleton = () => (
    <div
        className="blueprint h-72 p-6"
        aria-busy="true"
        aria-label="Carregando dados da propriedade"
    >
        <div className="bg-divider h-8 w-1/3 animate-pulse" />
        <div className="bg-divider mt-4 h-4 w-1/2 animate-pulse" />
    </div>
)

interface ErrorStateProps {
    message: string
}

const ErrorState = ({ message }: ErrorStateProps) => (
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
