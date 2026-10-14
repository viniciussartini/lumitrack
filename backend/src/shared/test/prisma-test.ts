// No Prisma 7, o PrismaClient exige um driver adapter para se conectar.
// Para os testes, criamos uma instância separada apontando para
// lumitrack_test — nunca tocando no banco de desenvolvimento.
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/generated/prisma/client.js"
import { incrementQueryCount } from "@/shared/database/queryCounter.js"
import "dotenv/config"

const testDatabaseUrl = process.env["DATABASE_TEST_URL"]

if (!testDatabaseUrl) {
    throw new Error(
        "DATABASE_TEST_URL não está definida no .env\n" +
            "Crie o banco de teste com: createdb lumitrack_test\n" +
            'E adicione ao .env: DATABASE_TEST_URL="postgresql://...lumitrack_test"',
    )
}

// O adapter recebe a URL do banco de testes diretamente.
// Assim garantimos isolamento total: mesmo que DATABASE_URL aponte
// para o dev, os testes sempre usarão o lumitrack_test.
const adapter = new PrismaPg({
    connectionString: testDatabaseUrl,
})

// `query` sai como evento (nunca no stdout) só para `countQueries` poder contar
// as queries de uma operação; o output dos testes segue silencioso.
export const prismaTest = new PrismaClient({
    adapter,
    log: [{ level: "query", emit: "event" }],
})

prismaTest.$on("query", () => {
    incrementQueryCount()
})
