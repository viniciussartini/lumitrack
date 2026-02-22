// No Prisma 7, o PrismaClient não se conecta ao banco por conta própria.
// É obrigatório fornecer um "driver adapter" — uma biblioteca JS pura
// que gerencia a conexão TCP com o PostgreSQL.
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/generated/prisma/client.js"
import { env } from "@/config/env.js"

// Singleton pattern: uma única instância compartilhada em todo o processo.
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
    // O PrismaPg cria e gerencia o pool de conexões TCP com o PostgreSQL.
    // Passamos a DATABASE_URL diretamente aqui — no Prisma 7, a URL de
    // conexão vai para o adapter, não para o PrismaClient.
    const adapter = new PrismaPg({
        connectionString: env.DATABASE_URL,
    })

    return new PrismaClient({
        adapter,
        log: env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
    })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma
}