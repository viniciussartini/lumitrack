import type { NewDeviceInput, SimulationStore } from "@/simulation/store.js"

/**
 * Bootstrap dos dispositivos da demonstração pública (ADR-0010).
 *
 * O `SimulationStore` é inteiramente em memória — reiniciar o processo zera
 * redes e devices. Localmente isso é irrelevante (o operador recria pela UI
 * ou pelo `deploy/seed-simulator-devices.sh`), mas na demo pública o host
 * gratuito hiberna após 15 min sem tráfego: sem este bootstrap, todo
 * despertar traria o simulador vazio e o painel ficaria sem dado ao vivo.
 *
 * Roda direto contra o store, não via HTTP — o servidor está subindo, e uma
 * chamada de rede a si mesmo no boot só acrescentaria modos de falha
 * (ordem de listen, token, timeout) sem nenhuma contrapartida.
 */

export const DEMO_NETWORK_NAME = "Demo"

/**
 * Os tópicos abaixo casam 1:1 com os 4 medidores MQTT de
 * `backend/prisma/seed-demo/topology.ts`. Se um lado mudar, o outro precisa
 * mudar junto — sem isso o backend assina um tópico em que ninguém publica,
 * e o sintoma é um painel silencioso sem nenhum erro visível.
 *
 * As constantes elétricas espelham `PROFILE_DEFAULTS` de
 * `backend/prisma/seed-demo/consumptionGen.ts`, para o dado ao vivo ser
 * contínuo com o histórico já semeado em vez de destoar dele.
 *
 * Atenção à unidade: no seed, `noiseAmplitudePercent` é **fração** (0.04);
 * aqui é **percentual** (`z.number().min(0).max(100)`, usado como
 * `nominalPowerW * (noiseAmplitudePercent / 100)` em `signalGenerator.ts`).
 * Por isso 0.04 vira 4.
 *
 * `nominalPowerW` é uma escolha de valor plausível de meio de dia: o
 * simulador não modela curva por hora (o `profile` é metadado; o sinal é
 * `nominalPowerW` ± 5% de senoide + ruído), enquanto o seed modela. Qualquer
 * constante é um meio-termo — estes valores ficam próximos do que o perfil
 * correspondente do seed produz durante o horário comercial.
 */
export const DEMO_DEVICES: readonly NewDeviceInput[] = [
    {
        name: "Medidor Geral — Casa Demo",
        topic: "lumitrack/demo/residencial/geral",
        params: {
            profile: "RESIDENTIAL_STEADY",
            nominalVoltage: 220,
            nominalPowerW: 450,
            powerFactorBase: 0.92,
            noiseAmplitudePercent: 4,
        },
    },
    {
        name: "Medidor Geral — Padaria Demo",
        topic: "lumitrack/demo/comercial/geral",
        params: {
            profile: "COMMERCIAL_HVAC",
            nominalVoltage: 380,
            nominalPowerW: 6000,
            powerFactorBase: 0.9,
            noiseAmplitudePercent: 4,
        },
    },
    {
        name: "Medidor Área de Vendas",
        topic: "lumitrack/demo/comercial/vendas",
        params: {
            profile: "COMMERCIAL_HVAC",
            nominalVoltage: 380,
            nominalPowerW: 1200,
            powerFactorBase: 0.87,
            noiseAmplitudePercent: 5,
        },
    },
    {
        name: "Medidor Forno Industrial",
        topic: "lumitrack/demo/comercial/forno",
        params: {
            profile: "INDUSTRIAL_MOTOR",
            nominalVoltage: 380,
            nominalPowerW: 2500,
            powerFactorBase: 0.97,
            noiseAmplitudePercent: 3,
        },
    },
]

export interface DemoBootstrapResult {
    networkId: string
    deviceIds: string[]
}

/**
 * Cria a rede de demonstração com os 4 devices ligados.
 *
 * Idempotente por nome de rede: se uma rede "Demo" já existe, não faz nada e
 * devolve `null`. O store nasce vazio a cada processo, então na prática isso
 * só protege contra invocação dupla — mas é barato e evita duplicar devices
 * publicando no mesmo tópico, o que dobraria as leituras de um medidor.
 */
export function bootstrapDemoDevices(store: SimulationStore): DemoBootstrapResult | null {
    const alreadyBootstrapped = store
        .listNetworks()
        .some((network) => network.name === DEMO_NETWORK_NAME)

    if (alreadyBootstrapped) return null

    const network = store.createNetwork(DEMO_NETWORK_NAME)
    const deviceIds: string[] = []

    for (const spec of DEMO_DEVICES) {
        const device = store.createDevice(network.id, spec)

        // `createDevice` devolve undefined só se a rede não existir — ela
        // acabou de ser criada aqui, então isto é defensivo, não esperado.
        if (!device) continue

        store.setPower(device.id, true)
        deviceIds.push(device.id)
    }

    return { networkId: network.id, deviceIds }
}
