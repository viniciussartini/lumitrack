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
            className={cn(
                "flex items-center justify-between gap-3 text-sm",
                className,
            )}
            data-testid="pagination"
        >
            <span className="text-slate-500 dark:text-slate-400">
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
                    className={cn(
                        "inline-flex h-8 w-8 items-center justify-center rounded-md",
                        "text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40",
                        "dark:text-slate-200 dark:hover:bg-slate-800",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                    )}
                >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                    type="button"
                    onClick={() => onPageChange(page + 1)}
                    disabled={!canNext}
                    aria-label="Próxima página"
                    data-testid="pagination-next"
                    className={cn(
                        "inline-flex h-8 w-8 items-center justify-center rounded-md",
                        "text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40",
                        "dark:text-slate-200 dark:hover:bg-slate-800",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                    )}
                >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
            </div>
        </div>
    )
}
