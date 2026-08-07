import { describe, it, expect } from "vitest"
import { IoTConnectionManager } from "@/modules/iot/iot-worker/IoTConnectionManager.js"

// Regressão do risco residual documentado no CHANGELOG da issue #150: a
// validação de SSRF em MeterService só corria na escrita (create/update),
// não em toda tentativa de conexão real — um host cujo DNS mudasse para um
// endereço interno DEPOIS de validado reconectava sem checagem em todo
// restart do processo (server.ts restaura todo Meter do banco chamando
// manager.start()). Estes testes cobrem o funil único (start()), não o
// validador em si (já coberto por outboundHost.test.ts).
describe("IoTConnectionManager — revalidação de SSRF em start()", () => {
    it("recusa conectar a um host cujo endereço não é unicast público, sem registrar a conexão como ativa", async () => {
        const manager = IoTConnectionManager.getInstance()
        const before = manager.activeCount()

        // 169.254.169.254 (metadata de cloud, link-local) não está coberto
        // pelo IOT_ALLOWED_HOSTS de teste (vitest.config.ts) — precisa ser
        // recusado independente de allowlist.
        await manager.start({
            meterId: "meter-ssrf-test-metadata",
            protocol: "MQTT",
            host: "169.254.169.254",
            port: 1883,
            topic: "medidor/teste",
            address: null,
            extra: null,
        })

        expect(manager.activeCount()).toBe(before)
    })

    it("recusa conectar a um host em faixa RFC1918 não allowlistada", async () => {
        const manager = IoTConnectionManager.getInstance()
        const before = manager.activeCount()

        await manager.start({
            meterId: "meter-ssrf-test-rfc1918",
            protocol: "MODBUS_TCP",
            host: "10.20.30.40",
            port: 502,
            topic: null,
            address: "0",
            extra: null,
        })

        expect(manager.activeCount()).toBe(before)
    })

    it("stop() num medidor que nunca chegou a conectar (recusado por SSRF) não lança", async () => {
        const manager = IoTConnectionManager.getInstance()

        await expect(manager.stop("meter-ssrf-test-metadata")).resolves.toBeUndefined()
    })
})
