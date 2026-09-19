import { useState } from "react"
import { AlertCircle, Cpu, Home, LayoutGrid } from "lucide-react"
import { Blueprint } from "@/components/ui/Blueprint"
import { Button } from "@/components/ui/Button"
import { TreeRow } from "@/components/settings/TreeRow"
import {
    TreeActionDialogs,
    type TreeAction,
    type TreeTarget,
} from "@/components/settings/TreeActionDialogs"
import { usePropertyTree } from "@/hooks/queries/usePropertyTree"
import type { AreaTreeNode, PropertyTreeNode } from "@/types/property.types"

const plural = (count: number, singular: string, pluralForm: string) =>
    `${count} ${count === 1 ? singular : pluralForm}`

interface NodeProps<T> {
    node: T
    expanded: ReadonlySet<string>
    onToggle: (id: string) => void
    onAction: (action: TreeAction) => void
}

interface AreaNodeProps extends NodeProps<AreaTreeNode> {
    propertyId: string
}

const AreaNode = ({ node, propertyId, expanded, onToggle, onAction }: AreaNodeProps) => {
    const target = (device?: AreaTreeNode["devices"][number]): TreeTarget =>
        device
            ? { kind: "device", propertyId, areaId: node.id, id: device.id, name: device.name }
            : { kind: "area", propertyId, id: node.id, name: node.name }
    const hasDevices = node.devices.length > 0

    return (
        <TreeRow
            level={1}
            icon={LayoutGrid}
            name={node.name}
            noun="área"
            meta={plural(node.devices.length, "dispositivo", "dispositivos")}
            {...(hasDevices && { onToggle: () => onToggle(node.id) })}
            isOpen={expanded.has(node.id)}
            onEdit={() => onAction({ type: "edit", target: target() })}
            onDelete={() => onAction({ type: "delete", target: target() })}
        >
            {node.devices.map((device) => (
                <TreeRow
                    key={device.id}
                    level={2}
                    icon={Cpu}
                    name={device.name}
                    noun="dispositivo"
                    {...(device.powerWatts !== null && { meta: `${device.powerWatts} W` })}
                    onEdit={() => onAction({ type: "edit", target: target(device) })}
                    onDelete={() => onAction({ type: "delete", target: target(device) })}
                />
            ))}
        </TreeRow>
    )
}

const PropertyNode = ({ node, expanded, onToggle, onAction }: NodeProps<PropertyTreeNode>) => {
    const deviceCount = node.areas.reduce((sum, area) => sum + area.devices.length, 0)
    const target: TreeTarget = { kind: "property", id: node.id, name: node.name }

    return (
        <TreeRow
            level={0}
            icon={Home}
            name={node.name}
            noun="propriedade"
            meta={`${plural(node.areas.length, "área", "áreas")} · ${plural(deviceCount, "dispositivo", "dispositivos")}`}
            {...(node.areas.length > 0 && { onToggle: () => onToggle(node.id) })}
            isOpen={expanded.has(node.id)}
            onEdit={() => onAction({ type: "edit", target })}
            onDelete={() => onAction({ type: "delete", target })}
        >
            {node.areas.map((area) => (
                <AreaNode
                    key={area.id}
                    node={area}
                    propertyId={node.id}
                    expanded={expanded}
                    onToggle={onToggle}
                    onAction={onAction}
                />
            ))}
        </TreeRow>
    )
}

const TreeMessage = ({ children }: { children: React.ReactNode }) => (
    <p className="text-muted border-divider m-0 border-t px-5 py-4 text-sm">{children}</p>
)

const TreeHeader = () => (
    <div className="px-5 py-4">
        <span className="font-heading text-17 font-semibold uppercase">Estrutura cadastrada</span>
        <span className="text-muted text-12-5 mt-1 block">
            Propriedades, áreas e dispositivos vinculados à sua conta.
        </span>
    </div>
)

interface TreeLoadStateProps {
    isPending: boolean
    isError: boolean
    onRetry: () => void
}

const TreeLoadState = ({ isPending, isError, onRetry }: TreeLoadStateProps) => (
    <>
        {isPending && (
            <div role="status" aria-busy="true">
                <TreeMessage>Carregando estrutura…</TreeMessage>
            </div>
        )}
        {isError && (
            <div
                role="alert"
                className="border-divider flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4"
            >
                <p className="text-status-danger m-0 text-sm">
                    Não foi possível carregar a estrutura cadastrada.
                </p>
                <Button variant="secondary" onClick={onRetry}>
                    Tentar novamente
                </Button>
            </div>
        )}
    </>
)

/**
 * Configurações → Cadastro, bloco "Estrutura cadastrada": Propriedades →
 * Áreas → Dispositivos expansíveis, carregados numa única requisição, cada
 * linha com editar e excluir. Propriedades e áreas sem filhos não expandem.
 */
export const RegistrationTree = () => {
    const treeQuery = usePropertyTree()
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
    const [action, setAction] = useState<TreeAction | null>(null)

    const toggle = (id: string) =>
        setExpanded((current) => {
            const next = new Set(current)
            if (!next.delete(id)) next.add(id)
            return next
        })

    const tree = treeQuery.data

    return (
        <Blueprint className="p-0">
            <TreeHeader />
            <TreeLoadState
                isPending={treeQuery.isPending}
                isError={treeQuery.isError}
                onRetry={() => void treeQuery.refetch()}
            />

            {tree?.items.length === 0 && (
                <TreeMessage>
                    <AlertCircle
                        className="mr-2 inline h-4 w-4 align-text-bottom"
                        aria-hidden="true"
                    />
                    Nenhuma propriedade cadastrada. Use os cards acima para criar a primeira.
                </TreeMessage>
            )}

            {tree?.items.map((property) => (
                <PropertyNode
                    key={property.id}
                    node={property}
                    expanded={expanded}
                    onToggle={toggle}
                    onAction={setAction}
                />
            ))}

            {tree && tree.total > tree.items.length && (
                <TreeMessage>
                    Mostrando {tree.items.length} de {tree.total} propriedades.
                </TreeMessage>
            )}

            <TreeActionDialogs action={action} onClose={() => setAction(null)} />
        </Blueprint>
    )
}
