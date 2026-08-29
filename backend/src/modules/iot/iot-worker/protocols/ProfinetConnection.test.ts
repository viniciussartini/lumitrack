import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ProfinetConnection } from "@/modules/iot/iot-worker/protocols/ProfinetConnection.js"

const baseConfig = {
    host: "127.0.0.1",
    port: 1,
    address: "DB1", // voltagem
    currentAddress: "DB2",
    powerAddress: "DB3",
    powerFactorAddress: "DB4",
}

interface ReadSampleHarness {
    client: unknown
    _readSample(): Promise<Record<string, unknown>>
}

interface UnhealthyHarness {
    connected: boolean
    client: unknown
    connect(): Promise<void>
    _handleUnhealthy(): void
}

// Teste de caracterização — comportamento hoje sem cobertura.
// Usa o import("node-snap7") real (não mockado).
describe("ProfinetConnection", () => {
    it("connect() contra um host inalcançável rejeita — node-snap7 devolve o errno cru (número), não um Error, quirk pré-existente da lib nativa que este teste apenas documenta", async () => {
        const connection = new ProfinetConnection({ meterId: "meter-profinet-test", ...baseConfig })

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
            ...baseConfig,
        })

        await expect(connection.disconnect()).resolves.toBeUndefined()
    })

    it("isConnected() começa false", () => {
        const connection = new ProfinetConnection({
            meterId: "meter-profinet-test-3",
            ...baseConfig,
        })

        expect(connection.isConnected()).toBe(false)
    })

    // Regressão: antes desta correção, cada tick lia UM data
    // block só e emitia `{db, data: number[], timestamp}` — formato que
    // IoTDataProcessor sempre rejeitava. Agora lê os 4 DBs configurados
    // (convenção: primeiros 2 bytes como UInt16BE) e combina numa amostra
    // elétrica completa.
    it("_readSample() lê os 4 data blocks configurados, na ordem, e combina numa amostra elétrica", async () => {
        const connection = new ProfinetConnection({
            meterId: "meter-profinet-test-4",
            ...baseConfig,
        }) as unknown as ReadSampleHarness

        const DBRead = vi.fn(
            (db: number, _start: number, _size: number, cb: (err: null, data: Buffer) => void) => {
                const bufByDb: Record<number, Buffer> = {
                    1: Buffer.from([0x00, 0xdc]), // 220
                    2: Buffer.from([0x00, 0x0a]), // 10
                    3: Buffer.from([0x08, 0x98]), // 2200
                    4: Buffer.from([0x00, 0x01]), // 1 (representando 0.01 se escalado — sem escala aqui)
                }
                cb(null, bufByDb[db] ?? Buffer.from([0x00, 0x00]))
            },
        )
        connection.client = { DBRead }

        const sample = await connection._readSample()

        expect(DBRead).toHaveBeenCalledTimes(4)
        expect(DBRead).toHaveBeenNthCalledWith(1, 1, 0, 2, expect.any(Function))
        expect(DBRead).toHaveBeenNthCalledWith(2, 2, 0, 2, expect.any(Function))
        expect(DBRead).toHaveBeenNthCalledWith(3, 3, 0, 2, expect.any(Function))
        expect(DBRead).toHaveBeenNthCalledWith(4, 4, 0, 2, expect.any(Function))
        expect(sample["voltage"]).toBe(220)
        expect(sample["current"]).toBe(10)
        expect(sample["powerW"]).toBe(2200)
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
            const connection = new ProfinetConnection({
                meterId: "meter-profinet-reconnect",
                ...baseConfig,
            }) as unknown as UnhealthyHarness

            connection.connected = true
            connection.client = { Disconnect: vi.fn() }
            const connectSpy = vi.spyOn(connection, "connect").mockResolvedValue(undefined)

            connection._handleUnhealthy()
            await vi.advanceTimersByTimeAsync(0) // _cleanup() é async

            expect(connection.connected).toBe(false)

            await vi.advanceTimersByTimeAsync(1000) // delay base do backoff
            expect(connectSpy).toHaveBeenCalledTimes(1)
        })
    })
})
