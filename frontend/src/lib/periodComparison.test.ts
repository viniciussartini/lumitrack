import { describe, it, expect } from "vitest"
import {
    COMPARE_PERIOD_MAX_DAYS,
    buildComparePeriodsParams,
    buildCompareTargetGroups,
    countInclusiveDays,
    validateComparePeriods,
} from "@/lib/periodComparison"
import type { PeriodComparisonRun } from "@/lib/periodComparison"
import type { PropertyTree } from "@/types/property.types"

describe("countInclusiveDays", () => {
    it("conta início e fim como dias inteiros (mesmo dia = 1)", () => {
        expect(countInclusiveDays("2026-01-15", "2026-01-15")).toBe(1)
        expect(countInclusiveDays("2026-01-01", "2026-01-31")).toBe(31)
    })

    it("atravessa virada de mês e de ano", () => {
        expect(countInclusiveDays("2025-12-30", "2026-01-02")).toBe(4)
    })

    it("fevereiro bissexto tem 29 dias", () => {
        expect(countInclusiveDays("2028-02-01", "2028-02-29")).toBe(29)
    })
})

describe("validateComparePeriods", () => {
    const valid = {
        aStart: "2026-01-01",
        aEnd: "2026-01-07",
        bStart: "2026-02-01",
        bEnd: "2026-02-07",
    }

    it("aceita dois períodos de mesma duração", () => {
        expect(validateComparePeriods(valid)).toBeNull()
    })

    it("aceita períodos sobrepostos ou adjacentes, desde que de mesma duração", () => {
        expect(
            validateComparePeriods({
                aStart: "2026-05-01",
                aEnd: "2026-05-31",
                bStart: "2026-05-31",
                bEnd: "2026-06-30",
            }),
        ).toBeNull()
    })

    it("recusa quando o fim do período A é anterior ao início", () => {
        expect(validateComparePeriods({ ...valid, aStart: "2026-01-10", aEnd: "2026-01-02" })).toBe(
            "No período A, o fim não pode ser anterior ao início.",
        )
    })

    it("recusa quando o fim do período B é anterior ao início", () => {
        expect(validateComparePeriods({ ...valid, bStart: "2026-02-10", bEnd: "2026-02-02" })).toBe(
            "No período B, o fim não pode ser anterior ao início.",
        )
    })

    it("recusa durações diferentes, informando os dois valores", () => {
        expect(validateComparePeriods({ ...valid, bEnd: "2026-02-10" })).toBe(
            "Os dois períodos devem ter a mesma duração (A: 7 dias, B: 10 dias).",
        )
    })

    it("usa singular para 1 dia", () => {
        expect(
            validateComparePeriods({
                aStart: "2026-01-01",
                aEnd: "2026-01-01",
                bStart: "2026-02-01",
                bEnd: "2026-02-03",
            }),
        ).toBe("Os dois períodos devem ter a mesma duração (A: 1 dia, B: 3 dias).")
    })

    it(`recusa período acima de ${COMPARE_PERIOD_MAX_DAYS} dias`, () => {
        expect(
            validateComparePeriods({
                aStart: "2026-01-01",
                aEnd: "2026-04-05", // 95 dias
                bStart: "2026-05-01",
                bEnd: "2026-08-03", // 95 dias
            }),
        ).toBe(`Cada período pode ter no máximo ${COMPARE_PERIOD_MAX_DAYS} dias.`)
    })

    it(`aceita exatamente ${COMPARE_PERIOD_MAX_DAYS} dias`, () => {
        expect(
            validateComparePeriods({
                aStart: "2026-01-01",
                aEnd: "2026-04-02", // 92 dias
                bStart: "2026-05-01",
                bEnd: "2026-07-31", // 92 dias
            }),
        ).toBeNull()
    })

    it("com algum campo vazio ainda não há o que validar (o formulário exige o preenchimento)", () => {
        expect(validateComparePeriods({ ...valid, bEnd: "" })).toBeNull()
        expect(validateComparePeriods({ ...valid, aStart: "" })).toBeNull()
    })
})

describe("buildCompareTargetGroups", () => {
    const tree: PropertyTree = {
        total: 2,
        items: [
            {
                id: "prop-1",
                name: "Casa",
                areas: [
                    {
                        id: "area-1",
                        name: "Sala",
                        devices: [
                            { id: "dev-1", name: "TV", powerWatts: 100 },
                            { id: "dev-2", name: "Som", powerWatts: null },
                        ],
                    },
                ],
            },
            { id: "prop-2", name: "Loja", areas: [] },
        ],
    }

    it("agrupa em Propriedades, Áreas e Dispositivos, nessa ordem", () => {
        const groups = buildCompareTargetGroups(tree)

        expect(groups.map((group) => group.label)).toEqual([
            "Propriedades",
            "Áreas",
            "Dispositivos",
        ])
    })

    it("rótulos seguem o design: área com o nome da propriedade, dispositivo com o da área", () => {
        const [properties, areas, devices] = buildCompareTargetGroups(tree)

        expect(properties!.options.map((option) => option.label)).toEqual(["Casa", "Loja"])
        expect(areas!.options.map((option) => option.label)).toEqual(["Casa · Sala"])
        expect(devices!.options.map((option) => option.label)).toEqual(["Sala · TV", "Sala · Som"])
    })

    it("cada opção leva tipo e id do alvo, e uma chave única entre tipos", () => {
        const options = buildCompareTargetGroups(tree).flatMap((group) => group.options)

        expect(options[0]).toMatchObject({ targetType: "PROPERTY", targetId: "prop-1" })
        expect(new Set(options.map((option) => option.key)).size).toBe(options.length)
    })

    it("omite grupos vazios (sem áreas nem dispositivos cadastrados)", () => {
        const groups = buildCompareTargetGroups({
            total: 1,
            items: [{ id: "prop-1", name: "Casa", areas: [] }],
        })

        expect(groups.map((group) => group.label)).toEqual(["Propriedades"])
    })

    it("árvore vazia não gera grupo nenhum", () => {
        expect(buildCompareTargetGroups({ total: 0, items: [] })).toEqual([])
    })
})

describe("buildComparePeriodsParams", () => {
    const run: PeriodComparisonRun = {
        target: {
            key: "AREA:area-1",
            targetType: "AREA",
            targetId: "area-1",
            label: "Casa · Sala",
        },
        metric: "fp",
        aStart: "2026-01-01",
        aEnd: "2026-01-07",
        bStart: "2026-02-01",
        bEnd: "2026-02-07",
    }

    it("leva alvo e grandeza do run", () => {
        expect(buildComparePeriodsParams(run)).toMatchObject({
            targetType: "AREA",
            targetId: "area-1",
            metric: "fp",
        })
    })

    it("converte dias inteiros em instantes: meia-noite de São Paulo (UTC-3) do primeiro dia até a do dia seguinte ao último", () => {
        expect(buildComparePeriodsParams(run)).toMatchObject({
            fromA: "2026-01-01T03:00:00.000Z",
            toA: "2026-01-08T03:00:00.000Z",
            fromB: "2026-02-01T03:00:00.000Z",
            toB: "2026-02-08T03:00:00.000Z",
        })
    })

    it("último dia do mês e do ano: o fim exclusivo cai no dia 1 seguinte", () => {
        const params = buildComparePeriodsParams({
            ...run,
            aStart: "2025-12-25",
            aEnd: "2025-12-31",
            bStart: "2026-01-25",
            bEnd: "2026-01-31",
        })

        expect(params.toA).toBe("2026-01-01T03:00:00.000Z")
        expect(params.toB).toBe("2026-02-01T03:00:00.000Z")
    })

    it("dois períodos de mesma quantidade de dias viram instantes de mesma duração", () => {
        const params = buildComparePeriodsParams(run)

        expect(new Date(params.toA).getTime() - new Date(params.fromA).getTime()).toBe(
            new Date(params.toB).getTime() - new Date(params.fromB).getTime(),
        )
    })
})
