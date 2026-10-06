import { describe, expect, it } from "vitest"
import { describePeakWindow, peakShareOfMonth } from "@/lib/peakHours"
import type { GroupABreakdown } from "@/types/consumption.types"

const breakdown = (energyByPost: GroupABreakdown["energyByPost"]): GroupABreakdown => ({
    contractedDemandKw: 200,
    demandByPost: [],
    demandBrl: 0,
    ultrapassagemBrl: 0,
    energyByPost,
    ereByWindow: [],
    ereBrl: 0,
    flagBrl: 0,
    taxesBrl: 0,
    publicLightingFeeBrl: 0,
})

describe("describePeakWindow", () => {
    it("diz a janela da distribuidora e os dias que ficam de fora", () => {
        expect(describePeakWindow(18, 21)).toBe(
            "Seg a sex, 18h–21h · excluídos sábados, domingos e feriados",
        )
    })

    it("usa as horas que a distribuidora configurou, sem horário fixo", () => {
        expect(describePeakWindow(17, 20)).toBe(
            "Seg a sex, 17h–20h · excluídos sábados, domingos e feriados",
        )
    })

    it("sem janela configurada não há texto", () => {
        expect(describePeakWindow(null, 21)).toBeNull()
        expect(describePeakWindow(18, null)).toBeNull()
        expect(describePeakWindow(null, null)).toBeNull()
    })
})

describe("peakShareOfMonth", () => {
    it("é o kWh de ponta sobre o kWh total dos postos da conta, em %", () => {
        const share = peakShareOfMonth(
            breakdown([
                { post: "PEAK", kwhConsumed: 31, brl: 40 },
                { post: "OFF_PEAK", kwhConsumed: 69, brl: 30 },
            ]),
        )

        expect(share).toBeCloseTo(31)
    })

    it("mês com consumo só fora da ponta tem 0% de ponta, de verdade", () => {
        const share = peakShareOfMonth(breakdown([{ post: "OFF_PEAK", kwhConsumed: 50, brl: 20 }]))

        expect(share).toBe(0)
    })

    it("sem consumo no mês é ausência, nunca 0%", () => {
        expect(peakShareOfMonth(breakdown([]))).toBeNull()
        expect(
            peakShareOfMonth(
                breakdown([
                    { post: "PEAK", kwhConsumed: 0, brl: 0 },
                    { post: "OFF_PEAK", kwhConsumed: 0, brl: 0 },
                ]),
            ),
        ).toBeNull()
    })

    it("sem a conta do Grupo A (bucket sem decomposição) é ausência", () => {
        expect(peakShareOfMonth(undefined)).toBeNull()
    })
})
