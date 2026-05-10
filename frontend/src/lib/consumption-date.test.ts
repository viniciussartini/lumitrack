import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
    todayForPeriod,
    formInputToIso,
    isoToFormInput,
    periodToInputType,
    periodToDateLabel,
} from "@/lib/consumption-date"

// ─────────────────────────────────────────────────────────────────────────────
// todayForPeriod
//
// Usamos vi.useFakeTimers() pra controlar "agora" e tornar os testes
// determinísticos. Sem isso, o teste passaria/falharia em segundos
// específicos do dia.
// ─────────────────────────────────────────────────────────────────────────────

describe("todayForPeriod", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        // Fixar 06/05/2026 às 14:30 LOCAL — não usar Z aqui (queremos local)
        vi.setSystemTime(new Date(2026, 4, 6, 14, 30, 0))
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("HOURLY: retorna 'YYYY-MM-DDTHH:MM' no fuso local", () => {
        expect(todayForPeriod("HOURLY")).toBe("2026-05-06T14:30")
    })

    it("DAILY: retorna 'YYYY-MM-DD'", () => {
        expect(todayForPeriod("DAILY")).toBe("2026-05-06")
    })

    it("MONTHLY: retorna 'YYYY-MM'", () => {
        expect(todayForPeriod("MONTHLY")).toBe("2026-05")
    })

    it("ANNUAL: retorna apenas 'YYYY'", () => {
        expect(todayForPeriod("ANNUAL")).toBe("2026")
    })

    it("padroniza com zero à esquerda em mês/dia de um dígito", () => {
        vi.setSystemTime(new Date(2026, 0, 5, 9, 5, 0)) // 05/01/2026 09:05
        expect(todayForPeriod("HOURLY")).toBe("2026-01-05T09:05")
        expect(todayForPeriod("DAILY")).toBe("2026-01-05")
        expect(todayForPeriod("MONTHLY")).toBe("2026-01")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// formInputToIso
// ─────────────────────────────────────────────────────────────────────────────

describe("formInputToIso (DAILY/MONTHLY/ANNUAL)", () => {
    // Estes 3 são desacoplados de TZ — montamos string fixa T12:00:00.000Z

    it("DAILY: '2025-01-15' → '2025-01-15T12:00:00.000Z'", () => {
        expect(formInputToIso("2025-01-15", "DAILY")).toBe(
            "2025-01-15T12:00:00.000Z",
        )
    })

    it("MONTHLY: '2025-01' → '2025-01-01T12:00:00.000Z'", () => {
        expect(formInputToIso("2025-01", "MONTHLY")).toBe(
            "2025-01-01T12:00:00.000Z",
        )
    })

    it("ANNUAL: '2025' → '2025-01-01T12:00:00.000Z'", () => {
        expect(formInputToIso("2025", "ANNUAL")).toBe(
            "2025-01-01T12:00:00.000Z",
        )
    })
})

describe("formInputToIso (HOURLY)", () => {
    // HOURLY interpreta a string como LOCAL e converte pra UTC.
    // Não dá pra asserção exata sem fixar TZ (que vitest não isola por
    // padrão), então testamos invariantes.

    it("retorna string ISO válida no formato '...Z'", () => {
        const result = formInputToIso("2025-01-15T14:00", "HOURLY")
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    })

    it("é round-trip com isoToFormInput (HOURLY → ISO → HOURLY)", () => {
        const original = "2025-01-15T14:00"
        const iso = formInputToIso(original, "HOURLY")
        const back = isoToFormInput(iso, "HOURLY")
        expect(back).toBe(original)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// isoToFormInput
// ─────────────────────────────────────────────────────────────────────────────

describe("isoToFormInput (DAILY/MONTHLY/ANNUAL)", () => {
    // ISOs com T12:00:00.000Z — mesmo invariante que formInputToIso usa

    it("DAILY: '2025-01-15T12:00:00.000Z' → '2025-01-15'", () => {
        expect(isoToFormInput("2025-01-15T12:00:00.000Z", "DAILY")).toBe(
            "2025-01-15",
        )
    })

    it("MONTHLY: '2025-01-01T12:00:00.000Z' → '2025-01'", () => {
        expect(isoToFormInput("2025-01-01T12:00:00.000Z", "MONTHLY")).toBe(
            "2025-01",
        )
    })

    it("ANNUAL: '2025-01-01T12:00:00.000Z' → '2025'", () => {
        expect(isoToFormInput("2025-01-01T12:00:00.000Z", "ANNUAL")).toBe(
            "2025",
        )
    })

    it("DAILY: tolera ISO em outros instantes do dia (usa getUTCDate)", () => {
        // Mesmo se backend envia midnight UTC ou outro instante, o dia
        // representado em UTC é o que importa
        expect(isoToFormInput("2025-01-15T23:00:00.000Z", "DAILY")).toBe(
            "2025-01-15",
        )
    })
})

describe("isoToFormInput (round-trip)", () => {
    it("DAILY: ISO → form → ISO mantém o mesmo dia", () => {
        const original = "2025-01-15T12:00:00.000Z"
        const form = isoToFormInput(original, "DAILY")
        const back = formInputToIso(form, "DAILY")
        expect(back).toBe(original)
    })

    it("MONTHLY: ISO → form → ISO mantém o mesmo mês", () => {
        const original = "2025-01-01T12:00:00.000Z"
        const form = isoToFormInput(original, "MONTHLY")
        const back = formInputToIso(form, "MONTHLY")
        expect(back).toBe(original)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// periodToInputType / periodToDateLabel
// ─────────────────────────────────────────────────────────────────────────────

describe("periodToInputType", () => {
    it("HOURLY → datetime-local", () => {
        expect(periodToInputType("HOURLY")).toBe("datetime-local")
    })
    it("DAILY → date", () => {
        expect(periodToInputType("DAILY")).toBe("date")
    })
    it("MONTHLY → month", () => {
        expect(periodToInputType("MONTHLY")).toBe("month")
    })
    it("ANNUAL → number (não existe input type='year')", () => {
        expect(periodToInputType("ANNUAL")).toBe("number")
    })
})

describe("periodToDateLabel", () => {
    it("retorna labels claras pro form", () => {
        expect(periodToDateLabel("HOURLY")).toBe("Data e hora")
        expect(periodToDateLabel("DAILY")).toBe("Data")
        expect(periodToDateLabel("MONTHLY")).toBe("Mês")
        expect(periodToDateLabel("ANNUAL")).toBe("Ano")
    })
})