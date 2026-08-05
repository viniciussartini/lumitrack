import { describe, it, expect } from "vitest"
import { EthernetIpConnection } from "@/modules/iot/iot-worker/protocols/ModbusTcpConnection.js"

// Estes testes usam o import("ethernet-ip") real (não mockado) — é
// justamente a lacuna que deixou o CI verde no PR #51 (bump 1.2.5→2.0.0):
// a lib v2 reescreveu a API inteira (Controller→PLC, connect(ip, slot)→
// connect(ip, {slot}), readTag/writeTag→read/write), e como o uso é via
// import() dinâmico, um mock no nível do módulo nunca pegaria a
// divergência — só bate contra o pacote publicado de verdade.
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
