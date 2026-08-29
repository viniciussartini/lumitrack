import { describe, it, expect } from "vitest"
import { IoTConnectionManager } from "@/modules/iot/iot-worker/IoTConnectionManager.js"

// Regressão de um risco residual: a validação de SSRF em MeterService só
// corria na escrita (create/update), não em toda tentativa de conexão real
// — um host cujo DNS mudasse para um endereço interno DEPOIS de validado
// reconectava sem checagem em todo restart do processo (server.ts restaura
// todo Meter do banco chamando manager.start()). Estes testes cobrem o
// funil único (start()), não o validador em si (já coberto por
// outboundHost.test.ts).
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

// Regressão: as 12 non-null assertions de createConnection()
// foram substituídas por validação Zod real (connectionConfigSchema) — um
// config com host/port válidos (passa SSRF) mas faltando campo obrigatório
// específico do protocolo agora falha fechado com log, em vez de coagir
// `null` para o tipo esperado silenciosamente ou lançar sem tratamento.
describe("IoTConnectionManager — validação de config em start()", () => {
    it("recusa iniciar MODBUS_TCP sem extra.currentAddress/powerAddress/powerFactorAddress, sem lançar e sem registrar conexão", async () => {
        const manager = IoTConnectionManager.getInstance()
        const before = manager.activeCount()

        await expect(
            manager.start({
                meterId: "meter-config-invalid-modbus-tcp",
                protocol: "MODBUS_TCP",
                host: "127.0.0.1",
                port: 502,
                topic: null,
                address: "10",
                extra: null, // faltam os 3 campos obrigatórios
            }),
        ).resolves.toBeUndefined()

        expect(manager.activeCount()).toBe(before)
    })

    it("recusa iniciar MQTT sem topic (campo obrigatório do protocolo), sem lançar", async () => {
        const manager = IoTConnectionManager.getInstance()
        const before = manager.activeCount()

        await expect(
            manager.start({
                meterId: "meter-config-invalid-mqtt",
                protocol: "MQTT",
                host: "127.0.0.1",
                port: 1883,
                topic: null,
                address: null,
                extra: null,
            }),
        ).resolves.toBeUndefined()

        expect(manager.activeCount()).toBe(before)
    })
})
