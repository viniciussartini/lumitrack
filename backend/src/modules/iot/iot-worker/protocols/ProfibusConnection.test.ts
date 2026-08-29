import { describe, it, expect, vi } from "vitest"
import { ProfibusConnection } from "@/modules/iot/iot-worker/protocols/ProfibusConnection.js"

// Teste de caracterização — comportamento hoje sem cobertura.
// ProfibusConnection é um stub deliberado (sem SDK Node.js publico e
// estável para PROFIBUS) — o contrato a preservar é: connect() sempre
// rejeita com um erro claro, disconnect()/onData() são noop seguros.
describe("ProfibusConnection (stub)", () => {
    it("connect() sempre rejeita com erro claro citando a integração pendente e o address configurado", async () => {
        const connection = new ProfibusConnection({
            meterId: "meter-profibus-test",
            address: "slave-42",
        })

        await expect(connection.connect()).rejects.toThrow(
            /\[ProfibusConnection\].*PROFIBUS.*slave-42/s,
        )
    })

    it("disconnect() nunca lança, mesmo sem connect() prévio (stub nunca conecta de verdade)", async () => {
        const connection = new ProfibusConnection({
            meterId: "meter-profibus-test-2",
            address: "slave-42",
        })

        await expect(connection.disconnect()).resolves.toBeUndefined()
    })

    it("isConnected() é sempre false — o stub nunca estabelece conexão real", () => {
        const connection = new ProfibusConnection({
            meterId: "meter-profibus-test-3",
            address: "slave-42",
        })

        expect(connection.isConnected()).toBe(false)
    })

    it("onData() é noop — registrar um handler não lança nem é invocado", () => {
        const connection = new ProfibusConnection({
            meterId: "meter-profibus-test-4",
            address: "slave-42",
        })
        const handler = vi.fn()

        expect(() => connection.onData(handler)).not.toThrow()
        expect(handler).not.toHaveBeenCalled()
    })
})
