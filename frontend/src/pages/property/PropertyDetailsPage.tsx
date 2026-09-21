import { useState } from "react"
import { Link, useParams } from "react-router"
import { AlertCircle, Home, MapPin, Pencil, Scale } from "lucide-react"
import { useProperty } from "@/hooks/queries/useProperties"
import { useDistributor, useDistributors } from "@/hooks/queries/useDistributors"
import { useMeterByTarget } from "@/hooks/queries/useMeters"
import { useLiveMeterReading } from "@/hooks/useLiveMeterReading"
import { Button } from "@/components/ui/Button"
import { Tag } from "@/components/ui/Tag"
import { PropertyFormDialog } from "@/components/property/PropertyFormDialog"
import { AreaComparison } from "@/components/property/AreaComparison"
import { PropertyConsumptionSection } from "@/components/consumption/ConsumptionSection"
import { MeterSection } from "@/components/meter/MeterSection"
import { IconCircle } from "@/components/ui/IconCircle"
import { LiveKpiCard } from "@/components/dashboard/LiveKpiCard"
import { RealtimeChartCard } from "@/components/realtime/RealtimeChartCard"
import { formatPowerKw, formatKwhPrice, formatBrl } from "@/lib/format"
import { formatKw as formatContractedDemandKw } from "@/lib/formatters/consumption"
import {
    BILLING_CLASS_LABELS,
    ELECTRICAL_SYSTEM_LABELS,
    TARIFF_MODALITY_LABELS,
    TARIFF_SUBGROUP_LABELS,
    type Property,
} from "@/types/property.types"
import type { Distributor } from "@/types/distributor.types"

/**
 * Detalhe da propriedade na Análise — LumiTrack Home v2.dc.html,
 * `propDetailView`. Vive à direita da árvore de seleção (`AnalysisLayout`).
 *
 * Estrutura:
 *   1. Card de dados (nome, endereço, distribuidora, faturamento) com
 *      "Editar" e, ao lado, o card do Medidor
 *   2. KPI "Potência agora" (só com medidor)
 *   3. Consumo em tempo real
 *   4. Comparação de áreas
 *   5. Histórico de consumo (mês/ano, fatura Grupo A e Tarifa Branca)
 *
 * Criar e excluir a propriedade vivem em Configurações → Cadastro; aqui só
 * se edita. O histórico (5) não está no protótipo e fica abaixo dos blocos
 * dele. As queries rodam em paralelo — `enabled`/`targetId` opcional em cada
 * hook evita disparos fadados ao erro antes do id resolver.
 */
export const PropertyDetailsPage = () => {
    const { id } = useParams<{ id: string }>()

    const propertyQuery = useProperty(id)
    const distributorQuery = useDistributor(propertyQuery.data?.distributorId)
    // Catálogo completo de distribuidoras — pro select do modal de edição
    // (distributorQuery acima é só a distribuidora JÁ vinculada, pras tags).
    const distributorsQuery = useDistributors(1, 31)
    // KPI "Potência agora" — mesma fonte que MeterSection usa internamente
    // (useMeterByTarget dedupe via cache do TanStack Query, sem query extra
    // de verdade) + useLiveMeterReading (SSE, com fallback REST) pra
    // potência mais recente conhecida.
    const meterQuery = useMeterByTarget("PROPERTY", id)
    const { lastKnownPowerW } = useLiveMeterReading("PROPERTY", id, meterQuery.data?.id)

    // Loading só do primeiro nível (property). Distributor carregando depois
    // não bloqueia a página inteira — mostramos um placeholder local.
    if (propertyQuery.isLoading) return <DetailsSkeleton />

    // Erro ao carregar a propriedade é fatal — sem ela não tem o que mostrar.
    if (propertyQuery.isError || !propertyQuery.data) {
        return (
            <ErrorState
                message={
                    propertyQuery.error instanceof Error
                        ? propertyQuery.error.message
                        : "Propriedade não encontrada"
                }
            />
        )
    }

    const property = propertyQuery.data
    const distributor = distributorQuery.data
    const meter = meterQuery.data

    return (
        <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 items-start gap-[clamp(14px,1.6vw,20px)] xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <PropertyHeaderCard
                    property={property}
                    distributor={distributor}
                    isDistributorLoading={distributorQuery.isLoading}
                    distributors={distributorsQuery.data?.items ?? []}
                />
                <MeterSection targetType="PROPERTY" targetId={property.id} />
            </div>

            {meter && (
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
                    className="w-fit min-w-[220px]"
                />
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

            <AreaComparison propertyId={property.id} />

            <PropertyConsumptionSection
                propertyId={property.id}
                tariffGroup={property.tariffGroup}
                groupBModality={property.groupBModality}
            />
        </div>
    )
}

interface PropertyHeaderCardProps {
    property: Property
    distributor: Distributor | undefined
    isDistributorLoading: boolean
    distributors: Distributor[]
}

const PropertyHeaderCard = ({
    property,
    distributor,
    isDistributorLoading,
    distributors,
}: PropertyHeaderCardProps) => {
    const addressLine = formatAddress(property)
    const [isEditOpen, setIsEditOpen] = useState(false)

    return (
        <div className="blueprint p-26px">
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />

            {/* Linha superior: ícone + título/endereço + ações */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="gap-15px flex min-w-0 items-start">
                    <IconCircle icon={Home} tone="accent" strokeWidth={1.5} />
                    <div className="min-w-0">
                        <h2 className="font-heading truncate text-[clamp(24px,2.6vw,32px)] leading-none font-semibold uppercase">
                            {property.name}
                        </h2>
                        {addressLine && (
                            <p className="text-muted mt-2 flex items-center gap-1.5 text-sm">
                                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span className="truncate">{addressLine}</span>
                            </p>
                        )}
                    </div>
                </div>

                {/* Ações */}
                <div className="flex flex-wrap items-center gap-2">
                    {property.contractingEnvironment === "ACL" && (
                        <Button asChild variant="secondary" size="sm">
                            <Link to={`/propriedades/${property.id}/comparacao-acl`}>
                                <Scale className="h-4 w-4" aria-hidden="true" />
                                Comparar ACR × ACL
                            </Link>
                        </Button>
                    )}
                    {property.groupBModality === "WHITE" && (
                        <Button asChild variant="secondary" size="sm">
                            <Link to={`/propriedades/${property.id}/comparacao-branca`}>
                                <Scale className="h-4 w-4" aria-hidden="true" />
                                Comparar Convencional × Branca
                            </Link>
                        </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={() => setIsEditOpen(true)}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        Editar
                    </Button>
                </div>
            </div>

            {/* Tags — distribuidora vinculada */}
            <div className="border-divider mt-22px pt-18px border-t">
                <div className="font-heading text-muted text-11 mb-3 font-semibold tracking-[.08em] uppercase">
                    Distribuidora vinculada
                </div>
                <DistributorTags distributor={distributor} isLoading={isDistributorLoading} />
            </div>

            {/* Tags — faturamento da própria propriedade */}
            <div className="border-divider mt-18px pt-18px border-t">
                <div className="font-heading text-muted text-11 mb-3 font-semibold tracking-[.08em] uppercase">
                    Faturamento
                </div>
                <div className="gap-9px flex flex-wrap">
                    <Tag variant="outline">
                        {ELECTRICAL_SYSTEM_LABELS[property.electricalSystem]}
                    </Tag>
                    {property.tariffGroup === "GROUP_A" ? (
                        <>
                            {property.tariffSubgroup && (
                                <Tag variant="outline">
                                    {TARIFF_SUBGROUP_LABELS[property.tariffSubgroup]}
                                </Tag>
                            )}
                            {property.tariffModality && (
                                <Tag variant="outline">
                                    {TARIFF_MODALITY_LABELS[property.tariffModality]}
                                </Tag>
                            )}
                            {property.contractedDemandKw !== null && (
                                <Tag variant="outline">
                                    Demanda contratada:{" "}
                                    {formatContractedDemandKw(property.contractedDemandKw)}
                                </Tag>
                            )}
                        </>
                    ) : (
                        property.billingClass && (
                            <Tag variant="outline">
                                {BILLING_CLASS_LABELS[property.billingClass]}
                            </Tag>
                        )
                    )}
                    {property.publicLightingFeeBrl !== null && (
                        <Tag variant="outline">CIP: {formatBrl(property.publicLightingFeeBrl)}</Tag>
                    )}
                    {property.contractingEnvironment === "ACL" && (
                        <Tag variant="accent-2">Mercado Livre (ACL)</Tag>
                    )}
                    {property.groupBModality === "WHITE" && (
                        <Tag variant="accent-2">Tarifa Branca</Tag>
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
                className="gap-9px flex flex-wrap"
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
        <div className="gap-9px flex flex-wrap">
            <Tag variant="accent" className="font-semibold">
                {distributor.name}
            </Tag>
            <Tag variant="neutral">{distributor.state}</Tag>
            <Tag variant="neutral">TUSD {formatKwhPrice(distributor.tusdPerKwh)}</Tag>
            <Tag variant="neutral">TE {formatKwhPrice(distributor.tePerKwh)}</Tag>
        </div>
    )
}

// Estados auxiliares

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
            <Link to="/propriedades">Voltar para a análise</Link>
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
