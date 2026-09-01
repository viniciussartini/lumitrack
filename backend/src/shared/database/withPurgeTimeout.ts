import type { PrismaClient, Prisma } from "@/generated/prisma/client.js"
import { env } from "@/config/env.js"

/**
 * Roda `fn` dentro de uma transação com um `statement_timeout` PRÓPRIO
 * (`RETENTION_PURGE_STATEMENT_TIMEOUT_MS`), maior que o teto padrão do pool
 * (`DB_POOL_STATEMENT_TIMEOUT_MS`, pensado para rota HTTP) — usado pelos
 * deletes de expurgo de retenção, cujo pior caso legítimo medido excede o
 * teto padrão (ver `.claude/docs/2026-08-31-baseline-desempenho-statement-timeout.md`).
 *
 * `SET LOCAL` só tem efeito dentro de uma transação explícita — reseta
 * sozinho ao fim dela, sem vazar para nenhuma outra query do pool. O valor
 * vem de env já validado como inteiro positivo (`z.coerce.number().int().positive()`
 * em `config/env.ts`), nunca de entrada do usuário — `$executeRawUnsafe` é
 * necessário aqui porque o comando `SET` do Postgres não aceita parâmetro
 * vinculado (`$1`) na posição do valor, só literal.
 */
export function withPurgeTimeout<T>(
    prisma: PrismaClient,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
    return prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
            `SET LOCAL statement_timeout = ${env.RETENTION_PURGE_STATEMENT_TIMEOUT_MS}`,
        )
        return fn(tx)
    })
}
