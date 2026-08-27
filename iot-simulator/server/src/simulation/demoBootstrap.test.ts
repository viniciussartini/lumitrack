import { describe, it, expect, vi } from "vitest"
import { SimulationStore } from "@/simulation/store.js"
import { SimulationEngine } from "@/simulation/simulationEngine.js"
import type { InternalPublisher } from "@/mqtt/internalPublisher.js"
import {
    DEMO_DEVICES,
    DEMO_NETWORK_NAME,
    bootstrapDemoDevices,
    startDemoDevices,
} from "@/simulation/demoBootstrap.js"

function createFakePublisher(): InternalPublisher & {
    publish: ReturnType<typeof vi.fn<(topic: string, payload: unknown) => void>>
} {
    return {
        connect: vi.fn(async () => {}),
        disconnect: vi.fn(async () => {}),
        publish: vi.fn<(topic: string, payload: unknown) => void>(),
        isConnected: () => true,
    }
}

describe("bootstrapDemoDevices", () => {
    it("cria a rede de demonstração com todos os devices ligados", () => {
        const store = new SimulationStore()
        const result = bootstrapDemoDevices(store)

        expect(result).not.toBeNull()
        expect(result!.deviceIds).toHaveLength(DEMO_DEVICES.length)

        const [network] = store.snapshot()
        expect(network!.name).toBe(DEMO_NETWORK_NAME)
        expect(network!.devices).toHaveLength(DEMO_DEVICES.length)
        expect(network!.devices.every((device) => device.poweredOn)).toBe(true)
    })

    it("aplica os parâmetros elétricos declarados, sem cair no default do store", () => {
        const store = new SimulationStore()
        bootstrapDemoDevices(store)

        const [network] = store.snapshot()

        for (const spec of DEMO_DEVICES) {
            const device = network!.devices.find((candidate) => candidate.topic === spec.topic)

            expect(device, `device do tópico ${spec.topic} não foi criado`).toBeDefined()
            expect(device!.params).toEqual(spec.params)
        }
    })

    // Os tópicos são o contrato com backend/prisma/seed-demo/topology.ts: o
    // backend assina exatamente estes, e uma divergência produz um painel
    // silencioso — sem erro, só sem dado. Congelar a lista aqui faz uma
    // mudança acidental de um lado quebrar o teste em vez da demo.
    it("publica exatamente nos tópicos dos medidores do seed de demonstração", () => {
        expect(DEMO_DEVICES.map((device) => device.topic)).toEqual([
            "lumitrack/demo/residencial/geral",
            "lumitrack/demo/residencial/sala",
            "lumitrack/demo/residencial/cozinha",
            "lumitrack/demo/residencial/quarto-casal",
            "lumitrack/demo/residencial/banheiro",
            "lumitrack/demo/residencial/area-servico",
            "lumitrack/demo/comercial/geral",
            "lumitrack/demo/comercial/administrativo",
            "lumitrack/demo/comercial/torno-cnc",
            "lumitrack/demo/comercial/solda",
            "lumitrack/demo/comercial/compressor",
        ])
    })

    // Com noiseAmplitudePercent até 8%, o "Potência agora" oscilava
    // visivelmente a cada tick (o ruído gaussiano de signalGenerator.ts
    // não é correlacionado entre leituras consecutivas), sem transmitir
    // sensação de medição real. Teto reduzido pra manter a leitura ao
    // vivo mais estável — congela o limite aqui pra uma mudança futura
    // não reintroduzir o problema sem reconsideração deliberada.
    it("mantém noiseAmplitudePercent baixo o suficiente pra uma leitura ao vivo estável (≤ 4%)", () => {
        for (const spec of DEMO_DEVICES) {
            expect(spec.params, `${spec.name} (${spec.topic}) sem params`).toBeDefined()
            expect(
                spec.params!.noiseAmplitudePercent,
                `${spec.name} (${spec.topic}) com noiseAmplitudePercent muito alto`,
            ).toBeLessThanOrEqual(4)
        }
    })

    it("é idempotente — a segunda chamada não duplica devices no mesmo tópico", () => {
        const store = new SimulationStore()

        bootstrapDemoDevices(store)
        const second = bootstrapDemoDevices(store)

        expect(second).toBeNull()
        expect(store.listNetworks()).toHaveLength(1)
        expect(store.snapshot()[0]!.devices).toHaveLength(DEMO_DEVICES.length)
    })

    // Bug real observado na demo pública: bootstrapDemoDevices marca
    // poweredOn:true direto no store, mas só engine.powerOn (via
    // startDemoDevices) de fato inicia o DeviceRunner que publica. Sem essa
    // chamada, nenhum device publica nada — painel sempre sem leitura ao
    // vivo, mesmo com poweredOn:true e a conexão MQTT do backend certa.
    it("sem startDemoDevices, poweredOn:true no store não publica nada", () => {
        vi.useFakeTimers()
        try {
            const store = new SimulationStore()
            const publisher = createFakePublisher()
            // Engine construído mas nunca usado — reproduz o bug de
            // propósito: bootstrapDemoDevices sozinho não chama powerOn.
            new SimulationEngine(store, publisher)
            bootstrapDemoDevices(store)

            vi.advanceTimersByTime(2000)

            expect(publisher.publish).not.toHaveBeenCalled()
        } finally {
            vi.useRealTimers()
        }
    })

    it("startDemoDevices liga o motor de fato — cada device publica periodicamente", () => {
        vi.useFakeTimers()
        try {
            const store = new SimulationStore()
            const publisher = createFakePublisher()
            const engine = new SimulationEngine(store, publisher)
            const result = bootstrapDemoDevices(store)!

            startDemoDevices(engine, result)
            vi.advanceTimersByTime(1000)

            expect(publisher.publish).toHaveBeenCalledTimes(DEMO_DEVICES.length)
        } finally {
            vi.useRealTimers()
        }
    })
})
