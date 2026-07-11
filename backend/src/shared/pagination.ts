import { z } from "zod"

// Paginação universal (Fase 3.4): página ≥ 1 (default 1), pageSize 1–31
// (default 10). O teto de 31 é intencional — cobre o pior caso de "um mês"
// (dia a dia) numa única página, sem permitir que um cliente peça a tabela
// inteira de uma vez.
export const paginationQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(31).default(10),
})

export type PaginationQuery = z.infer<typeof paginationQuerySchema>

export type Paginated<T> = {
    items: T[]
    total: number
    page: number
    pageSize: number
}

// Helper de resposta — usado pelos repositories depois de rodar a query
// paginada (skip/take) + a contagem total.
export function toPaginated<T>(items: T[], total: number, pagination: PaginationQuery): Paginated<T> {
    return {
        items,
        total,
        page: pagination.page,
        pageSize: pagination.pageSize,
    }
}

// skip/take prontos para passar direto ao Prisma.
export function toSkipTake(pagination: PaginationQuery): { skip: number; take: number } {
    return {
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
    }
}
