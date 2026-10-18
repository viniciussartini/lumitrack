import { describe, it, expect } from "vitest"
import {
    computeSeriesWindow,
    fillMissingBuckets,
    type SeriesWindowInput,
} from "@/modules/meter/meter-reading-series-window.js"

// "2026-01-15" — `day` chega do schema como `z.coerce.date()`, que interpreta
// uma string "YYYY-MM-DD" como meia-noite UTC; os getters UTC devolvem os
// mesmos dígitos do calendário pedido, então usamos esse formato aqui em vez
// de montar a data manualmente.
const DAY = new Date("2026-01-15")

describe("computeSeriesWindow", () => {
    it("window=dia: 24 baldes de 1h, começando à meia-noite local (03:00 UTC)", () => {
        const input: SeriesWindowInput = { window: "dia", day: DAY }
        const result = computeSeriesWindow(input)

        expect(result.rangeFrom).toEqual(new Date("2026-01-15T03:00:00.000Z"))
        expect(result.rangeTo).toEqual(new Date("2026-01-16T03:00:00.000Z"))
        expect(result.bucketStarts).toHaveLength(24)
        expect(result.bucketStarts[0]).toEqual(new Date("2026-01-15T00:00:00.000Z"))
        expect(result.bucketStarts[1]).toEqual(new Date("2026-01-15T01:00:00.000Z"))
        expect(result.bucketStarts[23]).toEqual(new Date("2026-01-15T23:00:00.000Z"))
    })

    it.each([
        [1, 60],
        [5, 12],
        [15, 4],
        [30, 2],
    ] as const)(
        "window=hora, aggregationMinutes=%d: %d baldes de %d minuto(s), começando na hora local escolhida (17:00 UTC)",
        (aggregationMinutes, expectedCount) => {
            const input: SeriesWindowInput = {
                window: "hora",
                day: DAY,
                hour: 14,
                aggregationMinutes,
            }
            const result = computeSeriesWindow(input)

            expect(result.rangeFrom).toEqual(new Date("2026-01-15T17:00:00.000Z"))
            expect(result.rangeTo).toEqual(new Date("2026-01-15T18:00:00.000Z"))
            expect(result.bucketStarts).toHaveLength(expectedCount)
            expect(result.bucketStarts[0]).toEqual(new Date("2026-01-15T14:00:00.000Z"))
            expect(result.bucketStarts[1]).toEqual(
                new Date(
                    new Date("2026-01-15T14:00:00.000Z").getTime() + aggregationMinutes * 60_000,
                ),
            )
        },
    )
})

describe("fillMissingBuckets", () => {
    it("preenche com null os baldes que o banco não devolveu, preservando a ordem de bucketStarts", () => {
        const b0 = new Date("2026-01-15T14:00:00.000Z")
        const b1 = new Date("2026-01-15T14:01:00.000Z")
        const b2 = new Date("2026-01-15T14:02:00.000Z")

        const result = fillMissingBuckets(
            [b0, b1, b2],
            [{ bucketStart: b1, min: 10, avg: 15, max: 20 }],
        )

        expect(result).toEqual([
            { bucketStart: b0, min: null, avg: null, max: null },
            { bucketStart: b1, min: 10, avg: 15, max: 20 },
            { bucketStart: b2, min: null, avg: null, max: null },
        ])
    })

    it("baldes todos ausentes vira uma lista inteira de null, sem lançar", () => {
        const bucketStarts = [
            new Date("2026-01-15T00:00:00.000Z"),
            new Date("2026-01-15T01:00:00.000Z"),
        ]
        const result = fillMissingBuckets(bucketStarts, [])

        expect(result).toEqual(
            bucketStarts.map((bucketStart) => ({ bucketStart, min: null, avg: null, max: null })),
        )
    })
})
