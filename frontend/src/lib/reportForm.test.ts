import { describe, it, expect } from "vitest"
import {
    buildCreateReportInput,
    buildMonthOptions,
    isReportPeriodFilled,
    validateReportForm,
    type ReportFormState,
} from "@/lib/reportForm"

const TARGET = {
    key: "PROPERTY:prop-1",
    targetType: "PROPERTY" as const,
    targetId: "prop-1",
    label: "Casa",
}

const consumption = (overrides: Partial<ReportFormState> = {}): ReportFormState => ({
    type: "CONSUMPTION",
    month: "",
    start: "2026-07-01",
    end: "2026-07-07",
    format: "PDF",
    ...overrides,
})

describe("validateReportForm", () => {
    it("aceita um período válido e o mensal sem checar datas", () => {
        expect(validateReportForm(consumption())).toBeNull()
        expect(
            validateReportForm(consumption({ type: "MONTHLY", start: "9", end: "1" })),
        ).toBeNull()
    })

    it("não reclama de período incompleto", () => {
        expect(validateReportForm(consumption({ end: "" }))).toBeNull()
    })

    it("rejeita fim anterior ao início", () => {
        expect(validateReportForm(consumption({ start: "2026-07-07", end: "2026-07-01" }))).toMatch(
            /anterior ao início/,
        )
    })

    it("aceita 92 dias e rejeita 93", () => {
        expect(
            validateReportForm(consumption({ start: "2026-01-01", end: "2026-04-02" })),
        ).toBeNull()
        expect(validateReportForm(consumption({ start: "2026-01-01", end: "2026-04-03" }))).toMatch(
            /no máximo 92 dias/,
        )
    })
})

describe("isReportPeriodFilled", () => {
    it("exige o mês no mensal e as duas datas no consumo", () => {
        expect(isReportPeriodFilled(consumption({ type: "MONTHLY", month: "" }))).toBe(false)
        expect(isReportPeriodFilled(consumption({ type: "MONTHLY", month: "2026-07" }))).toBe(true)
        expect(isReportPeriodFilled(consumption({ start: "" }))).toBe(false)
        expect(isReportPeriodFilled(consumption())).toBe(true)
    })
})

describe("buildCreateReportInput", () => {
    it("manda só o mês no relatório mensal", () => {
        expect(
            buildCreateReportInput(consumption({ type: "MONTHLY", month: "2026-07" }), TARGET),
        ).toEqual({
            type: "MONTHLY",
            targetType: "PROPERTY",
            targetId: "prop-1",
            format: "PDF",
            month: "2026-07",
        })
    })

    it("converte o consumo em instantes de meia-noite de São Paulo, com fim exclusivo", () => {
        expect(buildCreateReportInput(consumption({ format: "CSV" }), TARGET)).toEqual({
            type: "CONSUMPTION",
            targetType: "PROPERTY",
            targetId: "prop-1",
            format: "CSV",
            from: "2026-07-01T03:00:00.000Z",
            to: "2026-07-08T03:00:00.000Z",
        })
    })
})

describe("buildMonthOptions", () => {
    it("lista do mês atual para trás, virando o ano", () => {
        const options = buildMonthOptions(new Date(2026, 1, 15), 4)

        expect(options.map((o) => o.value)).toEqual(["2026-02", "2026-01", "2025-12", "2025-11"])
        expect(options[0]!.label).toBe("fevereiro de 2026")
    })
})
