import { describe, it, expect, vi } from "vitest"
import { EthernetIpConnection } from "@/modules/iot/iot-worker/protocols/EthernetIpConnection.js"

const baseConfig = {
    host: "127.0.0.1",
    address: "Voltage.Tag",
    currentAddress: "Current.Tag",
    powerAddress: "Power.Tag",
    powerFactorAddress: "PowerFactor.Tag",
}

interface ReadSampleHarness {
    plc: unknown
    _readSample(): Promise<Record<string, unknown>>
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
        const connection = new EthernetIpConnection({ meterId: "meter-eip-test", ...baseConfig })

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
        const connection = new EthernetIpConnection({ meterId: "meter-eip-test-2", ...baseConfig })

        await expect(connection.disconnect()).resolves.toBeUndefined()
    })

    it("isConnected() começa false", () => {
        const connection = new EthernetIpConnection({ meterId: "meter-eip-test-3", ...baseConfig })

        expect(connection.isConnected()).toBe(false)
    })

    // Regressão (issue #307): antes desta correção, cada tick lia UMA tag só
    // e emitia `{tag, value, timestamp}` — formato que IoTDataProcessor
    // sempre rejeitava. Agora lê as 4 tags configuradas e combina numa
    // amostra elétrica completa.
    it("_readSample() lê as 4 tags configuradas, na ordem, e combina numa amostra elétrica", async () => {
        const connection = new EthernetIpConnection({
            meterId: "meter-eip-test-4",
            ...baseConfig,
        }) as unknown as ReadSampleHarness

        const read = vi.fn((tag: string) => {
            const valuesByTag: Record<string, number> = {
                "Voltage.Tag": 220,
                "Current.Tag": 12,
                "Power.Tag": 2640,
                "PowerFactor.Tag": 0.95,
            }
            return Promise.resolve(valuesByTag[tag] ?? -1)
        })
        connection.plc = { read }

        const sample = await connection._readSample()

        expect(read).toHaveBeenCalledTimes(4)
        expect(read).toHaveBeenNthCalledWith(1, "Voltage.Tag")
        expect(read).toHaveBeenNthCalledWith(2, "Current.Tag")
        expect(read).toHaveBeenNthCalledWith(3, "Power.Tag")
        expect(read).toHaveBeenNthCalledWith(4, "PowerFactor.Tag")
        expect(sample["voltage"]).toBe(220)
        expect(sample["current"]).toBe(12)
        expect(sample["powerW"]).toBe(2640)
        expect(sample["powerFactor"]).toBe(0.95)
    })
})
