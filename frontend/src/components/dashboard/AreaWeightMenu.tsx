import { useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import { useClickOutside } from "@/lib/hooks/useClickOutside"
import type { AreaWeightEntry } from "@/lib/areaWeight"

interface AreaWeightMenuProps {
    entries: readonly AreaWeightEntry[]
    deselectedIds: ReadonlySet<string>
    onToggle: (id: string) => void
    onSelectAll: () => void
    onClear: () => void
}

/**
 * Menu "N de M medidores" da pizza: marca e desmarca áreas, com "Selecionar
 * todos" e "Limpar seleção". É um botão que abre um painel de caixas de
 * seleção (não um `menu` do WAI-ARIA, que não leva caixas): Esc ou clique fora
 * fecham, e o Esc devolve o foco ao botão.
 */
export const AreaWeightMenu = ({
    entries,
    deselectedIds,
    onToggle,
    onSelectAll,
    onClear,
}: AreaWeightMenuProps) => {
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const selectedCount = entries.filter((entry) => !deselectedIds.has(entry.id)).length
    const allSelected = selectedCount === entries.length

    useClickOutside(containerRef, () => setIsOpen(false))

    useEffect(() => {
        if (!isOpen) return
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return
            setIsOpen(false)
            triggerRef.current?.focus()
        }
        document.addEventListener("keydown", handleEscape)
        return () => document.removeEventListener("keydown", handleEscape)
    }, [isOpen])

    return (
        <div ref={containerRef} className="relative shrink-0">
            <button
                ref={triggerRef}
                type="button"
                className="btn btn-secondary gap-2"
                aria-expanded={isOpen}
                aria-controls="area-weight-menu"
                data-testid="area-weight-menu-trigger"
                onClick={() => setIsOpen((open) => !open)}
            >
                {selectedCount} de {entries.length} medidores
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {isOpen && (
                <MenuPanel
                    entries={entries}
                    deselectedIds={deselectedIds}
                    allSelected={allSelected}
                    onToggle={onToggle}
                    onSelectAll={onSelectAll}
                    onClear={onClear}
                />
            )}
        </div>
    )
}

interface MenuPanelProps extends AreaWeightMenuProps {
    allSelected: boolean
}

const MenuPanel = ({
    entries,
    deselectedIds,
    allSelected,
    onToggle,
    onSelectAll,
    onClear,
}: MenuPanelProps) => (
    <div
        id="area-weight-menu"
        role="group"
        aria-label="Medidores"
        className="lt-menu top-full right-0 mt-1.5 max-h-72 w-72 overflow-auto"
    >
        <div className="border-divider flex items-center justify-between gap-3 border-b px-3.5 py-3">
            <span className="font-heading text-muted text-10 font-semibold tracking-[.07em] uppercase">
                Medidores
            </span>
            <button
                type="button"
                className="text-accent-700 text-12 hover:underline"
                onClick={allSelected ? onClear : onSelectAll}
            >
                {allSelected ? "Limpar seleção" : "Selecionar todos"}
            </button>
        </div>
        {entries.map((entry) => (
            <label
                key={entry.id}
                className="border-divider text-13 flex cursor-pointer items-center gap-2 border-t px-3.5 py-2.5 first:border-t-0"
            >
                <input
                    type="checkbox"
                    className="accent-accent h-4 w-4 shrink-0"
                    checked={!deselectedIds.has(entry.id)}
                    onChange={() => onToggle(entry.id)}
                />
                <span
                    aria-hidden="true"
                    className="h-3 w-3 shrink-0"
                    style={{ backgroundColor: entry.color }}
                />
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            </label>
        ))}
    </div>
)
