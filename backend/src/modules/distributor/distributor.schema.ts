import { z } from "zod"
import { paginationQuerySchema } from "@/shared/pagination.js"

// Distribuidora agora é um catálogo global somente leitura (populado via
// seed) — não há mais schema de criação/atualização aqui. Só a query de
// listagem paginada.

export const listDistributorQuerySchema = paginationQuerySchema

export type ListDistributorQuery = z.infer<typeof listDistributorQuerySchema>
