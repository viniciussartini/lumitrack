import { describe, it, expect, vi } from "vitest"
import {
    EthernetIpConnection,
    Rs232Connection,
    Rs485Connection,
} from "@/modules/iot/iot-worker/protocols/ModbusTcpConnection.js"

// `_handleSerialData` é privado — chamado diretamente pelo teste (em vez de
// mockar `serialport` para disparar um "data" real) porque é o mesmo
// método que o listener real invoca, e o resto deste arquivo testa contra
// comportamento real, não módulos mockados (ver describe de cima).
interface SerialDataHarness {
    _handleSerialData(chunk: Buffer): void
    buffer: string
    onData(handler: (data: Record<string, unknown>) => void): void
}

// Estes testes usam o import("ethernet-ip") real (não mockado) — cobrem
// justamente a lacuna que deixaria passar despercebido um bump de versão
// como 1.2.5→2.0.0: a lib v2 reescreveu a API inteira (Controller→PLC,
// connect(ip, slot)→connect(ip, {slot}), readTag/writeTag→read/write), e
// como o uso é via import() dinâmico, um mock no nível do módulo nunca
// pegaria a divergência — só bate contra o pacote publicado de verdade.
describe("EthernetIpConnection", () => {
    it("usa a superfície real da API v2 (PLC, connect com {slot}) — falha com erro de conexão, não com TypeError de API incompatível", async () => {
        // Nada deve estar escutando em 127.0.0.1:44818 (porta fixa da lib,
        // não configurável via PLC.connect) neste ambiente de teste — a
        // conexão deve ser recusada pelo SO. Se `Controller`/`readTag` (API
        // v1) ainda estivessem sendo chamados contra o pacote v2 instalado,
        // isso lançaria um TypeError ("is not a function"/"is not a
        // constructor") antes mesmo de tentar abrir o socket.
        const connection = new EthernetIpConnection({
            meterId: "meter-eip-test",
            host: "127.0.0.1",
        })

        let caught: unknown
        try {
            await connection.connect()
        } catch (err) {
            caught = err
        }

        expect(caught).toBeInstanceOf(Error)
        expect(caught).not.toBeInstanceOf(TypeError)
        expect((caught as Error).message).not.toMatch(/is not a function|is not a constructor/i)
    })

    it("disconnect() sem connect() prévio não lança (guarda de idempotência)", async () => {
        const connection = new EthernetIpConnection({
            meterId: "meter-eip-test-2",
            host: "127.0.0.1",
        })

        await expect(connection.disconnect()).resolves.toBeUndefined()
    })
})

// Regressão: Rs485Connection fazia `buffer.split("")` (decompunha em
// caracteres individuais) em vez de `split("\n")`: dataHandler era chamado
// uma vez por byte recebido, JSON.parse de um único caractere sempre
// falhava, e nenhuma leitura RS-485 era jamais decodificada. Mesmo bug de
// classe também coberto para o Rs232Connection (correto hoje, mas até
// então sem teste de regressão em nenhum protocolo serial).
describe.each([
    [
        "Rs485Connection",
        () => new Rs485Connection({ meterId: "meter-rs485-test", address: "/dev/ttyUSB0" }),
    ],
    [
        "Rs232Connection",
        () => new Rs232Connection({ meterId: "meter-rs232-test", address: "/dev/ttyUSB0" }),
    ],
] as const)("%s — montagem de linhas a partir de chunks parciais", (_name, makeConnection) => {
    it("dois chunks parciais que juntos formam uma linha JSON disparam UMA única chamada de dataHandler, com o objeto já parseado", () => {
        const connection = makeConnection() as unknown as SerialDataHarness
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
        const connection = makeConnection() as unknown as SerialDataHarness
        const dataHandler = vi.fn()
        connection.onData(dataHandler)

        connection._handleSerialData(Buffer.from('{"seq":1}\n{"seq":2}\n{"seq":3}\n'))

        expect(dataHandler).toHaveBeenCalledTimes(3)
        expect(dataHandler).toHaveBeenNthCalledWith(1, { seq: 1 })
        expect(dataHandler).toHaveBeenNthCalledWith(2, { seq: 2 })
        expect(dataHandler).toHaveBeenNthCalledWith(3, { seq: 3 })
    })

    it("buffer que excede o teto sem encontrar \\n é descartado, em vez de crescer sem limite", () => {
        const connection = makeConnection() as unknown as SerialDataHarness
        const dataHandler = vi.fn()
        connection.onData(dataHandler)

        // Chunk maior que o teto (64 KB), sem nenhum terminador de linha —
        // um dispositivo que nunca fecha linha.
        connection._handleSerialData(Buffer.alloc(64 * 1024 + 1, "a"))

        expect(connection.buffer).toBe("")
        expect(dataHandler).not.toHaveBeenCalled()
    })
})
