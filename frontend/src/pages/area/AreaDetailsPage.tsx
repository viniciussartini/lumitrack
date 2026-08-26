import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { AlertCircle, ArrowLeft, Cpu, LayoutGrid, Pencil, Plus } from "lucide-react"
import { useArea } from "@/hooks/queries/useAreas"
import { useProperty } from "@/hooks/queries/useProperties"
import { useMeterByTarget } from "@/hooks/queries/useMeters"
import { useConsumption, useConsumptionSummary } from "@/hooks/queries/useConsumption"
import { useDevices } from "@/hooks/queries/useDevices"
import { useRealtime } from "@/contexts/RealtimeContext"
import { Button } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { Tag } from "@/components/ui/Tag"
import { AreaMenu } from "@/components/area/AreaMenu"
import { AreaFormDialog } from "@/components/area/AreaFormDialog"
import { DeviceFormDialog } from "@/components/device/DeviceFormDialog"
import { DeviceCard } from "@/components/device/DeviceCard"
import { AreaConsumptionSection } from "@/components/consumption/ConsumptionSection"
import { ComparisonBars } from "@/components/consumption/ComparisonBars"
import { MeterSection } from "@/components/meter/MeterSection"
import { RealtimeChartCard } from "@/components/realtime/RealtimeChartCard"
import { formatPowerKw } from "@/lib/format"
import { formatKwh } from "@/lib/formatters/consumption"
import type { Area } from "@/types/area.types"
import type { Property } from "@/types/property.types"
import type { ConsumptionBucket } from "@/types/consumption.types"

/**
 * Página de detalhes de uma área — LumiTrack Home.dc.html, `areaDetailView`.
 *
 * Estrutura:
 *   1. Breadcrumb / voltar pra propriedade pai
 *   2. Header em blueprint: nome + descrição + tags (propriedade pai +
 *      kWh/mês da própria área) + ações (Editar área / ⋯)
 *   3. KPI "Potência agora" (só quando há medidor com leitura real — mesma
 *      decisão de "sem inventar dado": Consumo hoje/Custo projetado ficam de
 *      fora por não terem dado/lógica real)
 *   4. Seção de Medidor
 *   5. Seção de Consumo (histórico real — ocupa o lugar do gráfico "ao vivo"
 *      bespoke do protótipo)
 *   6. Seção de Dispositivos (grid + comparação de consumo do mês)
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
    // KPI "Potência agora" + tag de kWh/mês — mesma fonte que MeterSection
    // usa internamente (useMeterByTarget dedupe via cache do TanStack Query)
    // + useRealtime (SSE) pra leitura ao vivo.
    const meterQuery = useMeterByTarget("AREA", areaId)
    const hasMeter = Boolean(meterQuery.data)
    const monthlyQuery = useConsumption("AREA", hasMeter ? areaId : undefined, "month", 1, 3)
    const { readingsByMeterId } = useRealtime()
    // Estado (não Date.now() direto) pra recalcular a "idade" da leitura
    // periodicamente sem violar a regra de pureza de render — mesmo padrão
    // de MeterSection.tsx/PropertyDetailsPage.tsx.
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 2_000)
        return () => clearInterval(interval)
    }, [])

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
                    propertyId={propertyId}
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
    const meter = meterQuery.data
    const reading = meter ? readingsByMeterId[meter.id] : undefined
    const isReadingStale = !reading || now - new Date(reading.receivedAt).getTime() > 10_000
    const monthlyBucket = latestBucket(monthlyQuery.data?.items ?? [])

    const handleAfterDelete = () => {
        // Após excluir, volta pra propriedade pai. replace evita que o
        // botão "voltar" do navegador traga de volta a página da área que
        // não existe mais.
        void navigate(`/propriedades/${propertyId}`, { replace: true })
    }

    return (
        <div className="flex flex-col gap-6">
            <BackLink propertyId={propertyId} />

            <AreaHeaderCard
                area={area}
                property={property}
                isPropertyLoading={propertyQuery.isLoading}
                monthlyBucket={monthlyBucket}
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
                    targetType="AREA"
                    targetId={areaId!}
                    meterId={meter.id}
                    title="Consumo em tempo real"
                    subtitle={area.name}
                />
            )}

            <MeterSection targetType="AREA" targetId={areaId!} />
            <AreaConsumptionSection propertyId={propertyId!} areaId={areaId!} />
            <DevicesSection propertyId={propertyId!} areaId={areaId!} />
        </div>
    )
}

/** Bucket com `bucketStart` mais recente — mesma lógica de AreasSection. */
const latestBucket = (items: ConsumptionBucket[]): ConsumptionBucket | null => {
    if (items.length === 0) return null
    return items.reduce((latest, bucket) =>
        new Date(bucket.bucketStart) > new Date(latest.bucketStart) ? bucket : latest,
    )
}

interface BackLinkProps {
    propertyId: string | undefined
}

const BackLink = ({ propertyId }: BackLinkProps) => (
    <Link
        to={propertyId ? `/propriedades/${propertyId}` : "/propriedades"}
        className="text-muted hover:text-text inline-flex w-fit items-center gap-1.5 text-sm"
    >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Voltar para propriedade
    </Link>
)

interface AreaHeaderCardProps {
    area: Area
    property: Property | undefined
    isPropertyLoading: boolean
    monthlyBucket: ConsumptionBucket | null
    onAfterDelete: () => void
}

const AreaHeaderCard = ({
    area,
    property,
    isPropertyLoading,
    monthlyBucket,
    onAfterDelete,
}: AreaHeaderCardProps) => {
    const [isEditOpen, setIsEditOpen] = useState(false)

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
                    <LayoutGrid className="h-[26px] w-[26px]" strokeWidth={1.5} />
                </span>
                <div className="min-w-0 flex-1">
                    <h1 className="font-heading truncate text-[clamp(24px,2.6vw,32px)] leading-none font-semibold uppercase">
                        {area.name}
                    </h1>
                    {area.description && (
                        <p className="text-muted mt-2 text-sm">{area.description}</p>
                    )}
                </div>
            </div>

            <div className="mt-[18px] flex flex-wrap gap-[9px]">
                <PropertyTag property={property} isLoading={isPropertyLoading} />
                {monthlyBucket && (
                    <Tag variant="neutral">{formatKwh(monthlyBucket.kwhConsumed)} kWh/mês</Tag>
                )}
            </div>

            <div className="mt-[22px] flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setIsEditOpen(true)}>
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    Editar área
                </Button>
                {/*
                    showEdit=false: botão "Editar área" explícito acima,
                    no menu sobra apenas Excluir.
                */}
                <AreaMenu area={area} showEdit={false} onAfterDelete={onAfterDelete} />
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

interface DevicesSectionProps {
    propertyId: string
    areaId: string
}

/**
 * Seção de Dispositivos — grid de DeviceCards + comparação de consumo do
 * mês entre eles.
 *
 * O consumo mensal por dispositivo (usado tanto no chip de potência de cada
 * DeviceCard — que é a potência nominal, não este dado — quanto nas barras
 * de comparação) é buscado numa única chamada via `useConsumptionSummary`
 * (issue #283 — substitui o `useQueries` de N chamadas, uma por
 * dispositivo). Dispositivo sem medidor/sem leitura simplesmente não
 * aparece no resultado — não é erro, só fica de fora da comparação.
 */
const DevicesSection = ({ propertyId, areaId }: DevicesSectionProps) => {
    const devicesQuery = useDevices(propertyId, areaId)
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [comparisonUnit, setComparisonUnit] = useState<"kwh" | "reais">("kwh")
    const devices = devicesQuery.data?.items ?? []

    const summaryQuery = useConsumptionSummary(
        "DEVICE",
        devices.map((d) => d.id),
        "month",
    )
    const bucketById = new Map(
        (summaryQuery.data?.items ?? []).map((item) => [item.id, item as ConsumptionBucket]),
    )

    const comparisonRows = devices
        .map((device) => ({
            id: device.id,
            label: device.name,
            bucket: bucketById.get(device.id),
        }))
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
                    <h2 className="font-heading text-[17px] font-semibold uppercase">
                        Dispositivos
                    </h2>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setIsCreateOpen(true)}
                        className="min-h-9 text-[13px]"
                    >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        Adicionar dispositivo
                    </Button>
                </div>

                <div className="px-5 py-4">
                    {devicesQuery.isLoading && <DevicesSkeleton />}

                    {devicesQuery.isError && (
                        <div
                            role="alert"
                            className="border-status-danger/40 flex items-start gap-3 border p-4"
                        >
                            <AlertCircle
                                className="text-status-danger h-5 w-5 shrink-0"
                                aria-hidden="true"
                            />
                            <p className="text-status-danger/85 text-sm">
                                {devicesQuery.error instanceof Error
                                    ? devicesQuery.error.message
                                    : "Não foi possível carregar os dispositivos."}
                            </p>
                        </div>
                    )}

                    {devicesQuery.isSuccess && devices.length === 0 && (
                        <EmptyState
                            icon={Cpu}
                            title="Nenhum dispositivo cadastrado"
                            description="Cadastre os dispositivos desta área para monitorar o consumo individual de cada equipamento."
                        />
                    )}

                    {devicesQuery.isSuccess && devices.length > 0 && (
                        <div
                            className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3"
                            data-testid="devices-grid"
                        >
                            {devices.map((device) => (
                                <DeviceCard key={device.id} device={device} />
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
                                Comparação de dispositivos
                            </span>
                            <span className="text-muted mt-[3px] block text-[12.5px]">
                                Consumo por dispositivo neste mês (
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

            <DeviceFormDialog
                isOpen={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                mode={{ kind: "create", propertyId, areaId }}
            />
        </section>
    )
}

const DevicesSkeleton = () => (
    <div
        className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3"
        aria-busy="true"
        aria-label="Carregando dispositivos"
    >
        {[0, 1, 2].map((i) => (
            <div key={i} className="border-divider h-28 animate-pulse border" />
        ))}
    </div>
)

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
