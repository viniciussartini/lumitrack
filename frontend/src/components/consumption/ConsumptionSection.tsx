import { useState } from "react"
import { AlertCircle, LineChart, ReceiptText } from "lucide-react"
import { EmptyState } from "@/components/ui/EmptyState"
import { Pagination } from "@/components/ui/Pagination"
import { GranularityTabs } from "@/components/consumption/GranularityTabs"
import { HourWindowSelect } from "@/components/consumption/HourWindowSelect"
import { ConsumptionChart } from "@/components/consumption/ConsumptionChart"
import { ConsumptionTable } from "@/components/consumption/ConsumptionTable"
import { GroupABillCard } from "@/components/consumption/GroupABillCard"
import { useConsumption } from "@/hooks/queries/useConsumption"
import { useMeterByTarget } from "@/hooks/queries/useMeters"
import { describeConsumptionWindow, resolveConsumptionWindow } from "@/lib/consumptionWindow"
import {
    CONSUMPTION_PAGE_SIZE,
    DETAILS_GRANULARITIES,
    type Granularity,
} from "@/types/consumption.types"
import type { TargetType } from "@/types/meter.types"
import type { TariffGroup } from "@/types/property.types"

// Wrappers "smart" — mesmo padrão de 3 por target usado no resto do app
// (AlertSection, DeviceAlertSection, etc). propertyId/areaId
// continuam na assinatura para não obrigar as details pages a mudar como
// chamam o componente — só targetId (o id do próprio nível) é usado de fato,
// já que /api/consumption resolve a propriedade raiz internamente.
//
// `tariffGroup` (da Propriedade raiz, carregada pela details page) decide o
// ramo de renderização — ver `ConsumptionSection` abaixo. Opcional: enquanto
// a query da propriedade ainda não resolveu, cai no ramo Grupo B (mesmo
// comportamento de sempre) até o valor real chegar.

interface PropertyConsumptionSectionProps {
    propertyId: string
    tariffGroup?: TariffGroup
}

export const PropertyConsumptionSection = ({
    propertyId,
    tariffGroup,
}: PropertyConsumptionSectionProps) => (
    <ConsumptionSection targetType="PROPERTY" targetId={propertyId} tariffGroup={tariffGroup} />
)

interface AreaConsumptionSectionProps {
    propertyId: string
    areaId: string
    tariffGroup?: TariffGroup
}

export const AreaConsumptionSection = ({ areaId, tariffGroup }: AreaConsumptionSectionProps) => (
    <ConsumptionSection targetType="AREA" targetId={areaId} tariffGroup={tariffGroup} />
)

interface DeviceConsumptionSectionProps {
    propertyId: string
    areaId: string
    deviceId: string
    tariffGroup?: TariffGroup
}

export const DeviceConsumptionSection = ({
    deviceId,
    tariffGroup,
}: DeviceConsumptionSectionProps) => (
    <ConsumptionSection targetType="DEVICE" targetId={deviceId} tariffGroup={tariffGroup} />
)

// Presentational + orquestração de dados

interface ConsumptionSectionProps {
    targetType: TargetType
    targetId: string
    tariffGroup?: TariffGroup
    /** Granularidades disponíveis — Hora|Dia nas details pages (default),
     * os 4 níveis em /relatorios. */
    granularities?: readonly Granularity[]
}

/**
 * Dispatcher sem hooks próprios — ramifica por grupo tarifário antes de
 * qualquer dado ser buscado, então cada ramo vira um componente próprio com
 * seus próprios hooks (troca de subárvore inteira, nunca hook condicional
 * dentro de um mesmo componente). Grupo B é o comportamento de sempre,
 * inalterado; Grupo A só faz sentido no nível Propriedade (demanda
 * contratada é conceito mensal da UC inteira) — Área/Aparelho mostram um
 * aviso em vez de consultar uma granularidade que o backend rejeitaria.
 *
 * `"use no memo"`: `GroupBConsumptionSection` lê `new Date()` diretamente no
 * corpo do componente (não é um valor rastreável por dependências). Se o
 * React Compiler memoizar o elemento retornado aqui por identidade de props,
 * um re-render deste dispatcher com as mesmas props (ex.: só o relógio
 * mudou, sem nenhuma prop/estado novo) reaproveitaria o elemento antigo e
 * pularia a re-execução do filho — a hora "atual" ficaria presa no valor de
 * quando a virada de dia ainda não tinha acontecido — reproduzível só depois
 * que este dispatcher passou a existir acima do componente que lê o relógio.
 */
export const ConsumptionSection = ({
    targetType,
    targetId,
    tariffGroup,
    granularities = DETAILS_GRANULARITIES,
}: ConsumptionSectionProps) => {
    "use no memo"

    if (tariffGroup === "GROUP_A" && targetType !== "PROPERTY") {
        return (
            <EmptyState
                icon={ReceiptText}
                title="Detalhamento não disponível para o Grupo A"
                description="Demanda contratada e consumo por posto são apurados para a propriedade inteira — consulte a conta na página da propriedade."
            />
        )
    }

    if (tariffGroup === "GROUP_A") {
        return <GroupABillSection targetType={targetType} targetId={targetId} />
    }

    return (
        <GroupBConsumptionSection
            targetType={targetType}
            targetId={targetId}
            granularities={granularities}
        />
    )
}

interface GroupBConsumptionSectionProps {
    targetType: TargetType
    targetId: string
    granularities: readonly Granularity[]
}

const GroupBConsumptionSection = ({
    targetType,
    targetId,
    granularities,
}: GroupBConsumptionSectionProps) => {
    const [granularity, setGranularity] = useState<Granularity>(granularities[0]!)
    const [page, setPage] = useState(1)
    // `now` capturado uma única vez por render e reaproveitado em tudo que
    // depende da hora corrente, pra currentHour e a janela consultada nunca
    // divergirem entre si (a legenda dizendo uma janela, a query buscando
    // outra) bem na virada da hora.
    const now = new Date()
    const currentHour = now.getHours()
    // Hora consultada quando a granularidade é "hour" — default a hora
    // corrente, sobreposto quando o usuário escolhe outra hora já passada
    // do dia. Clampada a currentHour: se o usuário deixa a aba aberta
    // durante a virada do dia, a hora escolhida (ex.: 23h) pode passar a
    // ser maior que a nova hora corrente (0h) — sem o clamp, o <select>
    // fica com um `value` sem `<option>` correspondente (em branco).
    const [selectedHour, setSelectedHour] = useState(currentHour)
    const effectiveHour = Math.min(selectedHour, currentHour)

    // Sem medidor vinculado, /api/consumption devolve 404 — checamos
    // primeiro se existe medidor pra distinguir "sem medidor" (EmptyState
    // orientando a configurar um) de qualquer outro erro real.
    const meterQuery = useMeterByTarget(targetType, targetId)
    const hasMeter = Boolean(meterQuery.data)

    // A granularidade escolhida é a janela; o bucket é o nível abaixo dela
    // (Hora → minuto a minuto, Dia → hora a hora). `resolveConsumptionWindow`
    // é barata (só monta alguns `Date`) e determinística a partir de
    // granularity/now/effectiveHour — sem necessidade de memoização: o
    // `from`/`to` resultante é o mesmo em qualquer render dentro da mesma
    // hora/dia, então a query key (que serializa em ISO string) não muda.
    const consumptionWindow = resolveConsumptionWindow(granularity, now, effectiveHour)

    // Só dispara a query quando já sabemos que há medidor — evita uma
    // chamada fadada ao 404 "sem medidor" enquanto o meterQuery ainda
    // não resolveu (ou resolveu para null).
    const query = useConsumption(
        targetType,
        hasMeter ? targetId : undefined,
        consumptionWindow.bucketSize,
        page,
        CONSUMPTION_PAGE_SIZE,
        // asc: a paginação percorre a janela do começo para o fim (19:00 na
        // primeira página, não na última).
        { from: consumptionWindow.from, to: consumptionWindow.to, order: "asc" },
    )

    const handleGranularityChange = (next: Granularity) => {
        setGranularity(next)
        setPage(1)
        // Volta pra hora corrente ao (re)entrar na aba "Hora" — ponto de
        // partida a cada entrada; o usuário escolhe outra hora a partir daqui.
        if (next === "hour") setSelectedHour(currentHour)
    }

    const handleHourChange = (hour: number) => {
        setSelectedHour(hour)
        setPage(1)
    }

    const buckets = query.data?.items ?? []

    return (
        <section className="flex flex-col gap-3" data-testid="consumption-section">
            <div className="blueprint">
                <i className="corner tl" />
                <i className="corner tr" />
                <i className="corner bl" />
                <i className="corner br" />

                <ConsumptionSectionHeader
                    granularity={granularity}
                    granularities={granularities}
                    selectedHour={effectiveHour}
                    currentHour={currentHour}
                    onGranularityChange={handleGranularityChange}
                    onHourChange={handleHourChange}
                />

                <div className="py-18px px-5">
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
                            className="border-status-danger/40 flex items-start gap-3 border p-4"
                        >
                            <AlertCircle
                                className="text-status-danger h-5 w-5 shrink-0"
                                aria-hidden="true"
                            />
                            <p className="text-status-danger/85 text-sm">
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
                            description="Ainda não há consumo agregado para o período selecionado."
                        />
                    )}

                    {hasMeter && query.isSuccess && buckets.length > 0 && (
                        <div className="flex flex-col gap-4">
                            <ConsumptionChart
                                buckets={buckets}
                                bucketSize={consumptionWindow.bucketSize}
                                isRefetching={query.isFetching}
                            />
                            <ConsumptionTable
                                buckets={buckets}
                                bucketSize={consumptionWindow.bucketSize}
                            />
                            <Pagination
                                page={query.data!.page}
                                pageSize={query.data!.pageSize}
                                total={query.data!.total}
                                onPageChange={setPage}
                            />
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}

interface GroupABillSectionProps {
    targetType: TargetType
    targetId: string
}

/**
 * Conta binômia do Grupo A — só existe no nível Propriedade (o
 * dispatcher acima garante isso). Sem seletor de mês/histórico ainda: mostra
 * sempre o mês mais recente com leitura (`page=1, pageSize=1`, sem `range` —
 * mesmo idioma de "últimos N buckets" já usado pelos KPIs do painel), não
 * necessariamente o mês corrente do calendário se ainda não há consumo nele.
 */
const GroupABillSection = ({ targetType, targetId }: GroupABillSectionProps) => {
    const meterQuery = useMeterByTarget(targetType, targetId)
    const hasMeter = Boolean(meterQuery.data)

    const query = useConsumption(targetType, hasMeter ? targetId : undefined, "month", 1, 1)
    const bucket = query.data?.items[0]

    return (
        <section className="flex flex-col gap-3" data-testid="consumption-section">
            <div className="blueprint">
                <i className="corner tl" />
                <i className="corner tr" />
                <i className="corner bl" />
                <i className="corner br" />

                <div className="border-divider flex items-center justify-between border-b px-5 py-4">
                    <div>
                        <h2 className="font-heading text-17 font-semibold uppercase">
                            Conta do mês
                        </h2>
                        <span className="text-muted text-12-5 mt-[3px] block">
                            Demanda contratada e consumo por posto tarifário
                        </span>
                    </div>
                </div>

                <div className="py-18px px-5">
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
                            className="border-status-danger/40 flex items-start gap-3 border p-4"
                        >
                            <AlertCircle
                                className="text-status-danger h-5 w-5 shrink-0"
                                aria-hidden="true"
                            />
                            <p className="text-status-danger/85 text-sm">
                                {query.error instanceof Error
                                    ? query.error.message
                                    : "Não foi possível carregar a conta."}
                            </p>
                        </div>
                    )}

                    {hasMeter && query.isSuccess && !bucket && (
                        <EmptyState
                            icon={ReceiptText}
                            title="Sem conta apurada ainda"
                            description="Ainda não há consumo neste mês para calcular a conta."
                        />
                    )}

                    {hasMeter && bucket && <GroupABillCard bucket={bucket} />}
                </div>
            </div>
        </section>
    )
}

interface ConsumptionSectionHeaderProps {
    granularity: Granularity
    granularities: readonly Granularity[]
    selectedHour: number
    currentHour: number
    onGranularityChange: (next: Granularity) => void
    onHourChange: (hour: number) => void
}

const ConsumptionSectionHeader = ({
    granularity,
    granularities,
    selectedHour,
    currentHour,
    onGranularityChange,
    onHourChange,
}: ConsumptionSectionHeaderProps) => (
    <div className="border-divider flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
            <h2 className="font-heading text-17 font-semibold uppercase">Histórico de consumo</h2>
            <span className="text-muted text-12-5 mt-[3px] block">
                {describeConsumptionWindow(granularity, selectedHour, currentHour)}
            </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
            {granularity === "hour" && (
                <HourWindowSelect
                    value={selectedHour}
                    onChange={onHourChange}
                    currentHour={currentHour}
                />
            )}
            <GranularityTabs
                granularities={granularities}
                value={granularity}
                onChange={onGranularityChange}
            />
        </div>
    </div>
)

const SectionSkeleton = () => (
    <div
        className="border-divider flex flex-col gap-2 border p-2"
        aria-busy="true"
        aria-label="Carregando consumo"
        data-testid="consumption-section-skeleton"
    >
        {[0, 1, 2].map((i) => (
            <div key={i} className="bg-divider h-10 animate-pulse" />
        ))}
    </div>
)
