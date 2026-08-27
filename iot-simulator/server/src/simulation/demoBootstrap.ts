import type { NewDeviceInput, SimulationStore } from "@/simulation/store.js"
import type { SimulationEngine } from "@/simulation/simulationEngine.js"

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
 * Os 11 tópicos abaixo casam 1:1 com os 11 medidores MQTT de
 * `backend/prisma/seed-demo/topology.ts` (submedição por cômodo na Casa
 * Demo, por área/equipamento na Metalúrgica Demo, além do medidor geral de
 * cada propriedade). Se um lado mudar, o outro precisa mudar junto — sem
 * isso o backend assina um tópico em que ninguém publica, e o sintoma é um
 * painel silencioso sem nenhum erro visível.
 *
 * `nominalPowerW` é a potência típica de operação de cada ponto — calibrada
 * abaixo da `referencePowerKw` do alerta correspondente (ver topology.ts),
 * com folga para a variação normal (±5% de senoide + ruído gaussiano) não
 * disparar alerta sozinha. O medidor geral de cada propriedade não tem
 * alerta configurado (residencial) ou usa a referência mais alta (comercial)
 * — não é a soma literal dos submedidores, é o relógio de entrada da
 * concessionária, com sinal próprio.
 *
 * Atenção à unidade: `noiseAmplitudePercent` aqui é **percentual**
 * (`z.number().min(0).max(100)`, usado como
 * `nominalPowerW * (noiseAmplitudePercent / 100)` em `signalGenerator.ts`).
 *
 * Valores calibrados para uma leitura ao vivo mais estável — ruído
 * gaussiano é independente a cada tick, sem correlação entre leituras
 * consecutivas; nos valores originais (2–8%) o "Potência agora" oscilava
 * visivelmente segundo a segundo, sem transmitir sensação de medição
 * real. Mantida a ordem relativa de variabilidade entre perfis — cargas
 * resistivas puras (chuveiro) mais estáveis que motores/solda industrial.
 */
export const DEMO_DEVICES: readonly NewDeviceInput[] = [
    // ── Casa Demo (residencial) ──────────────────────────────────────────
    {
        name: "Medidor Geral — Casa Demo",
        topic: "lumitrack/demo/residencial/geral",
        params: {
            profile: "RESIDENTIAL_STEADY",
            nominalVoltage: 220,
            nominalPowerW: 3500,
            powerFactorBase: 0.92,
            noiseAmplitudePercent: 2,
        },
    },
    {
        name: "Sala de Estar",
        topic: "lumitrack/demo/residencial/sala",
        params: {
            profile: "RESIDENTIAL_STEADY",
            nominalVoltage: 220,
            nominalPowerW: 900,
            powerFactorBase: 0.93,
            noiseAmplitudePercent: 2,
        },
    },
    {
        name: "Cozinha",
        topic: "lumitrack/demo/residencial/cozinha",
        params: {
            profile: "RESIDENTIAL_STEADY",
            nominalVoltage: 220,
            nominalPowerW: 1900,
            powerFactorBase: 0.9,
            noiseAmplitudePercent: 3,
        },
    },
    {
        name: "Quarto Casal",
        topic: "lumitrack/demo/residencial/quarto-casal",
        params: {
            profile: "RESIDENTIAL_STEADY",
            nominalVoltage: 220,
            nominalPowerW: 750,
            powerFactorBase: 0.93,
            noiseAmplitudePercent: 2,
        },
    },
    {
        name: "Banheiro — Chuveiro Elétrico",
        topic: "lumitrack/demo/residencial/banheiro",
        params: {
            profile: "RESIDENTIAL_STEADY",
            nominalVoltage: 220,
            nominalPowerW: 4800,
            powerFactorBase: 0.98,
            noiseAmplitudePercent: 1,
        },
    },
    {
        name: "Área de Serviço",
        topic: "lumitrack/demo/residencial/area-servico",
        params: {
            profile: "RESIDENTIAL_STEADY",
            nominalVoltage: 220,
            nominalPowerW: 1100,
            powerFactorBase: 0.88,
            noiseAmplitudePercent: 3,
        },
    },

    // ── Metalúrgica Demo (comercial/industrial) ──────────────────────────
    {
        name: "Medidor Geral — Metalúrgica Demo",
        topic: "lumitrack/demo/comercial/geral",
        params: {
            profile: "INDUSTRIAL_MOTOR",
            nominalVoltage: 380,
            nominalPowerW: 19000,
            powerFactorBase: 0.88,
            noiseAmplitudePercent: 2,
        },
    },
    {
        name: "Administrativo",
        topic: "lumitrack/demo/comercial/administrativo",
        params: {
            profile: "COMMERCIAL_HVAC",
            nominalVoltage: 380,
            nominalPowerW: 2200,
            powerFactorBase: 0.92,
            noiseAmplitudePercent: 2,
        },
    },
    {
        name: "Torno CNC",
        topic: "lumitrack/demo/comercial/torno-cnc",
        params: {
            profile: "INDUSTRIAL_MOTOR",
            nominalVoltage: 380,
            nominalPowerW: 4800,
            powerFactorBase: 0.85,
            noiseAmplitudePercent: 2,
        },
    },
    {
        name: "Máquina de Solda MIG/MAG",
        topic: "lumitrack/demo/comercial/solda",
        params: {
            profile: "INDUSTRIAL_MOTOR",
            nominalVoltage: 380,
            nominalPowerW: 3600,
            powerFactorBase: 0.8,
            noiseAmplitudePercent: 4,
        },
    },
    {
        name: "Compressor de Ar Industrial",
        topic: "lumitrack/demo/comercial/compressor",
        params: {
            profile: "INDUSTRIAL_MOTOR",
            nominalVoltage: 380,
            nominalPowerW: 7800,
            powerFactorBase: 0.86,
            noiseAmplitudePercent: 1,
        },
    },
]

export interface DemoBootstrapResult {
    networkId: string
    deviceIds: string[]
}

/**
 * Cria a rede de demonstração com todos os devices ligados.
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

/**
 * Liga de fato os devices do bootstrap, via `engine.powerOn` — é esse
 * caminho (não `store.setPower`, usado acima) que cria e inicia o
 * `DeviceRunner` de cada device, o `setInterval` que de fato publica no
 * broker a cada ~1s (deviceRunner.ts). Sem chamar isto, um device fica
 * marcado `poweredOn: true` nos dados mas nunca publica nada — sintoma
 * observado na demo pública: painel sempre sem leitura, em todo boot,
 * mesmo com a conexão MQTT do backend certa.
 */
export function startDemoDevices(engine: SimulationEngine, result: DemoBootstrapResult): void {
    for (const deviceId of result.deviceIds) {
        engine.powerOn(deviceId)
    }
}
