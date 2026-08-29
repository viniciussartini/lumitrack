import { describe, it, expect, vi } from "vitest"
import { ModbusRtuConnection } from "@/modules/iot/iot-worker/protocols/ModbusRtuConnection.js"

const baseConfig = {
    address: "/dev/nonexistent-test-port-xyz", // caminho da porta serial
    voltageAddress: "10",
    currentAddress: "11",
    powerAddress: "12",
    powerFactorAddress: "13",
}

interface ReadSampleHarness {
    client: unknown
    _readSample(): Promise<Record<string, unknown>>
}

// Teste de caracterização (issue #306) — comportamento hoje sem cobertura.
// Usa o import("serialport")/jsmodbus real (não mockado): abrir uma porta
// serial inexistente deve rejeitar com Error de I/O, não TypeError.
describe("ModbusRtuConnection", () => {
    it("connect() contra uma porta serial inexistente rejeita com Error, não TypeError", async () => {
        const connection = new ModbusRtuConnection({
            meterId: "meter-modbus-rtu-test",
            ...baseConfig,
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
            ...baseConfig,
        })

        await expect(connection.disconnect()).resolves.toBeUndefined()
    })

    it("isConnected() começa false", () => {
        const connection = new ModbusRtuConnection({
            meterId: "meter-modbus-rtu-test-3",
            ...baseConfig,
        })

        expect(connection.isConnected()).toBe(false)
    })

    // Regressão (issue #307): antes desta correção, `_startPolling` lia
    // SEMPRE o registrador 0 (`readHoldingRegisters(0, 1)`), ignorando
    // qualquer endereço configurado — bug funcional, não só de payload.
    // Agora lê os 4 registradores configurados (voltageAddress e as 3
    // grandezas restantes).
    it("_readSample() lê os 4 registradores configurados (não mais sempre o registrador 0)", async () => {
        const connection = new ModbusRtuConnection({
            meterId: "meter-modbus-rtu-test-4",
            ...baseConfig,
        }) as unknown as ReadSampleHarness

        const readHoldingRegisters = vi.fn((addr: number) => {
            const valuesByAddress: Record<number, number> = { 10: 127, 11: 8, 12: 900, 13: 1 }
            return Promise.resolve({
                response: { body: { values: [valuesByAddress[addr] ?? -1] } },
            })
        })
        connection.client = { readHoldingRegisters }

        const sample = await connection._readSample()

        expect(readHoldingRegisters).toHaveBeenCalledTimes(4)
        expect(readHoldingRegisters).toHaveBeenNthCalledWith(1, 10, 1)
        expect(readHoldingRegisters).toHaveBeenNthCalledWith(2, 11, 1)
        expect(readHoldingRegisters).toHaveBeenNthCalledWith(3, 12, 1)
        expect(readHoldingRegisters).toHaveBeenNthCalledWith(4, 13, 1)
        // Nenhuma chamada usou o registrador 0 (o bug antigo).
        expect(readHoldingRegisters).not.toHaveBeenCalledWith(0, 1)
        expect(sample["voltage"]).toBe(127)
        expect(sample["current"]).toBe(8)
        expect(sample["powerW"]).toBe(900)
        expect(sample["powerFactor"]).toBe(1)
    })
})
