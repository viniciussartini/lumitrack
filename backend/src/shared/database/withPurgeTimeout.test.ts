import { describe, it, expect } from "vitest"
import { withPurgeTimeout } from "@/shared/database/withPurgeTimeout.js"
import { env } from "@/config/env.js"
import { prismaTest } from "@/shared/test/prisma-test.js"

/**
 * `pg_settings.setting` devolve o valor bruto (em ms) do GUC, ao contrário
 * de `SHOW`/`current_setting()`, que reformatam pra "2min"/"30s" — evita
 * depender do formato de exibição do Postgres na asserção.
 */
async function readStatementTimeoutSetting(
    client: Pick<typeof prismaTest, "$queryRawUnsafe">,
): Promise<string> {
    const rows = await client.$queryRawUnsafe<{ setting: string }[]>(
        "SELECT setting FROM pg_settings WHERE name = 'statement_timeout'",
    )
    return rows[0]!.setting
}

describe("withPurgeTimeout — SET LOCAL statement_timeout escopado à transação do expurgo", () => {
    it("aplica RETENTION_PURGE_STATEMENT_TIMEOUT_MS dentro da transação", async () => {
        const settingInsideTx = await withPurgeTimeout(prismaTest, (tx) =>
            readStatementTimeoutSetting(tx),
        )

        expect(settingInsideTx).toBe(String(env.RETENTION_PURGE_STATEMENT_TIMEOUT_MS))
    })

    it("não vaza para fora da transação — SET LOCAL reseta sozinho ao final", async () => {
        await withPurgeTimeout(prismaTest, () => Promise.resolve())

        const settingOutsideTx = await readStatementTimeoutSetting(prismaTest)

        expect(settingOutsideTx).not.toBe(String(env.RETENTION_PURGE_STATEMENT_TIMEOUT_MS))
    })

    it("propaga o valor retornado pelo callback", async () => {
        const result = await withPurgeTimeout(prismaTest, () => Promise.resolve(42))

        expect(result).toBe(42)
    })
})
