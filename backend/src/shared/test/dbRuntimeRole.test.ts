import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/generated/prisma/client.js"
import { prismaTest } from "@/shared/test/prisma-test.js"

/**
 * Regressão de infraestrutura: o papel de runtime da aplicação
 * (`deploy/create-app-role.sql`, usado em produção como `lumitrack_app`)
 * não pode executar DDL — só DML. Este teste recria as mesmas GRANT/REVOKE
 * daquele script contra o banco de teste (não contra produção) e prova o
 * comportamento negativo exigido: `CREATE TABLE` falha, `SELECT` funciona.
 *
 * Mantenha esta lista de privilégios em sincronia com
 * `deploy/create-app-role.sql` se ele mudar — são a mesma política,
 * aplicada aqui via Prisma em vez de psql.
 */

const TEST_ROLE = "lumitrack_regression_test_role"
const TEST_ROLE_PASSWORD = "regression-test-only"

function restrictedRoleConnectionString(): string {
    const testDatabaseUrl = process.env["DATABASE_TEST_URL"]
    if (!testDatabaseUrl) {
        throw new Error("DATABASE_TEST_URL não está definida no .env")
    }
    const url = new URL(testDatabaseUrl)
    url.username = TEST_ROLE
    url.password = TEST_ROLE_PASSWORD
    return url.toString()
}

let prismaAsRestrictedRole: PrismaClient

beforeAll(async () => {
    await prismaTest.$executeRawUnsafe(`
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${TEST_ROLE}') THEN
                CREATE ROLE ${TEST_ROLE} LOGIN PASSWORD '${TEST_ROLE_PASSWORD}';
            END IF;
        END
        $$;
    `)
    await prismaTest.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${TEST_ROLE};`)
    await prismaTest.$executeRawUnsafe(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${TEST_ROLE};`,
    )
    await prismaTest.$executeRawUnsafe(
        `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${TEST_ROLE};`,
    )
    await prismaTest.$executeRawUnsafe(`REVOKE CREATE ON SCHEMA public FROM ${TEST_ROLE};`)

    const adapter = new PrismaPg({ connectionString: restrictedRoleConnectionString() })
    prismaAsRestrictedRole = new PrismaClient({ adapter, log: [] })
})

afterAll(async () => {
    await prismaAsRestrictedRole.$disconnect()
    // REVOKE explícito (em vez de DROP OWNED BY) — a role nunca chega a
    // possuir objeto nenhum (CREATE está revogado), mas DROP ROLE falha se
    // ela ainda tiver qualquer privilégio pendente; quem concedeu pode
    // sempre revogar, sem precisar de membership na role-alvo.
    await prismaTest.$executeRawUnsafe(
        `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${TEST_ROLE};`,
    )
    await prismaTest.$executeRawUnsafe(
        `REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${TEST_ROLE};`,
    )
    await prismaTest.$executeRawUnsafe(`REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${TEST_ROLE};`)
    await prismaTest.$executeRawUnsafe(`DROP ROLE IF EXISTS ${TEST_ROLE};`)
})

describe("papel de runtime sem DDL (deploy/create-app-role.sql)", () => {
    it("recusa CREATE TABLE", async () => {
        await expect(
            prismaAsRestrictedRole.$executeRawUnsafe("CREATE TABLE regression_check (x int)"),
        ).rejects.toThrow(/permission denied/i)
    })

    it("continua executando SELECT normalmente", async () => {
        const result = await prismaAsRestrictedRole.$queryRawUnsafe(
            'SELECT count(*)::int AS count FROM "users"',
        )
        expect(result).toEqual([{ count: expect.any(Number) }])
    })
})
