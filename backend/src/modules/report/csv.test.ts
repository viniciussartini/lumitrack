import { describe, it, expect } from "vitest"
import { buildCsv, csvCell } from "@/modules/report/csv.js"

describe("csvCell", () => {
    it("representa ausência como '-', nunca como zero", () => {
        expect(csvCell(null)).toBe("-")
        expect(csvCell(0)).toBe("0")
    })

    it("usa vírgula decimal nos números", () => {
        expect(csvCell(12.5)).toBe("12,5")
        expect(csvCell(-3.25)).toBe("-3,25")
    })

    it("trata número não finito como ausente", () => {
        expect(csvCell(Number.NaN)).toBe("-")
        expect(csvCell(Number.POSITIVE_INFINITY)).toBe("-")
    })

    it.each(["=1+1", "+cmd", "-cmd", "@SUM(A1)", "\tx"])(
        "neutraliza texto que uma planilha leria como fórmula: %j",
        (text) => {
            expect(csvCell(text).replaceAll('"', "").startsWith("'")).toBe(true)
        },
    )

    it("não altera o marcador de ausência escrito como texto", () => {
        expect(csvCell("-")).toBe("-")
    })

    it("escapa separador, aspas e quebra de linha", () => {
        expect(csvCell("a;b")).toBe('"a;b"')
        expect(csvCell('diz "oi"')).toBe('"diz ""oi"""')
        expect(csvCell("a\nb")).toBe('"a\nb"')
    })
})

describe("buildCsv", () => {
    it("gera BOM UTF-8, separador ';' e linhas CRLF", () => {
        const csv = buildCsv([
            ["Dia", "kWh"],
            ["01/07", 14.2],
            ["02/07", null],
        ])

        const text = csv.toString("utf8")
        expect(text.startsWith("﻿")).toBe(true)
        expect(text.slice(1)).toBe("Dia;kWh\r\n01/07;14,2\r\n02/07;-\r\n")
    })
})
