import type { Property } from "@/types/property.types"

interface PropertySelectorProps {
    properties: Property[]
    selectedId: string | null
    onChange: (id: string) => void
}

/**
 * Seletor de propriedade ativa do Painel (bloco `isDashboard` do handoff,
 * linhas 154-157 de `LumiTrack Home.dc.html`) — mesmo padrão de toggle
 * `.lt-selbtn` já usado em `GranularityTabs`, controlado pelo pai.
 */
export const PropertySelector = ({ properties, selectedId, onChange }: PropertySelectorProps) => (
    <div className="flex flex-wrap items-center gap-[10px]">
        <span className="font-heading text-muted mr-1 text-[11px] font-semibold tracking-[.08em] uppercase">
            Propriedade
        </span>
        <div
            role="tablist"
            aria-label="Propriedade"
            className="flex flex-wrap gap-2"
            data-testid="property-selector"
        >
            {properties.map((property) => {
                const isActive = property.id === selectedId
                return (
                    <button
                        key={property.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        data-on={isActive}
                        onClick={() => onChange(property.id)}
                        data-testid={`property-selector-${property.id}`}
                        className="lt-selbtn"
                    >
                        {property.name}
                    </button>
                )
            })}
        </div>
    </div>
)
