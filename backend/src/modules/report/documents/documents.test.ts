import { describe, it, expect } from "vitest"
import { buildAlertsDocument } from "@/modules/report/documents/alertsDocument.js"
import { buildDemandDocument } from "@/modules/report/documents/demandDocument.js"
import { buildPowerQualityDocument } from "@/modules/report/documents/powerQualityDocument.js"
import { formatDuration } from "@/modules/report/generators/format.js"
import { generateReportCsv } from "@/modules/report/generators/reportCsv.js"
import { generateReportPdf } from "@/modules/report/generators/reportPdf.js"
import type { ReportBase } from "@/modules/report/report.types.js"

const BASE: ReportBase = {
    type: "DEMAND",
    generatedAt: new Date("2026-08-02T12:00:00.000Z"),
    target: { kind: "Propriedade", name: "Fábrica" },
    property: { name: "Fábrica", distributorName: "Cemig", tariffLabel: "Grupo A · A4" },
    period: {
        from: new Date("2026-07-01T03:00:00.000Z"),
        to: new Date("2026-08-01T03:00:00.000Z"),
    },
}

describe("formatDuration", () => {
    it.each([
        [45, "45 s"],
        [720, "12 min"],
        [3600, "1 h"],
        [4800, "1 h 20 min"],
    ])("%s s → %s", (seconds, expected) => {
        expect(formatDuration(seconds)).toBe(expected)
    })
})

describe("buildDemandDocument", () => {
    it("calcula o percentual usado e só aponta ultrapassagem acima da contratada", () => {
        const document = buildDemandDocument(BASE, "Azul", [
            { postLabel: "Ponta", contractedKw: 100, measuredKw: 100, peakAt: null },
            { postLabel: "Fora de ponta", contractedKw: 200, measuredKw: 230, peakAt: null },
        ])

        const [peak, offPeak] = document.tables[0]!.rows
        expect(peak?.[4]).toBe("Dentro do contratado")
        expect(offPeak?.[3]).toEqual({ value: 115, digits: 1 })
        expect(offPeak?.[4]).toBe("Ultrapassou")
        expect(
            document.summary.find((line) => line.label === "Postos com ultrapassagem")?.value,
        ).toBe(1)
    })

    it("sem medição, demanda, percentual e situação ficam ausentes — nunca zero", () => {
        const document = buildDemandDocument(BASE, "Verde", [
            { postLabel: "Único", contractedKw: 100, measuredKw: null, peakAt: null },
        ])

        expect(document.tables[0]!.rows[0]).toEqual([
            "Único",
            { value: 100, digits: 1 },
            { value: null, digits: 1 },
            { value: null, digits: 1 },
            null,
            null,
        ])
    })
})

describe("buildAlertsDocument", () => {
    it("soma o tempo em disparo e destaca a maior potência", () => {
        const episode = {
            alertName: "Chuveiro",
            referencePowerKw: 5.5,
            tolerancePercent: 2,
            startedAt: new Date("2026-07-10T13:00:00Z"),
            endedAt: new Date("2026-07-10T13:10:00Z"),
            durationSeconds: 600,
            minPowerW: 5400,
            avgPowerW: 5500,
            maxPowerW: 5600,
        }

        const document = buildAlertsDocument({ ...BASE, type: "ALERTS" }, [
            episode,
            { ...episode, durationSeconds: 1800, maxPowerW: 5900 },
        ])

        expect(document.summary).toEqual([
            { label: "Episódios de disparo", value: 2 },
            { label: "Tempo total em disparo", value: "40 min" },
            { label: "Maior potência registrada (W)", value: { value: 5900, digits: 0 } },
        ])
    })

    it("sem episódios, o tempo e a potência ficam ausentes", () => {
        const document = buildAlertsDocument({ ...BASE, type: "ALERTS" }, [])

        expect(document.summary[1]?.value).toBeNull()
        expect(document.tables[0]!.rows).toEqual([])
    })
})

describe("geradores de documento", () => {
    const quality = buildPowerQualityDocument(
        { ...BASE, type: "POWER_QUALITY" },
        {
            period: { avgVoltagePhaseA: { min: 219.5, avg: 220.04, max: 221 } },
            daily: [{ day: new Date("2026-07-10T00:00:00Z"), averages: { voltage: 220.04 } }],
        },
    )

    it("o CSV arredonda às casas de exibição e marca a ausência com '-'", () => {
        const csv = generateReportCsv(quality).toString("utf8")

        expect(csv).toContain("Tensão (V);A;219,5;220;221")
        expect(csv).toContain("Corrente (A);A;-;-;-")
        expect(csv).toContain("10/07/2026;220")
    })

    it("o PDF é válido mesmo sem nenhuma linha numa das tabelas", async () => {
        const empty = buildPowerQualityDocument(
            { ...BASE, type: "POWER_QUALITY" },
            { period: {}, daily: [] },
        )

        const pdf = await generateReportPdf(empty)

        expect(pdf.subarray(0, 4).toString("latin1")).toBe("%PDF")
    })
})
