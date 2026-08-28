import { describe, it, expect } from "vitest"
import { ProfinetConnection } from "@/modules/iot/iot-worker/protocols/ProfinetConnection.js"

// Teste de caracterização (issue #306) — comportamento hoje sem cobertura.
// Usa o import("node-snap7") real (não mockado).
describe("ProfinetConnection", () => {
    it("connect() contra um host inalcançável rejeita — node-snap7 devolve o errno cru (número), não um Error, quirk pré-existente da lib nativa que este teste apenas documenta", async () => {
        const connection = new ProfinetConnection({
            meterId: "meter-profinet-test",
            host: "127.0.0.1",
            port: 1,
        })

        let caught: unknown
        try {
            await connection.connect()
        } catch (err) {
            caught = err
        }

        expect(caught).toBeDefined()
        expect(typeof caught).toBe("number")
    })

    it("disconnect() sem connect() prévio não lança (guarda de idempotência)", async () => {
        const connection = new ProfinetConnection({
            meterId: "meter-profinet-test-2",
            host: "127.0.0.1",
            port: 1,
        })

        await expect(connection.disconnect()).resolves.toBeUndefined()
    })

    it("isConnected() começa false", () => {
        const connection = new ProfinetConnection({
            meterId: "meter-profinet-test-3",
            host: "127.0.0.1",
            port: 1,
        })

        expect(connection.isConnected()).toBe(false)
    })
})
