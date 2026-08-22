import type { LucideIcon } from "lucide-react"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import { cn } from "@/lib/cn"
import { buildPaginationRange, ELLIPSIS } from "@/lib/paginationRange"

interface PaginationProps {
    page: number
    pageSize: number
    total: number
    onPageChange: (page: number) => void
    className?: string
}

/**
 * Paginação universal — usada por qualquer listagem que consuma o
 * envelope `{ items, total, page, pageSize }` do backend.
 *
 * Controles `« ‹ 1 … n › »`: além de avançar de página em página, dá para
 * saltar direto para a primeira, a última ou uma página visível da faixa —
 * com janelas longas (a tabela de consumo chega a dezenas de páginas), só
 * anterior/próxima transformava navegação em maratona de cliques.
 *
 * Não renderiza nada quando cabe tudo em uma página (totalPages <= 1) —
 * evita ocupar espaço com um controle sem função.
 *
 * O bundle de design vigente não especifica paginação (não há controle
 * equivalente em nenhuma tela do handoff); o vocabulário visual segue o que
 * o próprio bundle já define para seleção de item em conjunto (`.lt-selbtn`
 * com `data-on`, o mesmo de GranularityTabs) e para ação em ícone
 * (`.btn-ghost.btn-icon`).
 */
export const Pagination = ({ page, pageSize, total, onPageChange, className }: PaginationProps) => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize))

    if (totalPages <= 1) return null

    const canPrev = page > 1
    const canNext = page < totalPages

    return (
        <nav
            aria-label="Paginação"
            className={cn("flex flex-wrap items-center justify-between gap-3 text-sm", className)}
            data-testid="pagination"
        >
            <span className="text-muted">
                {total} {total === 1 ? "item" : "itens"} · página {page} de {totalPages}
            </span>

            <div className="flex items-center gap-1">
                <StepButton
                    icon={ChevronsLeft}
                    label="Primeira página"
                    testId="pagination-first"
                    disabled={!canPrev}
                    onClick={() => onPageChange(1)}
                />
                <StepButton
                    icon={ChevronLeft}
                    label="Página anterior"
                    testId="pagination-prev"
                    disabled={!canPrev}
                    onClick={() => onPageChange(page - 1)}
                />

                <PageNumbers page={page} totalPages={totalPages} onPageChange={onPageChange} />

                <StepButton
                    icon={ChevronRight}
                    label="Próxima página"
                    testId="pagination-next"
                    disabled={!canNext}
                    onClick={() => onPageChange(page + 1)}
                />
                <StepButton
                    icon={ChevronsRight}
                    label="Última página"
                    testId="pagination-last"
                    disabled={!canNext}
                    onClick={() => onPageChange(totalPages)}
                />
            </div>
        </nav>
    )
}

interface StepButtonProps {
    icon: LucideIcon
    label: string
    testId: string
    disabled: boolean
    onClick: () => void
}

/** Salto de página em ícone (primeira/anterior/próxima/última). */
const StepButton = ({ icon: Icon, label, testId, disabled, onClick }: StepButtonProps) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        data-testid={testId}
        className="btn btn-ghost btn-icon"
    >
        <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
    </button>
)

interface PageNumbersProps {
    page: number
    totalPages: number
    onPageChange: (page: number) => void
}

/** Faixa numerada, com elipse nos cortes. */
const PageNumbers = ({ page, totalPages, onPageChange }: PageNumbersProps) => (
    <>
        {buildPaginationRange(page, totalPages).map((item, index) =>
            item === ELLIPSIS ? (
                <span
                    // A elipse não é navegável e pode aparecer duas vezes; a
                    // posição na faixa é a única identidade estável que tem.
                    key={`${ELLIPSIS}-${index}`}
                    aria-hidden="true"
                    data-testid="pagination-ellipsis"
                    className="text-muted px-1"
                >
                    …
                </span>
            ) : (
                <button
                    key={item}
                    type="button"
                    onClick={() => item !== page && onPageChange(item)}
                    aria-label={`Página ${item}`}
                    aria-current={item === page ? "page" : undefined}
                    data-on={item === page}
                    data-testid={`pagination-page-${item}`}
                    className="lt-selbtn px-2.5 py-1"
                >
                    {item}
                </button>
            ),
        )}
    </>
)
