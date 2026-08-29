import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
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

interface UnhealthyHarness {
    connected: boolean
    port: unknown
    connect(): Promise<void>
    _handleUnhealthy(): void
}

// Teste de caracterização — comportamento hoje sem cobertura.
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

    // Regressão: antes desta correção, `_startPolling` lia
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

    describe("reconexão automática", () => {
        beforeEach(() => {
            vi.useFakeTimers()
        })

        afterEach(() => {
            vi.useRealTimers()
        })

        it("_handleUnhealthy() limpa o estado da conexão e agenda reconexão com backoff", async () => {
            const connection = new ModbusRtuConnection({
                meterId: "meter-modbus-rtu-reconnect",
                ...baseConfig,
            }) as unknown as UnhealthyHarness

            connection.connected = true
            connection.port = { close: (cb: () => void) => cb() }
            const connectSpy = vi.spyOn(connection, "connect").mockResolvedValue(undefined)

            connection._handleUnhealthy()
            await vi.advanceTimersByTimeAsync(0) // _cleanup() é async

            expect(connection.connected).toBe(false)

            await vi.advanceTimersByTimeAsync(1000) // delay base do backoff
            expect(connectSpy).toHaveBeenCalledTimes(1)
        })
    })
})
