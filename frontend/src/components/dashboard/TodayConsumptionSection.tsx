import { useId } from "react"
import { ChevronDown, ChevronRight, Cpu, Home, LayoutGrid } from "lucide-react"
import { SectionError, SectionSkeleton } from "@/components/ui/SectionState"
import { Blueprint } from "@/components/ui/Blueprint"
import { usePropertyTree } from "@/hooks/queries/usePropertyTree"
import { useTodayConsumption } from "@/hooks/useTodayConsumption"
import { useTodayTree, type TodayTreeContext } from "@/hooks/useTodayTree"
import { buildAnalysisTree, type AnalysisNode } from "@/lib/analysisTree"
import { formatTodayCost, formatTodayKwh } from "@/lib/todayConsumption"
import type { ConsumptionSummaryItem } from "@/types/consumption.types"
import type { PropertyTreeNode } from "@/types/property.types"

const KIND_ICON = { property: Home, area: LayoutGrid, device: Cpu } as const

interface TodayConsumptionSectionProps {
    propertyId: string
    propertyName: string
}

/**
 * "Consumo de hoje" do Painel (LumiTrack Home v2.dc.html, Painel): a
 * propriedade selecionada e, ao expandir, as áreas e os dispositivos dela, com
 * o kWh e o R$ do dia. A hierarquia vem da árvore de cadastro e os valores do
 * resumo de consumo, em um pedido por tipo de alvo.
 *
 * Cada nível tem o seu medidor, então o total de um nó não é a soma dos
 * filhos. Nó sem medidor ou sem leitura hoje mostra "-", e o R$ também quando
 * o custo não é calculável para o nó (Grupo A e Tarifa Branca, abaixo da
 * propriedade): ausência, nunca 0.
 */
export const TodayConsumptionSection = ({
    propertyId,
    propertyName,
}: TodayConsumptionSectionProps) => {
    const treeQuery = usePropertyTree()
    const property = treeQuery.data?.items.find((item) => item.id === propertyId)

    return (
        <Blueprint className="p-0" data-testid="today-consumption-section">
            <div className="border-divider border-b px-5 py-4">
                <span className="font-heading text-17 font-semibold uppercase">
                    Consumo de hoje
                </span>
                <span className="text-muted text-12-5 mt-0.5 block">
                    {propertyName} · abra a hierarquia para ver áreas e dispositivos
                </span>
            </div>
            {treeQuery.isPending && (
                <SectionSkeleton
                    label="Carregando consumo de hoje"
                    testId="today-consumption-skeleton"
                />
            )}
            {treeQuery.isError && (
                <SectionError
                    message="Não foi possível carregar a hierarquia."
                    onRetry={() => void treeQuery.refetch()}
                />
            )}
            {treeQuery.isSuccess && !property && (
                <p role="status" className="text-muted text-13 m-0 px-5 py-6 text-center">
                    Esta propriedade não está na hierarquia carregada.
                </p>
            )}
            {property && <TodayBody property={property} />}
        </Blueprint>
    )
}

const TodayBody = ({ property }: { property: PropertyTreeNode }) => {
    const today = useTodayConsumption(property)

    if (today.isLoading)
        return (
            <SectionSkeleton
                label="Carregando consumo de hoje"
                testId="today-consumption-skeleton"
            />
        )
    if (today.isError) {
        return (
            <SectionError
                message="Não foi possível carregar o consumo de hoje."
                onRetry={today.refetch}
            />
        )
    }

    return (
        <>
            {today.byId.size === 0 && (
                <p
                    role="status"
                    className="text-muted text-13 border-divider m-0 border-b px-5 py-4"
                >
                    Nenhum medidor com leitura hoje nesta propriedade.
                </p>
            )}
            <TodayTree property={property} byId={today.byId} />
        </>
    )
}

interface TodayTreeProps {
    property: PropertyTreeNode
    byId: ReadonlyMap<string, ConsumptionSummaryItem>
}

const TodayTree = ({ property, byId }: TodayTreeProps) => {
    const nodes = buildAnalysisTree([property], "")
    const { context, handleKeyDown } = useTodayTree(nodes)

    return (
        <div
            role="tree"
            aria-label="Consumo de hoje por propriedade, área e dispositivo"
            onKeyDown={handleKeyDown}
        >
            {nodes.map((node) => (
                <TodayNode key={node.id} node={node} level={1} context={context} byId={byId} />
            ))}
        </div>
    )
}

/** O que o leitor de tela diz de um valor ausente, no lugar do "-" do desenho. */
const spoken = (text: string): string => (text === "-" ? "sem dado" : text)

interface TodayNodeProps {
    node: AnalysisNode
    level: 1 | 2 | 3
    context: TodayTreeContext
    byId: ReadonlyMap<string, ConsumptionSummaryItem>
}

/**
 * Linha da tabela e, quando há filhos, o grupo recolhível logo abaixo. O grupo
 * é da linha por `aria-owns`; recolhido, sai do foco (`inert`) e da leitura
 * (`aria-hidden`), mas continua no DOM para a transição de altura.
 */
const TodayNode = ({ node, level, context, byId }: TodayNodeProps) => {
    const groupId = useId()
    const hasChildren = node.children.length > 0

    return (
        <div role="none">
            <TodayRow
                node={node}
                level={level}
                context={context}
                item={byId.get(node.id)}
                groupId={hasChildren ? groupId : undefined}
            />
            {hasChildren && (
                <div
                    id={groupId}
                    role="group"
                    className="lt-collapse"
                    data-open={context.isOpen(node)}
                    inert={!context.isOpen(node)}
                    aria-hidden={!context.isOpen(node)}
                >
                    <div>
                        {node.children.map((child) => (
                            <TodayNode
                                key={child.id}
                                node={child}
                                level={Math.min(level + 1, 3) as 2 | 3}
                                context={context}
                                byId={byId}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

interface TodayRowProps {
    node: AnalysisNode
    level: 1 | 2 | 3
    context: TodayTreeContext
    item: ConsumptionSummaryItem | undefined
    /** Id do grupo de filhos; ausente numa folha. */
    groupId: string | undefined
}

/**
 * A linha é o `treeitem` (foco e teclado) e leva os valores no próprio nome:
 * os dois valores do desenho ficam fora da leitura para não serem lidos duas
 * vezes.
 */
const TodayRow = ({ node, level, context, item, groupId }: TodayRowProps) => {
    const isOpen = context.isOpen(node)
    const Icon = KIND_ICON[node.kind]
    const Chevron = isOpen ? ChevronDown : ChevronRight
    const kwh = formatTodayKwh(item)
    const cost = formatTodayCost(item)

    return (
        <div
            ref={(element) => context.registerItem(node.id, element)}
            role="treeitem"
            className="lt-today-row"
            data-tree-id={node.id}
            data-level={level}
            aria-label={`${node.name}: consumo de hoje ${spoken(kwh)}, custo ${spoken(cost)}`}
            aria-level={level}
            {...(groupId && { "aria-expanded": isOpen, "aria-owns": groupId })}
            tabIndex={context.tabbableId === node.id ? 0 : -1}
            onClick={() => context.toggle(node)}
            onFocus={() => context.onFocusItem(node.id)}
        >
            <span className="text-muted flex h-3.5 w-3.5 shrink-0" aria-hidden="true">
                {groupId && <Chevron className="h-3.5 w-3.5" strokeWidth={1.6} />}
            </span>
            <Icon
                className="text-accent h-3.5 w-3.5 shrink-0"
                strokeWidth={1.6}
                aria-hidden="true"
            />
            <span className="lt-today-name">{node.name}</span>
            <span className="lt-today-kwh" aria-hidden="true">
                {kwh}
            </span>
            <span className="lt-today-cost" aria-hidden="true">
                {cost}
            </span>
        </div>
    )
}
