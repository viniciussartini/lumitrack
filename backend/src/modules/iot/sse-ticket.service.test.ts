import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { SseTicketService, type StreamTicketPayload } from "@/modules/iot/sse-ticket.service.js"

const payload: StreamTicketPayload = {
    userId: "user-1",
    email: "joao@example.com",
    userType: "INDIVIDUAL",
    role: "USER",
    isDemo: false,
    authToken: "token-abc",
}

describe("SseTicketService", () => {
    let service: SseTicketService

    beforeEach(() => {
        service = new SseTicketService()
    })

    it("consome um ticket recém-emitido e devolve o payload original", () => {
        const ticket = service.issue(payload)
        expect(service.consume(ticket)).toEqual(payload)
    })

    it("retorna null para um ticket que nunca existiu", () => {
        expect(service.consume("ticket-inexistente")).toBeNull()
    })

    it("é de uso único — a segunda tentativa com o mesmo ticket falha", () => {
        const ticket = service.issue(payload)
        expect(service.consume(ticket)).not.toBeNull()
        expect(service.consume(ticket)).toBeNull()
    })

    it("gera tickets diferentes a cada chamada", () => {
        expect(service.issue(payload)).not.toBe(service.issue(payload))
    })

    describe("expiração (30s)", () => {
        beforeEach(() => {
            vi.useFakeTimers()
        })

        afterEach(() => {
            vi.useRealTimers()
        })

        it("consome normalmente pouco antes do prazo expirar", () => {
            const ticket = service.issue(payload)
            vi.advanceTimersByTime(29_000)
            expect(service.consume(ticket)).toEqual(payload)
        })

        it("retorna null depois do prazo de 30s", () => {
            const ticket = service.issue(payload)
            vi.advanceTimersByTime(30_001)
            expect(service.consume(ticket)).toBeNull()
        })
    })
})
