import { describe, it, expect, vi } from "vitest"
import { Rs232Connection } from "@/modules/iot/iot-worker/protocols/Rs232Connection.js"

// `_handleSerialData` é privado — chamado diretamente pelo teste (em vez de
// mockar `serialport` para disparar um "data" real) porque é o mesmo
// método que o listener real invoca, e o resto deste arquivo testa contra
// comportamento real, não módulos mockados.
interface SerialDataHarness {
    _handleSerialData(chunk: Buffer): void
    buffer: string
    onData(handler: (data: Record<string, unknown>) => void): void
}

describe("Rs232Connection — montagem de linhas a partir de chunks parciais", () => {
    it("dois chunks parciais que juntos formam uma linha JSON disparam UMA única chamada de dataHandler, com o objeto já parseado", () => {
        const connection = new Rs232Connection({
            meterId: "meter-rs232-test",
            address: "/dev/ttyUSB0",
        }) as unknown as SerialDataHarness
        const dataHandler = vi.fn()
        connection.onData(dataHandler)

        // A linha `{"value":42}\n` chega partida no meio do payload JSON —
        // cenário real de leitura serial em baixa velocidade.
        connection._handleSerialData(Buffer.from('{"val'))
        expect(dataHandler).not.toHaveBeenCalled()

        connection._handleSerialData(Buffer.from('ue":42}\n'))

        expect(dataHandler).toHaveBeenCalledTimes(1)
        expect(dataHandler).toHaveBeenCalledWith({ value: 42 })
    })

    it("múltiplas linhas no mesmo chunk disparam uma chamada de dataHandler por linha, na ordem", () => {
        const connection = new Rs232Connection({
            meterId: "meter-rs232-test-2",
            address: "/dev/ttyUSB0",
        }) as unknown as SerialDataHarness
        const dataHandler = vi.fn()
        connection.onData(dataHandler)

        connection._handleSerialData(Buffer.from('{"seq":1}\n{"seq":2}\n{"seq":3}\n'))

        expect(dataHandler).toHaveBeenCalledTimes(3)
        expect(dataHandler).toHaveBeenNthCalledWith(1, { seq: 1 })
        expect(dataHandler).toHaveBeenNthCalledWith(2, { seq: 2 })
        expect(dataHandler).toHaveBeenNthCalledWith(3, { seq: 3 })
    })

    it("linha que não é JSON válido chega como { raw, timestamp }", () => {
        const connection = new Rs232Connection({
            meterId: "meter-rs232-test-3",
            address: "/dev/ttyUSB0",
        }) as unknown as SerialDataHarness
        const dataHandler = vi.fn()
        connection.onData(dataHandler)

        connection._handleSerialData(Buffer.from("linha-nao-json\n"))

        expect(dataHandler).toHaveBeenCalledTimes(1)
        const [payload] = dataHandler.mock.calls[0] as [Record<string, unknown>]
        expect(payload["raw"]).toBe("linha-nao-json")
        expect(payload["port"]).toBeUndefined()
        expect(typeof payload["timestamp"]).toBe("string")
    })

    it("buffer que excede o teto sem encontrar \\n é descartado, em vez de crescer sem limite", () => {
        const connection = new Rs232Connection({
            meterId: "meter-rs232-test-4",
            address: "/dev/ttyUSB0",
        }) as unknown as SerialDataHarness
        const dataHandler = vi.fn()
        connection.onData(dataHandler)

        // Chunk maior que o teto (64 KB), sem nenhum terminador de linha —
        // um dispositivo que nunca fecha linha.
        connection._handleSerialData(Buffer.alloc(64 * 1024 + 1, "a"))

        expect(connection.buffer).toBe("")
        expect(dataHandler).not.toHaveBeenCalled()
    })

    it("disconnect() sem connect() prévio não lança (guarda de idempotência)", async () => {
        const connection = new Rs232Connection({
            meterId: "meter-rs232-test-5",
            address: "/dev/ttyUSB0",
        })

        await expect(connection.disconnect()).resolves.toBeUndefined()
    })

    it("isConnected() começa false", () => {
        const connection = new Rs232Connection({
            meterId: "meter-rs232-test-6",
            address: "/dev/ttyUSB0",
        })

        expect(connection.isConnected()).toBe(false)
    })
})
