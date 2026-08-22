import { describe, it, expect } from "vitest"
import { formatBucketLabel } from "@/lib/formatters/consumption"

/**
 * bucketStart no formato REAL que o backend devolve: `Date` serializado por
 * `res.json()` sempre vira ISO com sufixo `Z`, mas os dígitos já são o
 * horário de parede de São Paulo (`timeBucket.ts`, `AT TIME ZONE` duplo) —
 * não um instante UTC de verdade. Uma fixture sem o `Z` faria o
 * `new Date(...)` parsear como hora LOCAL do processo — um padrão de
 * fixture-que-mascara-o-bug: construção e leitura usariam o mesmo fuso
 * local, cancelando o erro em vez de expor.
 */
const BUCKET = "2026-08-21T19:03:00.000Z"

describe("formatBucketLabel", () => {
    it("bucket de minuto mostra dia, mês e o minuto cheio", () => {
        expect(formatBucketLabel(BUCKET, "minute")).toBe("21/08 19:03")
    })

    it("bucket de hora mostra dia, mês e hora", () => {
        expect(formatBucketLabel("2026-08-21T19:00:00.000Z", "hour")).toBe("21/08 19:00")
    })

    it("bucket de dia mostra dia e mês, sem ano — janela nunca cruza mês (issue #230)", () => {
        expect(formatBucketLabel("2026-08-21T00:00:00.000Z", "day")).toBe("21/08")
    })

    it("bucket de mês mostra o mês por extenso, capitalizado", () => {
        expect(formatBucketLabel("2026-08-01T00:00:00.000Z", "month")).toBe("Agosto de 2026")
    })

    it("bucket de ano mostra só o ano", () => {
        expect(formatBucketLabel("2026-01-01T00:00:00.000Z", "year")).toBe("2026")
    })
})
