import { describe, expect, it } from "vitest"
import { formatRelativeTime } from "@/lib/formatters/relativeTime"

// 16/10/2026, 15:30 em São Paulo (UTC-3).
const NOW = new Date("2026-10-16T18:30:00.000Z")
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const MIN = 60_000
const HOUR = 60 * MIN

describe("formatRelativeTime", () => {
    it("menos de um minuto é 'agora'", () => {
        expect(formatRelativeTime(ago(0), NOW)).toBe("agora")
        expect(formatRelativeTime(ago(59_000), NOW)).toBe("agora")
    })

    it("um instante no futuro (relógios diferentes) também é 'agora'", () => {
        expect(formatRelativeTime(ago(-30_000), NOW)).toBe("agora")
    })

    it("até uma hora, em minutos", () => {
        expect(formatRelativeTime(ago(MIN), NOW)).toBe("há 1 min")
        expect(formatRelativeTime(ago(2 * MIN + 30_000), NOW)).toBe("há 2 min")
        expect(formatRelativeTime(ago(59 * MIN), NOW)).toBe("há 59 min")
    })

    it("no mesmo dia, em horas", () => {
        expect(formatRelativeTime(ago(HOUR), NOW)).toBe("há 1 h")
        expect(formatRelativeTime(ago(2 * HOUR + 10 * MIN), NOW)).toBe("há 2 h")
    })

    it("no dia anterior, 'ontem', mesmo com menos de 24 h", () => {
        // 15:30 de hoje menos 16 h = 23:30 de ontem.
        expect(formatRelativeTime(ago(16 * HOUR), NOW)).toBe("ontem")
        expect(formatRelativeTime(ago(26 * HOUR), NOW)).toBe("ontem")
    })

    it("o dia é o de São Paulo, não o do fuso do navegador", () => {
        // 01:00 UTC de 16/10 ainda é 22:00 de 15/10 em São Paulo: ontem.
        expect(formatRelativeTime("2026-10-16T01:00:00.000Z", NOW)).toBe("ontem")
        // 04:00 UTC de 16/10 já é 01:00 de hoje em São Paulo.
        expect(formatRelativeTime("2026-10-16T04:00:00.000Z", NOW)).toBe("há 14 h")
    })

    it("antes de ontem, a data", () => {
        expect(formatRelativeTime("2026-10-10T18:30:00.000Z", NOW)).toBe("10/10/2026")
    })

    it("data inválida não inventa um tempo", () => {
        expect(formatRelativeTime("não é data", NOW)).toBe("-")
    })
})
