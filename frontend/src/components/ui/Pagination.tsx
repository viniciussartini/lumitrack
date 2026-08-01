import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/cn"

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
 * Não renderiza nada quando cabe tudo em uma página (totalPages <= 1) —
 * evita ocupar espaço com um controle sem função.
 */
export const Pagination = ({
    page,
    pageSize,
    total,
    onPageChange,
    className,
}: PaginationProps) => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize))

    if (totalPages <= 1) return null

    const canPrev = page > 1
    const canNext = page < totalPages

    return (
        <div
            className={cn("flex items-center justify-between gap-3 text-sm", className)}
            data-testid="pagination"
        >
            <span className="text-muted">
                {total} {total === 1 ? "item" : "itens"} · página {page} de{" "}
                {totalPages}
            </span>

            <div className="flex items-center gap-1">
                <button
                    type="button"
                    onClick={() => onPageChange(page - 1)}
                    disabled={!canPrev}
                    aria-label="Página anterior"
                    data-testid="pagination-prev"
                    className="btn btn-ghost btn-icon"
                >
                    <ChevronLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                </button>
                <button
                    type="button"
                    onClick={() => onPageChange(page + 1)}
                    disabled={!canNext}
                    aria-label="Próxima página"
                    data-testid="pagination-next"
                    className="btn btn-ghost btn-icon"
                >
                    <ChevronRight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                </button>
            </div>
        </div>
    )
}
