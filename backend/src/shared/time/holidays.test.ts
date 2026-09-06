import { describe, it, expect } from "vitest"
import {
    getEasterDate,
    getNationalHolidays,
    getNationalHolidaysInRange,
} from "@/shared/time/holidays.js"

function iso(date: Date): string {
    return date.toISOString().slice(0, 10)
}

describe("getEasterDate", () => {
    it("calcula a Páscoa de 2026 (2026-04-05)", () => {
        expect(iso(getEasterDate(2026))).toBe("2026-04-05")
    })

    it("calcula a Páscoa de 2024 (2024-03-31)", () => {
        expect(iso(getEasterDate(2024))).toBe("2024-03-31")
    })

    it("calcula a Páscoa de 2025 (2025-04-20)", () => {
        expect(iso(getEasterDate(2025))).toBe("2025-04-20")
    })
})

describe("getNationalHolidays", () => {
    it("inclui os feriados fixos de 2026", () => {
        const dates = getNationalHolidays(2026).map(iso)

        expect(dates).toContain("2026-01-01") // Confraternização
        expect(dates).toContain("2026-04-21") // Tiradentes
        expect(dates).toContain("2026-05-01") // Trabalho
        expect(dates).toContain("2026-09-07") // Independência
        expect(dates).toContain("2026-10-12") // Nossa Sr.ª Aparecida
        expect(dates).toContain("2026-11-02") // Finados
        expect(dates).toContain("2026-11-15") // Proclamação da República
        expect(dates).toContain("2026-11-20") // Consciência Negra (Lei 14.759/2023)
        expect(dates).toContain("2026-12-25") // Natal
    })

    it("deriva os feriados móveis a partir da Páscoa de 2026 (04-05)", () => {
        const dates = getNationalHolidays(2026).map(iso)

        // Carnaval: segunda e terça, Páscoa -48/-47
        expect(dates).toContain("2026-02-16")
        expect(dates).toContain("2026-02-17")
        // Sexta-Feira Santa: Páscoa -2
        expect(dates).toContain("2026-04-03")
        // Corpus Christi: Páscoa +60
        expect(dates).toContain("2026-06-04")
    })

    it("os feriados móveis mudam de data de um ano para o outro — uma lista fixa erraria", () => {
        const holidays2026 = getNationalHolidays(2026).map(iso)
        const holidays2027 = getNationalHolidays(2027).map(iso)

        const carnaval2026 = holidays2026.find((d) => d === "2026-02-16")
        const carnaval2027 = holidays2027.find((d) => d === "2027-02-16")

        expect(carnaval2026).toBeDefined()
        // A mesma data (dia/mês) do ano anterior NÃO é feriado no ano seguinte —
        // prova de que o cálculo é por Páscoa, não uma tabela copiada.
        expect(carnaval2027).toBeUndefined()
    })
})

describe("getNationalHolidaysInRange", () => {
    it("cobre os anos tocados por um intervalo que atravessa a virada do ano", () => {
        const dates = getNationalHolidaysInRange(
            new Date("2026-12-20T00:00:00Z"),
            new Date("2027-01-10T00:00:00Z"),
        ).map(iso)

        expect(dates).toContain("2026-12-25")
        expect(dates).toContain("2027-01-01")
    })

    it("retorna só os feriados do ano quando o intervalo cabe num ano só", () => {
        const dates = getNationalHolidaysInRange(
            new Date("2026-01-01T00:00:00Z"),
            new Date("2026-12-31T00:00:00Z"),
        ).map(iso)

        expect(dates.every((d) => d.startsWith("2026"))).toBe(true)
        expect(dates).not.toContain("2027-01-01")
    })
})
