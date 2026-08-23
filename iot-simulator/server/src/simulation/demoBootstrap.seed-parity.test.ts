/**
 * A topologia de demonstração vive em dois lugares que precisam concordar:
 * `DEMO_DEVICES` (aqui, usado quando o simulador se auto-popula) e o
 * `DEVICES_LIST` de `deploy/seed-simulator-devices.sh` (usado no deploy
 * self-hosted, onde os devices são criados uma vez e o auto-bootstrap fica
 * desligado).
 *
 * Manter os dois em sincronia era convenção escrita em comentário — e a
 * convenção já falhou: a topologia cresceu de 4 para 11 medidores e o script
 * ficou para trás, criando 4 devices, dois deles com tópicos que não existiam
 * mais. O defeito só apareceu ao rodar o deploy de verdade, meses depois.
 *
 * Este teste troca a convenção por CI vermelho: se um lado mudar sem o outro,
 * ele falha apontando exatamente qual campo divergiu.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import { DEMO_DEVICES } from "./demoBootstrap.js"

const SEED_SCRIPT = path.resolve(
    import.meta.dirname,
    "../../../../deploy/seed-simulator-devices.sh",
)

interface SeedDevice {
    name: string
    topic: string
    profile: string
    nominalVoltage: number
    nominalPowerW: number
    powerFactorBase: number
    noiseAmplitudePercent: number
}

/**
 * Extrai as linhas de `DEVICES_LIST="..."` do script de seed. O formato é
 * uma linha por device, campos separados por `|`, na ordem declarada no
 * comentário do próprio script.
 */
function parseSeedScript(): SeedDevice[] {
    const script = readFileSync(SEED_SCRIPT, "utf-8")
    const match = script.match(/DEVICES_LIST="([^"]*)"/)

    if (!match?.[1]) {
        throw new Error(
            `Não encontrei a atribuição DEVICES_LIST="..." em ${SEED_SCRIPT}. ` +
                "Se o formato do script mudou, este teste precisa acompanhar.",
        )
    }

    return match[1]
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
            const [
                name,
                topic,
                profile,
                nominalVoltage,
                nominalPowerW,
                powerFactorBase,
                noiseAmplitudePercent,
            ] = line.split("|")

            return {
                name: name ?? "",
                topic: topic ?? "",
                profile: profile ?? "",
                nominalVoltage: Number(nominalVoltage),
                nominalPowerW: Number(nominalPowerW),
                powerFactorBase: Number(powerFactorBase),
                noiseAmplitudePercent: Number(noiseAmplitudePercent),
            }
        })
}

/**
 * Achata um `NewDeviceInput` no mesmo formato plano das linhas do script.
 *
 * `params` e seus campos são opcionais no tipo (`NewDeviceInput` serve
 * também para criação parcial via API), mas todo device de demonstração
 * precisa da calibração completa — sem ela não há o que espelhar no script.
 * Um device incompleto aqui é erro de quem editou `DEMO_DEVICES`, e a
 * mensagem abaixo diz exatamente qual e o que falta.
 */
function flatten(device: (typeof DEMO_DEVICES)[number]): SeedDevice {
    const { profile, nominalVoltage, nominalPowerW, powerFactorBase, noiseAmplitudePercent } =
        device.params ?? {}

    if (
        profile === undefined ||
        nominalVoltage === undefined ||
        nominalPowerW === undefined ||
        powerFactorBase === undefined ||
        noiseAmplitudePercent === undefined
    ) {
        throw new Error(
            `DEMO_DEVICES["${device.topic}"] está sem calibração completa em params — ` +
                "todo device de demonstração precisa de profile, nominalVoltage, " +
                "nominalPowerW, powerFactorBase e noiseAmplitudePercent para poder " +
                "ser espelhado em deploy/seed-simulator-devices.sh.",
        )
    }

    return {
        name: device.name,
        topic: device.topic,
        profile,
        nominalVoltage,
        nominalPowerW,
        powerFactorBase,
        noiseAmplitudePercent,
    }
}

describe("paridade entre DEMO_DEVICES e deploy/seed-simulator-devices.sh", () => {
    const seedDevices = parseSeedScript()

    it("tem a mesma quantidade de medidores dos dois lados", () => {
        expect(seedDevices).toHaveLength(DEMO_DEVICES.length)
    })

    it("tem os mesmos tópicos, na mesma ordem", () => {
        expect(seedDevices.map((device) => device.topic)).toEqual(
            DEMO_DEVICES.map((device) => device.topic),
        )
    })

    it("espelha todos os parâmetros de calibração, medidor a medidor", () => {
        // Comparação da lista inteira de uma vez: o diff do vitest aponta
        // exatamente qual medidor e qual campo divergiu, sem precisar de um
        // caso de teste por device (e sem indexação que o TypeScript não
        // consegue provar segura).
        expect(seedDevices).toEqual(DEMO_DEVICES.map(flatten))
    })
})
