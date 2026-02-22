import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/generated/prisma/client.js"
import "dotenv/config"

// Instância dedicada aos testes de integração HTTP.
// Aponta para lumitrack_test_http — completamente isolado do banco
// de testes de unidade (lumitrack_test) e do banco de dev (lumitrack_dev).

const httpTestDatabaseUrl = process.env["DATABASE_HTTP_TEST_URL"]

if (!httpTestDatabaseUrl) {
    throw new Error(
        "DATABASE_HTTP_TEST_URL não está definida no .env\n" +
        "Crie o banco com: createdb lumitrack_test_http\n" +
        'E adicione ao .env: DATABASE_HTTP_TEST_URL="postgresql://...lumitrack_test_http"',
    )
}

const adapter = new PrismaPg({ connectionString: httpTestDatabaseUrl })

export const prismaHttpTest = new PrismaClient({
    adapter,
    log: [],
})