import { describe, it, expect } from "vitest"
import { SimulationStore } from "@/simulation/store.js"
import {
    DEMO_DEVICES,
    DEMO_NETWORK_NAME,
    bootstrapDemoDevices,
} from "@/simulation/demoBootstrap.js"

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
            "lumitrack/demo/comercial/geral",
            "lumitrack/demo/comercial/vendas",
            "lumitrack/demo/comercial/forno",
        ])
    })

    it("é idempotente — a segunda chamada não duplica devices no mesmo tópico", () => {
        const store = new SimulationStore()

        bootstrapDemoDevices(store)
        const second = bootstrapDemoDevices(store)

        expect(second).toBeNull()
        expect(store.listNetworks()).toHaveLength(1)
        expect(store.snapshot()[0]!.devices).toHaveLength(DEMO_DEVICES.length)
    })
})
