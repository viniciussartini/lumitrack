// No Prisma 7, o PrismaClient não se conecta ao banco por conta própria.
// É obrigatório fornecer um "driver adapter" — uma biblioteca JS pura
// que gerencia a conexão TCP com o PostgreSQL.
import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/generated/prisma/client.js"
import { env } from "@/config/env.js"
import { incrementQueryCount } from "@/shared/database/queryCounter.js"

// Singleton pattern: uma única instância compartilhada em todo o processo.
// `pgPool` acompanha `prisma` para que `getPoolStats()` (instrumentação de
// desempenho, Fase 15) leia o mesmo pool de conexões que o client usa —
// `PrismaPg` não expõe o pool que cria internamente quando recebe só uma
// connection string, então o pool é criado aqui e passado para ele.
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
    pgPool: Pool | undefined
}

function createPrismaClient(): { client: PrismaClient; pool: Pool } {
    const pool = new Pool({ connectionString: env.DATABASE_URL })
    const adapter = new PrismaPg(pool)

    if (env.NODE_ENV === "production") {
        const client = new PrismaClient({ adapter, log: ["error"] })
        return { client, pool }
    }

    // `query` sempre emite como evento (nunca a string solta `"query"`, que
    // despeja direto no stdout sem passar pelo logger estruturado) — o
    // listener abaixo incrementa o contador por requisição, que só tem
    // efeito com `DEBUG_QUERY_LOGGING_ENABLED` (env.ts proíbe em produção).
    const client = new PrismaClient({
        adapter,
        log: [{ level: "query", emit: "event" }, "warn", "error"],
    })

    client.$on("query", () => {
        incrementQueryCount()
    })

    return { client, pool }
}

const instance =
    globalForPrisma.prisma && globalForPrisma.pgPool
        ? { client: globalForPrisma.prisma, pool: globalForPrisma.pgPool }
        : createPrismaClient()

export const prisma = instance.client

if (env.NODE_ENV !== "production") {
    globalForPrisma.prisma = instance.client
    globalForPrisma.pgPool = instance.pool
}

export type PoolStats = {
    totalCount: number
    idleCount: number
    waitingCount: number
}

/**
 * Estatísticas do pool de conexões `pg` subjacente ao Prisma — instrumentação
 * de desempenho (Fase 15), consumida pelo `MinuteRollupScheduler` a cada
 * flush. Não expõe o pool em si, só as três métricas de saturação.
 */
export function getPoolStats(): PoolStats {
    return {
        totalCount: instance.pool.totalCount,
        idleCount: instance.pool.idleCount,
        waitingCount: instance.pool.waitingCount,
    }
}
