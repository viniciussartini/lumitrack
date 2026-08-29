import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import net from "net"
import { ModbusTcpConnection } from "@/modules/iot/iot-worker/protocols/ModbusTcpConnection.js"

const baseConfig = {
    host: "127.0.0.1",
    port: 1, // porta privilegiada, nada deve estar escutando nela em teste
    address: "10", // voltagem
    currentAddress: "11",
    powerAddress: "12",
    powerFactorAddress: "13",
}

// `_readSample` é privado — chamado diretamente pelo teste (com `client`
// stubado) porque exercitar a leitura real exigiria um servidor Modbus TCP
// de verdade. Mesmo padrão de extração já usado para `_handleSerialData`
// em Rs232Connection/Rs485Connection.
interface ReadSampleHarness {
    client: unknown
    dataHandler: ((data: Record<string, unknown>) => void) | null
    _readSample(): Promise<Record<string, unknown>>
}

interface UnhealthyHarness {
    connected: boolean
    socket: unknown
    connect(): Promise<void>
    _handleUnhealthy(): void
}

// Teste de caracterização — comportamento hoje sem cobertura.
// Usa o import("jsmodbus")/net real (não mockado), mesmo padrão já usado
// para EthernetIpConnection neste diretório: uma conexão recusada pelo SO
// deve chegar como Error de rede, não como TypeError de API incompatível.
describe("ModbusTcpConnection", () => {
    it("connect() contra uma porta fechada rejeita com Error de conexão, não TypeError", async () => {
        const connection = new ModbusTcpConnection({
            meterId: "meter-modbus-tcp-test",
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
        const connection = new ModbusTcpConnection({
            meterId: "meter-modbus-tcp-test-2",
            ...baseConfig,
        })

        await expect(connection.disconnect()).resolves.toBeUndefined()
    })

    it("isConnected() começa false", () => {
        const connection = new ModbusTcpConnection({
            meterId: "meter-modbus-tcp-test-3",
            ...baseConfig,
        })

        expect(connection.isConnected()).toBe(false)
    })

    // Regressão: antes desta correção, cada tick de polling lia
    // UM registrador só e emitia `{register, value, timestamp}` — formato
    // que IoTDataProcessor.isValidPayload sempre rejeitava (não tem
    // voltage/current/powerW/powerFactor). Agora lê os 4 registradores
    // configurados e combina numa amostra elétrica completa.
    it("_readSample() lê os 4 registradores configurados, na ordem, e combina numa amostra elétrica", async () => {
        const connection = new ModbusTcpConnection({
            meterId: "meter-modbus-tcp-test-4",
            ...baseConfig,
        }) as unknown as ReadSampleHarness

        const readHoldingRegisters = vi.fn((addr: number) => {
            // Cada registrador devolve um valor distinto e identificável —
            // prova que a amostra final não está lendo o mesmo endereço 4x.
            const valuesByAddress: Record<number, number> = { 10: 220, 11: 15, 12: 3300, 13: 0 }
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
        expect(sample["voltage"]).toBe(220)
        expect(sample["current"]).toBe(15)
        expect(sample["powerW"]).toBe(3300)
        expect(sample["powerFactor"]).toBe(0)
        expect(typeof sample["deviceTimestamp"]).toBe("string")
    })

    describe("reconexão automática", () => {
        beforeEach(() => {
            vi.useFakeTimers()
        })

        afterEach(() => {
            vi.useRealTimers()
        })

        // Regressão: antes desta issue, uma conexão que caía (transporte
        // morto detectado via falhas consecutivas de leitura) ficava parada
        // para sempre — sem reconectar sozinha, exigia restart() manual.
        it("_handleUnhealthy() limpa o estado da conexão e agenda reconexão com backoff", async () => {
            const connection = new ModbusTcpConnection({
                meterId: "meter-modbus-tcp-reconnect",
                ...baseConfig,
            }) as unknown as UnhealthyHarness

            connection.connected = true
            connection.socket = { destroy: vi.fn() }
            const connectSpy = vi.spyOn(connection, "connect").mockResolvedValue(undefined)

            connection._handleUnhealthy()
            await vi.advanceTimersByTimeAsync(0) // _cleanup() é async

            expect(connection.connected).toBe(false)

            await vi.advanceTimersByTimeAsync(1000) // delay base do backoff
            expect(connectSpy).toHaveBeenCalledTimes(1)
        })
    })

    describe("corrida entre connect() e disconnect()", () => {
        let server: net.Server
        let port: number

        beforeEach(async () => {
            // Servidor TCP real, sem falar Modbus nenhum — o suficiente
            // para o handshake TCP completar e connect() resolver; o
            // worker nunca chega a fazer uma leitura de verdade neste teste.
            server = net.createServer((socket) => socket.on("error", () => {}))
            await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
            const address = server.address()
            port = typeof address === "object" && address ? address.port : 0
        })

        afterEach(async () => {
            await new Promise<void>((resolve) => server.close(() => resolve()))
        })

        // Regressão: disconnect() chegando enquanto connect() ainda está em
        // andamento (socket TCP handshake em curso) encontrava `connected`
        // ainda false — seu cleanup não tinha efeito nenhum — e depois
        // connect() terminava marcando `connected = true`, deixando uma
        // conexão órfã (sem referência no manager, mas ativa).
        it("disconnect() concorrente com connect() não deixa a conexão órfã", async () => {
            const connection = new ModbusTcpConnection({
                meterId: "meter-modbus-tcp-race",
                host: "127.0.0.1",
                port,
                address: "10",
                currentAddress: "11",
                powerAddress: "12",
                powerFactorAddress: "13",
            })

            const connectPromise = connection.connect()
            // `disconnect()` chamado no mesmo tick, antes do handshake TCP
            // completar — `connected` ainda é false neste instante.
            const disconnectPromise = connection.disconnect()

            await Promise.all([connectPromise, disconnectPromise])

            expect(connection.isConnected()).toBe(false)
        })
    })
})
