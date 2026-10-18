import { useState, type ReactNode } from "react"
import { AreaWeightChart } from "@/components/dashboard/AreaWeightChart"
import { AreaWeightMenu } from "@/components/dashboard/AreaWeightMenu"
import { SectionError, SectionSkeleton } from "@/components/ui/SectionState"
import { Blueprint } from "@/components/ui/Blueprint"
import { usePropertyTree } from "@/hooks/queries/usePropertyTree"
import { useSummaryItems } from "@/hooks/useSummaryItems"
import { buildAreaWeightEntries, computeAreaWeights } from "@/lib/areaWeight"
import { resolveConsumptionWindow } from "@/lib/consumptionWindow"
import type { PropertyTreeNode } from "@/types/property.types"

interface AreaWeightSectionProps {
    propertyId: string
    propertyName: string
}

/**
 * "Peso de cada medidor" do Painel (LumiTrack Home v2.dc.html, Painel): a
 * participação de cada área com medidor no consumo do mês corrente da
 * propriedade selecionada. O rótulo "medidor" é o do design; na prática cada
 * fatia é uma área, o nível que não conta o consumo duas vezes (o medidor
 * geral da propriedade e os dos dispositivos ficam de fora).
 *
 * A seleção mora aqui e vale para a propriedade mostrada: quem usa o bloco o
 * remonta ao trocar de propriedade (`key`), o que devolve todas as áreas à
 * seleção.
 */
export const AreaWeightSection = ({ propertyId, propertyName }: AreaWeightSectionProps) => {
    const treeQuery = usePropertyTree()
    const property = treeQuery.data?.items.find((item) => item.id === propertyId)

    return (
        <Blueprint className="p-0" data-testid="area-weight-section">
            {property ? (
                <AreaWeightBody property={property} propertyName={propertyName} />
            ) : (
                <>
                    <AreaWeightHeader propertyName={propertyName} />
                    {treeQuery.isPending && (
                        <SectionSkeleton
                            label="Carregando peso de cada medidor"
                            testId="area-weight-skeleton"
                        />
                    )}
                    {treeQuery.isError && (
                        <SectionError
                            message="Não foi possível carregar a hierarquia."
                            onRetry={() => void treeQuery.refetch()}
                        />
                    )}
                    {treeQuery.isSuccess && (
                        <WeightMessage>
                            Esta propriedade não está na hierarquia carregada.
                        </WeightMessage>
                    )}
                </>
            )}
        </Blueprint>
    )
}

interface AreaWeightHeaderProps {
    propertyName: string
    menu?: ReactNode
}

const AreaWeightHeader = ({ propertyName, menu }: AreaWeightHeaderProps) => (
    <div className="border-divider flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
            <span className="font-heading text-17 font-semibold uppercase">
                Peso de cada medidor
            </span>
            <span className="text-muted text-12-5 mt-0.5 block">
                {propertyName} · participação das áreas no consumo do mês
            </span>
        </div>
        {menu}
    </div>
)

interface AreaWeightBodyProps {
    property: PropertyTreeNode
    propertyName: string
}

const AreaWeightBody = ({ property, propertyName }: AreaWeightBodyProps) => {
    const monthWindow = resolveConsumptionWindow("month")
    const summary = useSummaryItems({ AREA: property.areas.map((area) => area.id) }, "month", {
        from: monthWindow.from,
        to: monthWindow.to,
    })
    const [deselectedIds, setDeselectedIds] = useState<ReadonlySet<string>>(new Set())

    const entries = buildAreaWeightEntries(property.areas, summary.byId)
    const toggle = (id: string) =>
        setDeselectedIds((current) => {
            const next = new Set(current)
            if (!next.delete(id)) next.add(id)
            return next
        })

    return (
        <>
            <AreaWeightHeader
                propertyName={propertyName}
                menu={
                    entries.length > 0 && (
                        <AreaWeightMenu
                            entries={entries}
                            deselectedIds={deselectedIds}
                            onToggle={toggle}
                            onSelectAll={() => setDeselectedIds(new Set())}
                            onClear={() => setDeselectedIds(new Set(entries.map((e) => e.id)))}
                        />
                    )
                }
            />
            <div className="p-5">
                <WeightContent
                    isLoading={summary.isLoading}
                    isError={summary.isError}
                    onRetry={summary.refetch}
                    entries={entries}
                    deselectedIds={deselectedIds}
                />
            </div>
        </>
    )
}

interface WeightContentProps {
    isLoading: boolean
    isError: boolean
    onRetry: () => void
    entries: ReturnType<typeof buildAreaWeightEntries>
    deselectedIds: ReadonlySet<string>
}

/** O estado da pizza: carregando, erro, sem área com medidor, sem seleção, sem consumo ou o gráfico. */
const WeightContent = ({
    isLoading,
    isError,
    onRetry,
    entries,
    deselectedIds,
}: WeightContentProps) => {
    if (isLoading)
        return (
            <SectionSkeleton
                label="Carregando peso de cada medidor"
                testId="area-weight-skeleton"
            />
        )
    if (isError) {
        return (
            <SectionError message="Não foi possível carregar o consumo do mês." onRetry={onRetry} />
        )
    }
    if (entries.length === 0) {
        return (
            <WeightMessage>
                Nenhuma área com medidor e consumo neste mês. Vincule um medidor a uma área para ver
                o peso de cada uma.
            </WeightMessage>
        )
    }

    const weights = computeAreaWeights(entries, deselectedIds)
    if (weights.slices.length === 0) {
        return <WeightMessage>Selecione ao menos um medidor.</WeightMessage>
    }
    if (weights.totalKwh === 0) {
        return <WeightMessage>Sem consumo nas áreas selecionadas neste mês.</WeightMessage>
    }
    return <AreaWeightChart slices={weights.slices} totalKwh={weights.totalKwh} />
}

const WeightMessage = ({ children }: { children: ReactNode }) => (
    <p role="status" className="text-muted text-13 m-0 px-5 py-8 text-center">
        {children}
    </p>
)
