import { describe, it, expect } from "vitest"
import { toSaoPauloLocal, fromSaoPauloLocal } from "@/shared/time/localTime.js"

describe("toSaoPauloLocal", () => {
    it("subtrai 3 horas de um instante UTC", () => {
        const utc = new Date(Date.UTC(2026, 8, 8, 22, 0))
        const local = toSaoPauloLocal(utc)

        expect(local.getUTCHours()).toBe(19)
        expect(local.getUTCDate()).toBe(8)
    })

    it("cruza a virada de dia local corretamente (madrugada UTC vira noite do dia anterior local)", () => {
        // 2026-09-05T01:00Z é 2026-09-04 22h em São Paulo
        const utc = new Date(Date.UTC(2026, 8, 5, 1, 0))
        const local = toSaoPauloLocal(utc)

        expect(local.getUTCDate()).toBe(4)
        expect(local.getUTCHours()).toBe(22)
    })
})

describe("fromSaoPauloLocal", () => {
    it("é o inverso exato de toSaoPauloLocal", () => {
        const original = new Date(Date.UTC(2026, 8, 1, 3, 0))
        expect(fromSaoPauloLocal(toSaoPauloLocal(original))).toEqual(original)
    })

    it("converte a meia-noite local do dia 1º para o instante UTC real (03h)", () => {
        const localMidnight = new Date(Date.UTC(2026, 8, 1, 0, 0))
        expect(fromSaoPauloLocal(localMidnight)).toEqual(new Date(Date.UTC(2026, 8, 1, 3, 0)))
    })
})
