import { useState } from "react"
import { AlertCircle, LineChart } from "lucide-react"
import { EmptyState } from "@/components/ui/EmptyState"
import { Pagination } from "@/components/ui/Pagination"
import { GranularityTabs } from "@/components/consumption/GranularityTabs"
import { ConsumptionChart } from "@/components/consumption/ConsumptionChart"
import { ConsumptionTable } from "@/components/consumption/ConsumptionTable"
import { useConsumption } from "@/hooks/queries/useConsumption"
import { useMeterByTarget } from "@/hooks/queries/useMeters"
import { cn } from "@/lib/cn"
import { DEFAULT_PAGE_SIZE } from "@/types/pagination.types"
import { DETAILS_GRANULARITIES, type Granularity } from "@/types/consumption.types"
import type { TargetType } from "@/types/meter.types"

// Wrappers "smart" — mesmo padrão de 3 por target usado no resto do app
// (AlertSection antes da Fase 5, DeviceAlertSection, etc). propertyId/areaId
// continuam na assinatura para não obrigar as details pages a mudar como
// chamam o componente — só targetId (o id do próprio nível) é usado de fato,
// já que /api/consumption resolve a propriedade raiz internamente.

interface PropertyConsumptionSectionProps {
    propertyId: string
}

export const PropertyConsumptionSection = ({
    propertyId,
}: PropertyConsumptionSectionProps) => (
    <ConsumptionSection targetType="PROPERTY" targetId={propertyId} />
)

interface AreaConsumptionSectionProps {
    propertyId: string
    areaId: string
}

export const AreaConsumptionSection = ({ areaId }: AreaConsumptionSectionProps) => (
    <ConsumptionSection targetType="AREA" targetId={areaId} />
)

interface DeviceConsumptionSectionProps {
    propertyId: string
    areaId: string
    deviceId: string
}

export const DeviceConsumptionSection = ({
    deviceId,
}: DeviceConsumptionSectionProps) => (
    <ConsumptionSection targetType="DEVICE" targetId={deviceId} />
)

// Presentational + orquestração de dados

interface ConsumptionSectionProps {
    targetType: TargetType
    targetId: string
    /** Granularidades disponíveis — Hora|Dia nas details pages (default),
     * os 4 níveis em /relatorios. */
    granularities?: readonly Granularity[]
}

export const ConsumptionSection = ({
    targetType,
    targetId,
    granularities = DETAILS_GRANULARITIES,
}: ConsumptionSectionProps) => {
    const [granularity, setGranularity] = useState<Granularity>(granularities[0]!)
    const [page, setPage] = useState(1)

    // Sem medidor vinculado, /api/consumption devolve 404 — checamos
    // primeiro se existe medidor pra distinguir "sem medidor" (EmptyState
    // orientando a configurar um) de qualquer outro erro real.
    const meterQuery = useMeterByTarget(targetType, targetId)
    const hasMeter = Boolean(meterQuery.data)

    // Só dispara a query quando já sabemos que há medidor — evita uma
    // chamada fadada ao 404 "sem medidor" enquanto o meterQuery ainda
    // não resolveu (ou resolveu para null).
    const query = useConsumption(
        targetType,
        hasMeter ? targetId : undefined,
        granularity,
        page,
        DEFAULT_PAGE_SIZE,
    )

    const handleGranularityChange = (next: Granularity) => {
        setGranularity(next)
        setPage(1)
    }

    const buckets = query.data?.items ?? []

    return (
        <section className="flex flex-col gap-3" data-testid="consumption-section">
            <header className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Consumo
                </h2>
            </header>

            <GranularityTabs
                granularities={granularities}
                value={granularity}
                onChange={handleGranularityChange}
            />

            {!meterQuery.isLoading && !hasMeter && (
                <EmptyState
                    icon={LineChart}
                    title="Sem consumo para exibir"
                    description="Configure um medidor na seção acima para começar a acompanhar o consumo automaticamente."
                />
            )}

            {hasMeter && query.isLoading && <SectionSkeleton />}

            {hasMeter && query.isError && (
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
                        {query.error instanceof Error
                            ? query.error.message
                            : "Não foi possível carregar o consumo."}
                    </p>
                </div>
            )}

            {hasMeter && query.isSuccess && buckets.length === 0 && (
                <EmptyState
                    icon={LineChart}
                    title="Sem leituras neste período"
                    description="Ainda não há consumo agregado para a granularidade selecionada."
                />
            )}

            {hasMeter && query.isSuccess && buckets.length > 0 && (
                <>
                    <ConsumptionChart
                        buckets={buckets}
                        granularity={granularity}
                        isRefetching={query.isFetching}
                    />
                    <ConsumptionTable buckets={buckets} granularity={granularity} />
                    <Pagination
                        page={query.data!.page}
                        pageSize={query.data!.pageSize}
                        total={query.data!.total}
                        onPageChange={setPage}
                    />
                </>
            )}
        </section>
    )
}

const SectionSkeleton = () => (
    <div
        className="flex flex-col gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800"
        aria-busy="true"
        aria-label="Carregando consumo"
        data-testid="consumption-section-skeleton"
    >
        {[0, 1, 2].map((i) => (
            <div
                key={i}
                className="h-10 animate-pulse rounded bg-slate-100 dark:bg-slate-800/50"
            />
        ))}
    </div>
)
