import { describe, it, expect, vi, afterEach } from "vitest"
import { EventEmitter } from "events"
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

    // Um broker real inalcançável (os 2 testes acima) só exercita a falha de
    // TRANSPORTE (nunca chega no CONNACK). A falha de SUBACK — o broker
    // aceita a conexão mas recusa a assinatura do tópico (ACL) — exige
    // controlar o client MQTT diretamente; um `EventEmitter` fake no lugar
    // do client real do `mqtt.connect()` permite disparar exatamente essa
    // sequência de forma determinística, sem broker.
    describe("connect() com o transporte estabelecido mas o subscribe falhando", () => {
        afterEach(() => {
            vi.doUnmock("mqtt")
        })

        function createFakeMqttClient(): EventEmitter & {
            subscribe: ReturnType<typeof vi.fn>
            end: ReturnType<typeof vi.fn>
            disconnecting: boolean
        } {
            const client = new EventEmitter() as EventEmitter & {
                subscribe: ReturnType<typeof vi.fn>
                end: ReturnType<typeof vi.fn>
                disconnecting: boolean
            }
            client.disconnecting = false
            client.end = vi.fn(() => {
                client.disconnecting = true
            })
            client.subscribe = vi.fn()
            return client
        }

        it("rejeita e encerra o client — sem isto, ficaria reconectando sozinho para sempre sem dono", async () => {
            const fakeClient = createFakeMqttClient()
            fakeClient.subscribe.mockImplementation((_topic: string, cb: (err: Error) => void) => {
                cb(new Error("ACL negada para este tópico"))
            })

            vi.doMock("mqtt", () => ({ connect: () => fakeClient }))
            const { MqttConnection: MockedMqttConnection } =
                await import("@/modules/iot/iot-worker/protocols/MqttConnection.js")

            const connection = new MockedMqttConnection({
                meterId: "meter-mqtt-test-subscribe-fail",
                ...baseConfig,
            })

            const connectPromise = connection.connect()
            // `connect()` faz `await import("mqtt")` antes de registrar os
            // listeners — precisa de uma volta do event loop antes que o
            // listener de "connect" já esteja registrado para receber isto.
            await new Promise<void>((resolve) => setImmediate(resolve))
            fakeClient.emit("connect")

            await expect(connectPromise).rejects.toThrow("ACL negada para este tópico")
            expect(fakeClient.end).toHaveBeenCalledWith(true)
            expect(connection.isConnected()).toBe(false)
        })

        it("uma falha ao resubscrever após reconexão automática (não a primeira) não encerra o client nem rejeita de novo", async () => {
            const fakeClient = createFakeMqttClient()
            let subscribeCallCount = 0
            fakeClient.subscribe.mockImplementation(
                (_topic: string, cb: (err: Error | null) => void) => {
                    subscribeCallCount += 1
                    // 1ª chamada (conexão inicial): sucesso. 2ª chamada (depois
                    // do "connect" reemitido por uma reconexão automática):
                    // falha — cenário que não deve reencerrar um client que já
                    // está conectado e funcionando.
                    cb(subscribeCallCount === 1 ? null : new Error("ACL negada de novo"))
                },
            )

            vi.doMock("mqtt", () => ({ connect: () => fakeClient }))
            const { MqttConnection: MockedMqttConnection } =
                await import("@/modules/iot/iot-worker/protocols/MqttConnection.js")

            const connection = new MockedMqttConnection({
                meterId: "meter-mqtt-test-resubscribe-fail",
                ...baseConfig,
            })

            const connectPromise = connection.connect()
            await new Promise<void>((resolve) => setImmediate(resolve))
            fakeClient.emit("connect")
            await connectPromise

            expect(connection.isConnected()).toBe(true)

            // Reconexão automática do mqtt.js reemite "connect" — o subscribe
            // desta segunda vez falha.
            fakeClient.emit("connect")

            expect(fakeClient.end).not.toHaveBeenCalled()
            expect(connection.isConnected()).toBe(true)
        })
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
