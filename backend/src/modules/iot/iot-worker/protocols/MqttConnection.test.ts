import { describe, it, expect, vi } from "vitest"
import { MqttConnection } from "@/modules/iot/iot-worker/protocols/MqttConnection.js"

const baseConfig = {
    host: "127.0.0.1",
    port: 1, // porta privilegiada, nada deve estar escutando nela em teste
    topic: "medidor/teste",
}

// `_handleMessage` é privado — chamado diretamente pelo teste porque
// exercitar o parsing real exigiria um broker MQTT publicando de verdade.
// Mesmo padrão de extração já usado em `_handleSerialData` (RS-232/RS-485)
// e `_readSample` (Modbus/EtherNet-IP/Profinet) neste diretório.
interface MessageHandlerHarness {
    dataHandler: ((data: Record<string, unknown>) => void) | null
    onData(handler: (data: Record<string, unknown>) => void): void
    _handleMessage(payload: Buffer): void
}

interface MqttClientHarness {
    client: {
        options: { reconnectPeriod: number }
        disconnecting: boolean
        reconnecting: boolean
    } | null
}

// Teste de caracterização — MqttConnection é a implementação
// de referência do worker IoT (comentário no topo do arquivo) e, mesmo
// assim, nunca teve teste próprio até esta issue.
describe("MqttConnection", () => {
    it("connect() contra um broker inalcançável rejeita com Error de conexão, não TypeError", async () => {
        const connection = new MqttConnection({ meterId: "meter-mqtt-test", ...baseConfig })

        let caught: unknown
        try {
            await connection.connect()
        } catch (err) {
            caught = err
        }

        expect(caught).toBeInstanceOf(Error)
        expect(caught).not.toBeInstanceOf(TypeError)
    })

    it("connect() usa reconnectPeriod positivo — issue #310, reconnectPeriod: 0 desabilitava a reconexão automática do client", async () => {
        const connection = new MqttConnection({
            meterId: "meter-mqtt-test-reconnect",
            ...baseConfig,
        }) as unknown as MqttClientHarness

        await expect(
            (connection as unknown as { connect(): Promise<void> }).connect(),
        ).rejects.toBeInstanceOf(Error)

        expect(connection.client?.options.reconnectPeriod).toBe(1000)
    })

    it("connect() contra broker inalcançável encerra o client — sem dono para pará-lo depois, reconnectPeriod positivo o deixaria reconectando para sempre", async () => {
        const connection = new MqttConnection({
            meterId: "meter-mqtt-test-orphan",
            ...baseConfig,
        }) as unknown as MqttClientHarness

        await expect(
            (connection as unknown as { connect(): Promise<void> }).connect(),
        ).rejects.toBeInstanceOf(Error)

        expect(connection.client?.disconnecting).toBe(true)
        expect(connection.client?.reconnecting).toBe(false)
    })

    it("disconnect() sem connect() prévio não lança (guarda de idempotência)", async () => {
        const connection = new MqttConnection({ meterId: "meter-mqtt-test-2", ...baseConfig })

        await expect(connection.disconnect()).resolves.toBeUndefined()
    })

    it("isConnected() começa false", () => {
        const connection = new MqttConnection({ meterId: "meter-mqtt-test-3", ...baseConfig })

        expect(connection.isConnected()).toBe(false)
    })

    it("_handleMessage() com payload JSON válido chama dataHandler com o objeto parseado", () => {
        const connection = new MqttConnection({
            meterId: "meter-mqtt-test-4",
            ...baseConfig,
        }) as unknown as MessageHandlerHarness
        const dataHandler = vi.fn()
        connection.onData(dataHandler)

        connection._handleMessage(
            Buffer.from(
                JSON.stringify({ voltage: 220, current: 5, powerW: 1100, powerFactor: 0.95 }),
            ),
        )

        expect(dataHandler).toHaveBeenCalledTimes(1)
        expect(dataHandler).toHaveBeenCalledWith({
            voltage: 220,
            current: 5,
            powerW: 1100,
            powerFactor: 0.95,
        })
    })

    it("_handleMessage() com payload não-JSON cai no fallback { raw }", () => {
        const connection = new MqttConnection({
            meterId: "meter-mqtt-test-5",
            ...baseConfig,
        }) as unknown as MessageHandlerHarness
        const dataHandler = vi.fn()
        connection.onData(dataHandler)

        connection._handleMessage(Buffer.from("nao-e-json"))

        expect(dataHandler).toHaveBeenCalledWith({ raw: "nao-e-json" })
    })

    it("_handleMessage() sem dataHandler registrado ainda não lança", () => {
        const connection = new MqttConnection({
            meterId: "meter-mqtt-test-6",
            ...baseConfig,
        }) as unknown as MessageHandlerHarness

        expect(() => connection._handleMessage(Buffer.from('{"voltage":1}'))).not.toThrow()
    })
})
