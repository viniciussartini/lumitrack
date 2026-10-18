import { describe, it, expect } from "vitest"
import {
    classifyPost,
    getIntermediateHours,
    type PeakWindowConfig,
} from "@/shared/tariff/tariffPost.js"
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

    it("classifica como OFF_PEAK um sábado mesmo dentro do horário de ponta", () => {
        // 2026-09-05 é sábado
        const timestamp = new Date(Date.UTC(2026, 8, 5, 19, 30))
        expect(classifyPost(timestamp, PEAK_WINDOW, [])).toBe("OFF_PEAK")
    })

    it("classifica como OFF_PEAK um domingo mesmo dentro do horário de ponta", () => {
        // 2026-09-06 é domingo
        const timestamp = new Date(Date.UTC(2026, 8, 6, 19, 30))
        expect(classifyPost(timestamp, PEAK_WINDOW, [])).toBe("OFF_PEAK")
    })

    it("classifica como OFF_PEAK um feriado fixo mesmo dentro do horário de ponta", () => {
        // 2026-09-07 é segunda-feira, Independência — seria dia útil se não fosse feriado
        const holidays = getNationalHolidays(2026)
        const timestamp = new Date(Date.UTC(2026, 8, 7, 19, 30))
        expect(classifyPost(timestamp, PEAK_WINDOW, holidays)).toBe("OFF_PEAK")
    })

    it("classifica como OFF_PEAK um feriado móvel (Carnaval) mesmo dentro do horário de ponta", () => {
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

    it("sem includeIntermediate (default), classifica a 1h antes/depois da ponta como OFF_PEAK — Grupo A intocado", () => {
        // 2026-09-08 é terça-feira, dia útil
        const hourBeforePeak = new Date(Date.UTC(2026, 8, 8, 17, 30))
        const hourAfterPeak = new Date(Date.UTC(2026, 8, 8, 21, 30))
        expect(classifyPost(hourBeforePeak, PEAK_WINDOW, [])).toBe("OFF_PEAK")
        expect(classifyPost(hourAfterPeak, PEAK_WINDOW, [])).toBe("OFF_PEAK")
    })

    it("com includeIntermediate=true, classifica a 1h antes da ponta como INTERMEDIATE", () => {
        const timestamp = new Date(Date.UTC(2026, 8, 8, 17, 30))
        expect(classifyPost(timestamp, PEAK_WINDOW, [], true)).toBe("INTERMEDIATE")
    })

    it("com includeIntermediate=true, classifica a 1h depois da ponta como INTERMEDIATE", () => {
        const timestamp = new Date(Date.UTC(2026, 8, 8, 21, 30))
        expect(classifyPost(timestamp, PEAK_WINDOW, [], true)).toBe("INTERMEDIATE")
    })

    it("com includeIntermediate=true, não estende INTERMEDIATE alem de 1h antes/depois", () => {
        const twoHoursBefore = new Date(Date.UTC(2026, 8, 8, 16, 30))
        const twoHoursAfter = new Date(Date.UTC(2026, 8, 8, 22, 30))
        expect(classifyPost(twoHoursBefore, PEAK_WINDOW, [], true)).toBe("OFF_PEAK")
        expect(classifyPost(twoHoursAfter, PEAK_WINDOW, [], true)).toBe("OFF_PEAK")
    })

    it("com includeIntermediate=true, fim de semana continua OFF_PEAK mesmo na hora intermediária", () => {
        // 2026-09-05 é sábado
        const timestamp = new Date(Date.UTC(2026, 8, 5, 17, 30))
        expect(classifyPost(timestamp, PEAK_WINDOW, [], true)).toBe("OFF_PEAK")
    })

    it("com includeIntermediate=true, feriado continua OFF_PEAK mesmo na hora intermediária", () => {
        const holidays = getNationalHolidays(2026)
        // 2026-09-07 é segunda-feira, Independência
        const timestamp = new Date(Date.UTC(2026, 8, 7, 17, 30))
        expect(classifyPost(timestamp, PEAK_WINDOW, holidays, true)).toBe("OFF_PEAK")
    })
})

describe("getIntermediateHours", () => {
    it("deriva 1h antes e 1h depois da janela de ponta", () => {
        expect(getIntermediateHours(PEAK_WINDOW)).toEqual({
            hourBeforePeak: 17,
            hourAfterPeak: 21,
        })
    })

    it("usa aritmética modular quando o início da ponta é meia-noite", () => {
        const midnightPeak: PeakWindowConfig = { peakWindowStartHour: 0, peakWindowEndHour: 3 }
        expect(getIntermediateHours(midnightPeak)).toEqual({
            hourBeforePeak: 23,
            hourAfterPeak: 3,
        })
    })

    it("usa aritmética modular quando o fim da ponta é a última hora do dia", () => {
        const latePeak: PeakWindowConfig = { peakWindowStartHour: 22, peakWindowEndHour: 24 }
        expect(getIntermediateHours(latePeak)).toEqual({
            hourBeforePeak: 21,
            hourAfterPeak: 0,
        })
    })
})
