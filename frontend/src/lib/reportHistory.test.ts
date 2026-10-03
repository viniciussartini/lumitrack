import { describe, it, expect } from "vitest"
import {
    REMOVED_TARGET_LABEL,
    buildTargetLabelIndex,
    describeReport,
    formatReportPeriod,
} from "@/lib/reportHistory"
import type { Report } from "@/types/report.types"

const REPORT: Report = {
    id: "rep-1",
    targetType: "PROPERTY",
    targetId: "prop-1",
    type: "MONTHLY",
    format: "PDF",
    origin: "MANUAL",
    periodStart: "2026-07-01T03:00:00.000Z",
    periodEnd: "2026-08-01T03:00:00.000Z",
    fileName: "x.pdf",
    sizeBytes: 10,
    createdAt: "2026-08-01T12:30:00.000Z",
}

const LABELS = buildTargetLabelIndex([
    {
        label: "Propriedades",
        options: [
            { key: "PROPERTY:prop-1", targetType: "PROPERTY", targetId: "prop-1", label: "Casa" },
        ],
    },
])

describe("formatReportPeriod", () => {
    it("mostra o mês no relatório mensal", () => {
        expect(formatReportPeriod(REPORT)).toBe("julho de 2026")
    })

    it("mostra o intervalo no de consumo, com o último dia incluso", () => {
        expect(
            formatReportPeriod({
                type: "CONSUMPTION",
                periodStart: "2026-07-01T03:00:00.000Z",
                periodEnd: "2026-07-08T03:00:00.000Z",
            }),
        ).toBe("01/07/2026 a 07/07/2026")
    })
})

describe("describeReport", () => {
    it("monta título, origem/formato e data no horário de São Paulo", () => {
        expect(describeReport(REPORT, LABELS)).toEqual({
            title: "Mensal · Casa · julho de 2026",
            subtitle: "Geração manual · PDF",
            createdAt: "01/08/2026, 09:30:00",
        })
    })

    it("rotula o envio agendado", () => {
        expect(describeReport({ ...REPORT, origin: "SCHEDULED" }, LABELS).subtitle).toBe(
            "Envio agendado · PDF",
        )
    })

    it("usa um rótulo neutro quando o alvo foi removido do cadastro", () => {
        expect(describeReport({ ...REPORT, targetId: "sumiu" }, LABELS).title).toContain(
            REMOVED_TARGET_LABEL,
        )
    })
})
