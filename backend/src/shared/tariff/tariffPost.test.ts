import { describe, it, expect } from "vitest"
import { classifyPost, type PeakWindowConfig } from "@/shared/tariff/tariffPost.js"
import { getNationalHolidays } from "@/shared/time/holidays.js"

const PEAK_WINDOW: PeakWindowConfig = { peakWindowStartHour: 18, peakWindowEndHour: 21 }

describe("classifyPost", () => {
    it("classifica como PEAK um dia útil dentro da janela de ponta", () => {
        // 2026-09-08 é terça-feira, dia útil
        const timestamp = new Date(Date.UTC(2026, 8, 8, 19, 30))
        expect(classifyPost(timestamp, PEAK_WINDOW, [])).toBe("PEAK")
    })

    it("classifica como OFF_PEAK um dia útil fora da janela de ponta", () => {
        const timestamp = new Date(Date.UTC(2026, 8, 8, 10, 0))
        expect(classifyPost(timestamp, PEAK_WINDOW, [])).toBe("OFF_PEAK")
    })

    it("inclui a borda inicial da janela (peakWindowStartHour)", () => {
        const timestamp = new Date(Date.UTC(2026, 8, 8, 18, 0))
        expect(classifyPost(timestamp, PEAK_WINDOW, [])).toBe("PEAK")
    })

    it("exclui a borda final da janela (peakWindowEndHour)", () => {
        const timestamp = new Date(Date.UTC(2026, 8, 8, 21, 0))
        expect(classifyPost(timestamp, PEAK_WINDOW, [])).toBe("OFF_PEAK")
    })

    it("classifica como OFF_PEAK um sábado mesmo dentro do horário de ponta (RN25)", () => {
        // 2026-09-05 é sábado
        const timestamp = new Date(Date.UTC(2026, 8, 5, 19, 30))
        expect(classifyPost(timestamp, PEAK_WINDOW, [])).toBe("OFF_PEAK")
    })

    it("classifica como OFF_PEAK um domingo mesmo dentro do horário de ponta (RN25)", () => {
        // 2026-09-06 é domingo
        const timestamp = new Date(Date.UTC(2026, 8, 6, 19, 30))
        expect(classifyPost(timestamp, PEAK_WINDOW, [])).toBe("OFF_PEAK")
    })

    it("classifica como OFF_PEAK um feriado fixo mesmo dentro do horário de ponta (RN25)", () => {
        // 2026-09-07 é segunda-feira, Independência — seria dia útil se não fosse feriado
        const holidays = getNationalHolidays(2026)
        const timestamp = new Date(Date.UTC(2026, 8, 7, 19, 30))
        expect(classifyPost(timestamp, PEAK_WINDOW, holidays)).toBe("OFF_PEAK")
    })

    it("classifica como OFF_PEAK um feriado móvel (Carnaval) mesmo dentro do horário de ponta (RN25)", () => {
        // Carnaval 2026: 2026-02-17 (terça), dia que seria útil se não fosse feriado
        const holidays = getNationalHolidays(2026)
        const timestamp = new Date(Date.UTC(2026, 1, 17, 19, 30))
        expect(classifyPost(timestamp, PEAK_WINDOW, holidays)).toBe("OFF_PEAK")
    })

    it("não confunde o dia seguinte a um feriado móvel com o próprio feriado", () => {
        const holidays = getNationalHolidays(2026)
        // 2026-02-18 (quarta) — dia útil normal, logo após o Carnaval
        const timestamp = new Date(Date.UTC(2026, 1, 18, 19, 30))
        expect(classifyPost(timestamp, PEAK_WINDOW, holidays)).toBe("PEAK")
    })
})
