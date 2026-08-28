import { describe, it, expect } from "vitest"
import { ModbusRtuConnection } from "@/modules/iot/iot-worker/protocols/ModbusRtuConnection.js"

// Teste de caracterização (issue #306) — comportamento hoje sem cobertura.
// Usa o import("serialport")/jsmodbus real (não mockado): abrir uma porta
// serial inexistente deve rejeitar com Error de I/O, não TypeError.
describe("ModbusRtuConnection", () => {
    it("connect() contra uma porta serial inexistente rejeita com Error, não TypeError", async () => {
        const connection = new ModbusRtuConnection({
            meterId: "meter-modbus-rtu-test",
            address: "/dev/nonexistent-test-port-xyz",
        })

        let caught: unknown
        try {
            await connection.connect()
        } catch (err) {
            caught = err
        }

        expect(caught).toBeInstanceOf(Error)
        expect(caught).not.toBeInstanceOf(TypeError)
    })

    it("disconnect() sem connect() prévio não lança (guarda de idempotência)", async () => {
        const connection = new ModbusRtuConnection({
            meterId: "meter-modbus-rtu-test-2",
            address: "/dev/nonexistent-test-port-xyz",
        })

        await expect(connection.disconnect()).resolves.toBeUndefined()
    })

    it("isConnected() começa false", () => {
        const connection = new ModbusRtuConnection({
            meterId: "meter-modbus-rtu-test-3",
            address: "/dev/nonexistent-test-port-xyz",
        })

        expect(connection.isConnected()).toBe(false)
    })
})
