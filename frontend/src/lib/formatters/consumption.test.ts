import { describe, it, expect } from "vitest"
import { formatBucketLabel } from "@/lib/formatters/consumption"

// ISO local (sem sufixo Z) — evita que o rótulo dependa do fuso de quem roda
// o teste, do mesmo jeito que o backend devolve o bucket já em horário de SP.
const BUCKET = "2026-08-21T19:03:00"

describe("formatBucketLabel", () => {
    it("bucket de minuto mostra dia, mês e o minuto cheio", () => {
        expect(formatBucketLabel(BUCKET, "minute")).toBe("21/08 19:03")
    })

    it("bucket de hora mostra dia, mês e hora", () => {
        expect(formatBucketLabel("2026-08-21T19:00:00", "hour")).toBe("21/08 19:00")
    })

    it("bucket de dia mostra a data completa", () => {
        expect(formatBucketLabel(BUCKET, "day")).toBe("21/08/2026")
    })

    it("bucket de mês mostra o mês por extenso, capitalizado", () => {
        expect(formatBucketLabel(BUCKET, "month")).toBe("Agosto de 2026")
    })

    it("bucket de ano mostra só o ano", () => {
        expect(formatBucketLabel(BUCKET, "year")).toBe("2026")
    })
})
