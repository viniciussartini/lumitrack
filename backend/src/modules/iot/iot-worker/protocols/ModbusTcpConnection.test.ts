import { describe, it, expect } from "vitest"
import { ModbusTcpConnection } from "@/modules/iot/iot-worker/protocols/ModbusTcpConnection.js"

// Teste de caracterização (issue #306) — comportamento hoje sem cobertura.
// Usa o import("jsmodbus")/net real (não mockado), mesmo padrão já usado
// para EthernetIpConnection neste diretório: uma conexão recusada pelo SO
// deve chegar como Error de rede, não como TypeError de API incompatível.
describe("ModbusTcpConnection", () => {
    it("connect() contra uma porta fechada rejeita com Error de conexão, não TypeError", async () => {
        const connection = new ModbusTcpConnection({
            meterId: "meter-modbus-tcp-test",
            host: "127.0.0.1",
            port: 1, // porta privilegiada, nada deve estar escutando nela em teste
            address: "0",
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
            host: "127.0.0.1",
            port: 1,
            address: "0",
        })

        await expect(connection.disconnect()).resolves.toBeUndefined()
    })

    it("isConnected() começa false", () => {
        const connection = new ModbusTcpConnection({
            meterId: "meter-modbus-tcp-test-3",
            host: "127.0.0.1",
            port: 1,
            address: "0",
        })

        expect(connection.isConnected()).toBe(false)
    })
})
