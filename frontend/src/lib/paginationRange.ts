/** Marca de corte entre blocos de páginas não contíguos. */
export const ELLIPSIS = "ellipsis"

export type PaginationItem = number | typeof ELLIPSIS

/** Páginas vizinhas à corrente exibidas de cada lado quando há corte dos dois. */
const SIBLINGS = 1

/**
 * Largura fixa da faixa: primeira + elipse + 3 do miolo + elipse + última.
 * Manter o número de slots constante evita que os controles "pulem" de
 * largura conforme o usuário navega.
 */
const SLOTS = 2 * SIBLINGS + 5

/**
 * Monta a faixa de páginas dos controles `« ‹ 1 … n › »`.
 *
 * Até `SLOTS` páginas, lista todas. Acima disso, mantém sempre a primeira e a
 * última visíveis e corta o excesso com elipse — do lado direito quando a
 * corrente está no começo, do esquerdo quando está no fim, dos dois quando
 * está no meio.
 *
 * `page` e `totalPages` fora da faixa são normalizados (e não rejeitados):
 * vêm de resposta de API e de aritmética de paginação, onde um zero ou um
 * estouro transitório não deve derrubar a tela.
 */
export const buildPaginationRange = (page: number, totalPages: number): PaginationItem[] => {
    const total = Math.max(1, Math.trunc(totalPages))
    const current = Math.min(Math.max(1, Math.trunc(page)), total)

    if (total <= SLOTS) return range(1, total)

    // Quantas páginas o miolo ocupa quando só um dos lados é cortado.
    const edgeBlock = SLOTS - 2

    const isNearStart = current <= edgeBlock - 1
    if (isNearStart) return [...range(1, edgeBlock), ELLIPSIS, total]

    const isNearEnd = current >= total - (edgeBlock - 2)
    if (isNearEnd) return [1, ELLIPSIS, ...range(total - edgeBlock + 1, total)]

    return [1, ELLIPSIS, ...range(current - SIBLINGS, current + SIBLINGS), ELLIPSIS, total]
}

const range = (start: number, end: number): number[] =>
    Array.from({ length: end - start + 1 }, (_, i) => start + i)
