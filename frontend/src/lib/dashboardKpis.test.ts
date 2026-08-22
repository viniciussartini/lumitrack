import { describe, it, expect, beforeAll, afterAll } from "vitest"
import {
    toLocalDateKey,
    bucketDateKey,
    findBucketForDate,
    toLocalMonthKey,
    bucketMonthKey,
    findBucketForMonth,
    computeTodayDelta,
    daysInMonth,
    computeMonthProjection,
} from "@/lib/dashboardKpis"
import type { ConsumptionBucket } from "@/types/consumption.types"

// O bug da #233 só se manifesta com um fuso de OFFSET NÃO-ZERO em relação a
// UTC (América/Sao_Paulo, -3h) — fixar o fuso do processo torna os testes
// abaixo determinísticos independente de onde rodam (a máquina de dev já
// está em America/Sao_Paulo, mas o runner de CI roda em UTC por padrão, o
// que mascararia justamente o bug que estes testes existem pra pegar).
const ORIGINAL_TZ = process.env.TZ
beforeAll(() => {
    process.env.TZ = "America/Sao_Paulo"
})
afterAll(() => {
    process.env.TZ = ORIGINAL_TZ
})

const bucket = (bucketStart: string, kwhConsumed: number): ConsumptionBucket => ({
    bucketStart,
    kwhConsumed,
    costBrl: kwhConsumed * 0.8,
    avgPowerW: 500,
})

/**
 * bucketStart no formato REAL que o backend produz pra bucket de dia
 * (issue #233): timestamp naive de meia-noite SP, cujos dígitos o driver
 * decodifica como se já fossem UTC — não um instante UTC de verdade. É
 * diferente (de propósito) de `new Date(...).toISOString()`, que aplicaria
 * a conversão de fuso real.
 */
const spDayBucketStart = (isoDate: string): string => `${isoDate}T00:00:00.000Z`

describe("toLocalDateKey", () => {
    it("formata a data local como YYYY-MM-DD", () => {
        const date = new Date(2026, 7, 3) // 3 de agosto de 2026 (mês 0-indexed)
        expect(toLocalDateKey(date)).toBe("2026-08-03")
    })

    it("preenche mês/dia com zero à esquerda", () => {
        const date = new Date(2026, 0, 5) // 5 de janeiro
        expect(toLocalDateKey(date)).toBe("2026-01-05")
    })
})

describe("bucketDateKey", () => {
    it("lê a data via getters UTC — desfaz a codificação naive-como-UTC do backend", () => {
        // Meia-noite de SP do dia 21, exatamente como o backend produz
        // (timeBucket.ts): não é um instante UTC de verdade, é o dia 21 com
        // os dígitos etiquetados como Z.
        expect(bucketDateKey("2026-08-21T00:00:00.000Z")).toBe("2026-08-21")
    })

    it("não teria batido com getters locais em fuso SP — é exatamente o bug da #233", () => {
        // Reproduz o cálculo que `toLocalDateKey` (getters LOCAIS) faria em
        // vez de `bucketDateKey`, comprovando que usar o decodificador
        // errado aqui devolveria o dia 20, não o 21.
        const wrongKeyViaLocalGetters = toLocalDateKey(new Date("2026-08-21T00:00:00.000Z"))
        expect(wrongKeyViaLocalGetters).not.toBe("2026-08-21")
        expect(bucketDateKey("2026-08-21T00:00:00.000Z")).toBe("2026-08-21")
    })
})

describe("findBucketForDate", () => {
    it("acha o bucket pela data, não pela posição", () => {
        const items = [
            bucket(spDayBucketStart("2026-08-01"), 5), // mais recente, mas NÃO é hoje
            bucket(spDayBucketStart("2026-07-31"), 3),
        ]
        const today = new Date(2026, 7, 3) // hoje é dia 3 — nenhum bucket bate
        expect(findBucketForDate(items, today)).toBeUndefined()

        const yesterday = new Date(2026, 6, 31)
        expect(findBucketForDate(items, yesterday)?.kwhConsumed).toBe(3)
    })

    it("acha o bucket de HOJE mesmo com a codificação real de meia-noite SP (issue #233)", () => {
        // Fixture de meio-dia UTC (como o teste antigo usava) nunca cruza
        // fronteira de dia em fuso nenhum — mascarava o bug. Meia-noite SP
        // naive-como-UTC é o caso real que quebrava: sem `bucketDateKey`,
        // `findBucketForDate` nunca achava o bucket de hoje.
        const today = new Date(2026, 7, 21) // 21 de agosto de 2026, local
        const items = [bucket(spDayBucketStart("2026-08-21"), 12.5)]

        expect(findBucketForDate(items, today)?.kwhConsumed).toBe(12.5)
    })

    it("retorna undefined para lista vazia", () => {
        expect(findBucketForDate([], new Date())).toBeUndefined()
    })
})

describe("bucketMonthKey", () => {
    it("lê o mês via getters UTC — desfaz a codificação naive-como-UTC do backend", () => {
        // Dia 1 de agosto, meia-noite SP, exatamente como o backend produz
        // pra bucket de mês (date_trunc('month', ...)).
        expect(bucketMonthKey("2026-08-01T00:00:00.000Z")).toBe("2026-08")
    })

    it("não teria batido com getters locais em fuso SP — é a mesma classe de bug da #233 (issue #234)", () => {
        // Reproduz o cálculo que `toLocalMonthKey` (getters LOCAIS) faria em
        // vez de `bucketMonthKey`: o dia 1 meia-noite SP vira dia 31 do mês
        // anterior às 21h em horário local — mês errado.
        const wrongKeyViaLocalGetters = toLocalMonthKey(new Date("2026-08-01T00:00:00.000Z"))
        expect(wrongKeyViaLocalGetters).not.toBe("2026-08")
        expect(bucketMonthKey("2026-08-01T00:00:00.000Z")).toBe("2026-08")
    })
})

describe("findBucketForMonth", () => {
    it("acha o bucket do MÊS CORRENTE mesmo com a codificação real de dia 1 meia-noite SP (issue #234)", () => {
        // Fixture de meio-dia (local ou UTC) nunca cruza fronteira de mês em
        // fuso nenhum — mascarava o bug, igual ao caso de dia da #233.
        const now = new Date(2026, 7, 21) // 21 de agosto de 2026, local
        const items = [bucket("2026-08-01T00:00:00.000Z", 120)]

        expect(findBucketForMonth(items, now)?.kwhConsumed).toBe(120)
    })

    it("retorna undefined para lista vazia", () => {
        expect(findBucketForMonth([], new Date())).toBeUndefined()
    })
})

describe("computeTodayDelta", () => {
    it("calcula a variação percentual normal", () => {
        expect(computeTodayDelta(12, 10)).toBeCloseTo(0.2)
        expect(computeTodayDelta(8, 10)).toBeCloseTo(-0.2)
    })

    it("retorna null quando ontem foi zero (não dá pra calcular)", () => {
        expect(computeTodayDelta(5, 0)).toBeNull()
    })
})

describe("daysInMonth", () => {
    it("calcula os dias de um mês de 31", () => {
        expect(daysInMonth(new Date(2026, 7, 15))).toBe(31) // agosto
    })

    it("calcula fevereiro de ano bissexto e não-bissexto", () => {
        expect(daysInMonth(new Date(2024, 1, 10))).toBe(29) // 2024 bissexto
        expect(daysInMonth(new Date(2026, 1, 10))).toBe(28)
    })
})

describe("computeMonthProjection", () => {
    it("projeta linearmente pelo restante do mês", () => {
        // R$100 acumulados em 10 dias, mês de 30 dias → projeta R$300
        expect(computeMonthProjection(100, 10, 30)).toBeCloseTo(300)
    })

    it("retorna o custo acumulado sem dividir quando dayOfMonth <= 0", () => {
        expect(computeMonthProjection(50, 0, 30)).toBe(50)
    })
})
