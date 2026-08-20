import { describe, it, expect } from "vitest"
import { aggregateCompletedPowerBuckets } from "@/lib/realtimePowerBuckets"
import type { PowerHistoryPoint } from "@/hooks/usePowerHistory"

// Timestamps via construtor local (não string ISO/UTC) — a função sob teste
// usa setMinutes/setHours em hora LOCAL; construir aqui do mesmo jeito
// garante que o teste bate independente do fuso do ambiente que roda o CI.
const local = (h: number, m: number, s = 0): number => new Date(2026, 7, 20, h, m, s).getTime()

const point = (t: number, kw: number): PowerHistoryPoint => ({ t, kw })

describe("aggregateCompletedPowerBuckets", () => {
    it("sem leituras, devolve vazio", () => {
        expect(aggregateCompletedPowerBuckets([], "1h")).toEqual([])
    })

    it("1h: agrega por minuto dentro da hora corrente, sem o minuto em curso — bug real (agregado seg. a seg.)", () => {
        // Leituras a cada ~1s, 19:00:00 até 19:45:10 (último ponto = "agora").
        const history: PowerHistoryPoint[] = []
        for (let m = 0; m <= 45; m++) {
            const lastSecond = m === 45 ? 10 : 59
            for (let s = 0; s <= lastSecond; s++) {
                history.push(point(local(19, m, s), m + 1)) // kw = minuto+1, previsível pra checar a média
            }
        }

        const buckets = aggregateCompletedPowerBuckets(history, "1h")

        // 19:00 até 19:44 fechados (45 baldes) — 19:45 é o minuto em curso, não aparece.
        expect(buckets).toHaveLength(45)
        expect(buckets[0]).toEqual({ bucketStart: local(19, 0), kw: 1 })
        expect(buckets[44]).toEqual({ bucketStart: local(19, 44), kw: 45 })
        expect(buckets.some((b) => b.bucketStart === local(19, 45))).toBe(false)
    })

    it("1h: quando o relógio vira 19:46, o balde de 19:45 passa a aparecer", () => {
        const history: PowerHistoryPoint[] = [
            point(local(19, 44, 30), 45),
            point(local(19, 45, 0), 46),
            point(local(19, 45, 30), 46),
            point(local(19, 46, 5), 47), // último ponto — "agora" é 19:46
        ]

        const buckets = aggregateCompletedPowerBuckets(history, "1h")

        expect(buckets).toEqual([
            { bucketStart: local(19, 44), kw: 45 },
            { bucketStart: local(19, 45), kw: 46 }, // média de 46 e 46
        ])
    })

    it("1h: leituras de horas anteriores não entram — reinicia a cada hora, não é janela deslizante", () => {
        const history: PowerHistoryPoint[] = [
            point(local(18, 30), 100), // hora anterior — fora do período
            point(local(19, 0), 1),
            point(local(19, 30, 5), 2), // "agora" é 19:30
        ]

        const buckets = aggregateCompletedPowerBuckets(history, "1h")

        expect(buckets).toEqual([{ bucketStart: local(19, 0), kw: 1 }])
    })

    it("24h: agrega por hora dentro do dia corrente, sem a hora em curso", () => {
        const history: PowerHistoryPoint[] = [
            point(local(0, 5), 10),
            point(local(0, 45), 20),
            point(local(18, 0), 30),
            point(local(19, 10), 40), // último ponto — "agora" é 19h, hora 19 em curso
        ]

        const buckets = aggregateCompletedPowerBuckets(history, "24h")

        expect(buckets).toEqual([
            { bucketStart: local(0, 0), kw: 15 }, // média de 10 e 20
            { bucketStart: local(18, 0), kw: 30 },
        ])
    })

    it("24h: quando o relógio vira 20h, a hora 19 passa a aparecer", () => {
        const history: PowerHistoryPoint[] = [
            point(local(18, 0), 30),
            point(local(19, 10), 40),
            point(local(20, 1), 50), // "agora" é 20h
        ]

        const buckets = aggregateCompletedPowerBuckets(history, "24h")

        expect(buckets).toEqual([
            { bucketStart: local(18, 0), kw: 30 },
            { bucketStart: local(19, 0), kw: 40 },
        ])
    })

    it("baldes sem nenhuma amostra são omitidos, não viram zero (ex.: página aberta no meio da hora)", () => {
        // Buffer só tem dado a partir das 19:20 (página aberta nesse instante).
        // "Agora" é 19:26 (último ponto) — 19:25 já fechou.
        const history: PowerHistoryPoint[] = [
            point(local(19, 20), 5),
            point(local(19, 25, 30), 6),
            point(local(19, 26, 0), 7),
        ]

        const buckets = aggregateCompletedPowerBuckets(history, "1h")

        expect(buckets).toEqual([
            { bucketStart: local(19, 20), kw: 5 },
            { bucketStart: local(19, 25), kw: 6 },
        ])
        // Nada de 19:00–19:19 nem 19:21–19:24 preenchido com 0.
        expect(buckets).toHaveLength(2)
    })
})
