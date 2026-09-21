import { useId, type ReactNode } from "react"
import { Link } from "react-router"
import { ChevronDown, ChevronRight, Cpu, Home, LayoutGrid, Search } from "lucide-react"
import { Blueprint } from "@/components/ui/Blueprint"
import { Button } from "@/components/ui/Button"
import { usePropertyTree } from "@/hooks/queries/usePropertyTree"
import { useAnalysisTree, type AnalysisTreeContext } from "@/hooks/useAnalysisTree"
import type { AnalysisNode } from "@/lib/analysisTree"
import type { PropertyTree } from "@/types/property.types"

const KIND_ICON = { property: Home, area: LayoutGrid, device: Cpu } as const

interface TreeNodeProps {
    node: AnalysisNode
    level: 1 | 2 | 3
    context: AnalysisTreeContext
}

/**
 * Linha selecionável da árvore e, quando há filhos, o grupo recolhível logo
 * abaixo. A linha é o `treeitem` (foco e teclado); o grupo é dela por
 * `aria-owns`; o `aria-label` fixa o nome da linha no próprio item, sem os
 * descendentes que o `aria-owns` traria para o nome por conteúdo.
 * O grupo recolhido sai do foco (`inert`) e da leitura (`aria-hidden`), mas
 * continua no DOM para a transição de altura.
 */
const TreeNode = ({ node, level, context }: TreeNodeProps) => {
    const groupId = useId()
    const hasChildren = node.children.length > 0
    const isOpen = context.isOpen(node)
    const Icon = KIND_ICON[node.kind]
    const Chevron = isOpen ? ChevronDown : ChevronRight
    const isSelected = node.id === context.selectedId

    return (
        <div role="none">
            <div
                ref={(element) => context.registerItem(node.id, element)}
                role="treeitem"
                className="lt-tree-row"
                data-tree-id={node.id}
                data-level={level}
                data-on={isSelected}
                aria-label={node.name}
                aria-level={level}
                aria-selected={isSelected}
                {...(hasChildren && { "aria-expanded": isOpen, "aria-owns": groupId })}
                tabIndex={context.tabbableId === node.id ? 0 : -1}
                onClick={() => context.onActivate(node)}
                onFocus={() => context.onFocusItem(node.id)}
            >
                <span className="text-muted flex h-3.5 w-3.5 shrink-0" aria-hidden="true">
                    {hasChildren && <Chevron className="h-3.5 w-3.5" strokeWidth={1.6} />}
                </span>
                <Icon
                    className="text-accent h-3.5 w-3.5 shrink-0"
                    strokeWidth={1.6}
                    aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">{node.name}</span>
            </div>
            {hasChildren && (
                <div
                    id={groupId}
                    role="group"
                    className="lt-collapse"
                    data-open={isOpen}
                    inert={!isOpen}
                    aria-hidden={!isOpen}
                >
                    <div>
                        {node.children.map((child) => (
                            <TreeNode
                                key={child.id}
                                node={child}
                                level={Math.min(level + 1, 3) as 2 | 3}
                                context={context}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

const TreeMessage = ({ children }: { children: ReactNode }) => (
    <div role="status" className="text-muted text-13 px-4 py-6 text-center">
        {children}
    </div>
)

interface TreeContentProps {
    tree: PropertyTree | undefined
    isPending: boolean
    isError: boolean
    onRetry: () => void
    nodes: AnalysisNode[]
    context: AnalysisTreeContext
    onKeyDown: ReturnType<typeof useAnalysisTree>["handleKeyDown"]
}

/** Estado de carregamento, erro ou vazio da hierarquia — ou a árvore em si. */
const TreeContent = ({
    tree,
    isPending,
    isError,
    onRetry,
    nodes,
    context,
    onKeyDown,
}: TreeContentProps) => {
    if (isPending) return <TreeMessage>Carregando hierarquia…</TreeMessage>
    if (isError) {
        return (
            <div role="alert" className="flex flex-col items-center gap-3 px-4 py-6">
                <p className="text-status-danger text-13 m-0 text-center">
                    Não foi possível carregar a hierarquia.
                </p>
                <Button variant="secondary" size="sm" onClick={onRetry}>
                    Tentar novamente
                </Button>
            </div>
        )
    }
    if (tree?.items.length === 0) {
        return (
            <TreeMessage>
                Nenhuma propriedade cadastrada.{" "}
                <Link to="/configuracoes/cadastro" className="text-accent-700 underline">
                    Cadastre em Configurações
                </Link>
                .
            </TreeMessage>
        )
    }
    if (nodes.length === 0) return <TreeMessage>Nenhum resultado para a busca.</TreeMessage>

    return (
        <div
            role="tree"
            aria-label="Hierarquia de propriedades, áreas e dispositivos"
            onKeyDown={onKeyDown}
        >
            {nodes.map((node) => (
                <TreeNode key={node.id} node={node} level={1} context={context} />
            ))}
        </div>
    )
}

/**
 * Hierarquia Propriedades → Áreas → Dispositivos de Análise, com busca. Clicar
 * (ou Enter/Espaço) numa linha abre o detalhe do item e expande/recolhe seus
 * filhos; a seleção vem da URL, então os links do Painel e das notificações
 * para as páginas de detalhe já a destacam. Com busca ativa, os nós com
 * resultado ficam expandidos. Teclado no padrão de árvore: setas, Home e End.
 */
export const AnalysisTree = () => {
    const treeQuery = usePropertyTree()
    const { query, setQuery, nodes, context, handleKeyDown } = useAnalysisTree(
        treeQuery.data?.items,
    )
    const tree = treeQuery.data
    const truncated = tree && tree.total > tree.items.length

    return (
        <aside className="lg:sticky lg:top-0">
            <Blueprint className="p-0">
                <div className="border-divider relative flex items-center border-b p-3.5">
                    <Search
                        className="text-muted pointer-events-none absolute left-6 h-4 w-4"
                        aria-hidden="true"
                    />
                    <input
                        type="search"
                        className="input text-13 w-full pl-10"
                        placeholder="Buscar na hierarquia"
                        aria-label="Buscar na hierarquia"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                </div>

                <div className="max-h-80 overflow-auto py-2 lg:max-h-[calc(100vh-268px)]">
                    <TreeContent
                        tree={tree}
                        isPending={treeQuery.isPending}
                        isError={treeQuery.isError}
                        onRetry={() => void treeQuery.refetch()}
                        nodes={nodes}
                        context={context}
                        onKeyDown={handleKeyDown}
                    />
                </div>

                {truncated && (
                    <p className="border-divider text-muted text-12-5 m-0 border-t px-3.5 py-3">
                        Mostrando {tree.items.length} de {tree.total} propriedades.
                    </p>
                )}
            </Blueprint>
        </aside>
    )
}
