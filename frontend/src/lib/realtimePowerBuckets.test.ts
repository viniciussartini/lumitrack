import { describe, it, expect } from "vitest"
import { buildDenseWindowBuckets, type SparsePowerBucket } from "@/lib/realtimePowerBuckets"

// SP é UTC-3 fixo (sem horário de verão desde 2019). "Agora" é sempre um
// epoch verdadeiro; os buckets esparsos de entrada replicam o formato que o
// backend devolve (`meter-reading.repository.ts::findAggregated`): dígitos
// de SP "mascarados" como UTC, sem o deslocamento de +3h.
const SP_OFFSET_MS = 3 * 60 * 60 * 1000

/** Epoch verdadeiro correspondente ao relógio de parede de SP h:m:s. */
const trueEpoch = (h: number, m: number, s = 0): number =>
    Date.UTC(2026, 7, 20, h, m, s) + SP_OFFSET_MS

/** bucketStart "mascarado" (como o backend devolve) para o balde h:m de SP. */
const masked = (h: number, m = 0): number => Date.UTC(2026, 7, 20, h, m, 0)

const sparse = (h: number, m: number, avgPowerW: number): SparsePowerBucket => ({
    bucketStart: masked(h, m),
    avgPowerW,
})

describe("buildDenseWindowBuckets", () => {
    it("sem nenhum balde esparso, devolve o período inteiro zerado (não vazio)", () => {
        const buckets = buildDenseWindowBuckets([], "1h", trueEpoch(19, 45, 10))

        expect(buckets).toHaveLength(45) // 19:00..19:44
        expect(buckets.every((b) => b.kw === 0)).toBe(true)
        expect(buckets[0]!.bucketStart).toBe(trueEpoch(19, 0))
        expect(buckets[44]!.bucketStart).toBe(trueEpoch(19, 44))
    })

    it("1h: agrega por minuto dentro da hora corrente, sem o minuto em curso", () => {
        const sparseBuckets = Array.from({ length: 45 }, (_, m) => sparse(19, m, (m + 1) * 1000))

        const buckets = buildDenseWindowBuckets(sparseBuckets, "1h", trueEpoch(19, 45, 10))

        expect(buckets).toHaveLength(45)
        expect(buckets[0]).toEqual({ bucketStart: trueEpoch(19, 0), kw: 1 })
        expect(buckets[44]).toEqual({ bucketStart: trueEpoch(19, 44), kw: 45 })
        expect(buckets.some((b) => b.bucketStart === trueEpoch(19, 45))).toBe(false)
    })

    it("1h: minuto sem leitura fica zerado (kw: 0), não é omitido", () => {
        // Só os minutos 19:00 e 19:02 têm dado — 19:01 fica no meio, sem nada.
        const sparseBuckets = [sparse(19, 0, 500), sparse(19, 2, 700)]

        const buckets = buildDenseWindowBuckets(sparseBuckets, "1h", trueEpoch(19, 3, 0))

        expect(buckets).toHaveLength(3)
        expect(buckets[0]).toEqual({ bucketStart: trueEpoch(19, 0), kw: 0.5 })
        expect(buckets[1]).toEqual({ bucketStart: trueEpoch(19, 1), kw: 0 })
        expect(buckets[2]).toEqual({ bucketStart: trueEpoch(19, 2), kw: 0.7 })
    })

    it("1h: quando o relógio vira 19:46, o balde de 19:45 passa a aparecer", () => {
        const sparseBuckets = [sparse(19, 44, 45000), sparse(19, 45, 46000)]

        const buckets = buildDenseWindowBuckets(sparseBuckets, "1h", trueEpoch(19, 46, 5))

        expect(buckets).toHaveLength(46) // 19:00..19:45
        expect(buckets[44]).toEqual({ bucketStart: trueEpoch(19, 44), kw: 45 })
        expect(buckets[45]).toEqual({ bucketStart: trueEpoch(19, 45), kw: 46 })
        // antes da mudança do relógio, 19:45 nem existia como balde fechado.
        expect(buckets.some((b) => b.bucketStart === trueEpoch(19, 46))).toBe(false)
    })

    it("1h: baldes de horas anteriores não entram — reinicia a cada hora, não é janela deslizante", () => {
        const sparseBuckets = [sparse(18, 30, 100000), sparse(19, 0, 1000)]

        const buckets = buildDenseWindowBuckets(sparseBuckets, "1h", trueEpoch(19, 30, 5))

        expect(buckets).toHaveLength(30)
        expect(buckets[0]).toEqual({ bucketStart: trueEpoch(19, 0), kw: 1 })
        expect(buckets.slice(1).every((b) => b.kw === 0)).toBe(true)
    })

    it("24h: agrega por hora dentro do dia corrente, sem a hora em curso, zerando horas sem dado", () => {
        const sparseBuckets = [sparse(0, 0, 10000), sparse(18, 0, 30000)]

        const buckets = buildDenseWindowBuckets(sparseBuckets, "24h", trueEpoch(19, 10))

        expect(buckets).toHaveLength(19) // 0h..18h
        expect(buckets[0]).toEqual({ bucketStart: trueEpoch(0, 0), kw: 10 })
        expect(buckets[18]).toEqual({ bucketStart: trueEpoch(18, 0), kw: 30 })
        // horas 1..17 sem dado ficam zeradas
        expect(buckets.slice(1, 18).every((b) => b.kw === 0)).toBe(true)
    })

    it("24h: quando o relógio vira 20h, a hora 19 passa a aparecer", () => {
        const sparseBuckets = [sparse(18, 0, 30000), sparse(19, 0, 40000)]

        const buckets = buildDenseWindowBuckets(sparseBuckets, "24h", trueEpoch(20, 1))

        expect(buckets[18]).toEqual({ bucketStart: trueEpoch(18, 0), kw: 30 })
        expect(buckets[19]).toEqual({ bucketStart: trueEpoch(19, 0), kw: 40 })
        expect(buckets).toHaveLength(20)
    })
})
