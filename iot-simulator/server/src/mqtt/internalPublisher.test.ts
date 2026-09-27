import { describe, it, expect, afterEach } from "vitest"
import mqtt, { type MqttClient } from "mqtt"
import { createBroker, type EmbeddedBroker } from "@/broker/broker.js"
import { createInternalPublisher } from "@/mqtt/internalPublisher.js"
import { generateSample } from "@/simulation/signalGenerator.js"
import type { AnomalyState, DeviceParams, ElectricalSample } from "@/simulation/types.js"

const credentials = { username: "sim-user", password: "sim-pass" }

// As 21 grandezas por fase do ADR-0022 (todas as chaves de `ElectricalSample`
// exceto as 4 que já existiam antes) — usado para conferir que nenhuma se
// perde entre `generateSample` e o parse do lado do assinante MQTT.
const PHASE_FIELD_NAMES: (keyof ElectricalSample)[] = [
    "voltagePhaseA",
    "voltagePhaseB",
    "voltagePhaseC",
    "currentPhaseA",
    "currentPhaseB",
    "currentPhaseC",
    "activePowerPhaseA",
    "activePowerPhaseB",
    "activePowerPhaseC",
    "reactivePowerVar",
    "apparentPowerVa",
    "frequencyHz",
    "powerFactorPhaseA",
    "powerFactorPhaseB",
    "powerFactorPhaseC",
    "thdVoltagePhaseA",
    "thdVoltagePhaseB",
    "thdVoltagePhaseC",
    "thdCurrentPhaseA",
    "thdCurrentPhaseB",
    "thdCurrentPhaseC",
]

describe("createInternalPublisher — integração local com o broker embutido", () => {
    let broker: EmbeddedBroker | undefined
    let rawClient: MqttClient | undefined

    afterEach(async () => {
        rawClient?.end(true)
        rawClient = undefined
        await broker?.stop()
        broker = undefined
    })

    it("publica um payload JSON que um segundo cliente MQTT recebe intacto", async () => {
        broker = createBroker(credentials)
        const port = await broker.start(0)

        const publisher = createInternalPublisher(`mqtt://localhost:${port}`, credentials)
        await publisher.connect()
        expect(publisher.isConnected()).toBe(true)

        const topic = "lumitrack/sim/dev1"
        const payload = { voltage: 220, current: 2, powerW: 440, powerFactor: 0.95 }

        rawClient = mqtt.connect(`mqtt://localhost:${port}`, credentials)
        await new Promise<void>((resolve, reject) => {
            rawClient!.once("connect", () => {
                rawClient!.subscribe(topic, (err) => (err ? reject(err) : resolve()))
            })
            rawClient!.once("error", reject)
        })

        const received = await new Promise<string>((resolve, reject) => {
            const timeout = setTimeout(
                () => reject(new Error("timeout esperando mensagem MQTT")),
                3000,
            )
            rawClient!.once("message", (_topic, message) => {
                clearTimeout(timeout)
                resolve(message.toString())
            })
            publisher.publish(topic, payload)
        })

        expect(JSON.parse(received)).toEqual(payload)

        await publisher.disconnect()
        expect(publisher.isConnected()).toBe(false)
    })

    it("publish() antes de connect() não lança — só é ignorado com warning", () => {
        const publisher = createInternalPublisher("mqtt://localhost:1", credentials)
        expect(() => publisher.publish("t", { a: 1 })).not.toThrow()
    })

    it("uma amostra real de generateSample() chega intacta a um assinante MQTT, com as 21 grandezas por fase", async () => {
        broker = createBroker(credentials)
        const port = await broker.start(0)

        const publisher = createInternalPublisher(`mqtt://localhost:${port}`, credentials)
        await publisher.connect()

        const topic = "lumitrack/sim/dev1"
        const params: DeviceParams = {
            nominalVoltage: 220,
            nominalPowerW: 1000,
            powerFactorBase: 0.95,
            noiseAmplitudePercent: 2,
            profile: "RESIDENTIAL_STEADY",
        }
        const anomaly: AnomalyState = { active: false, multiplier: 1, endsAt: null }
        const sample = generateSample(params, anomaly, 0)

        rawClient = mqtt.connect(`mqtt://localhost:${port}`, credentials)
        await new Promise<void>((resolve, reject) => {
            rawClient!.once("connect", () => {
                rawClient!.subscribe(topic, (err) => (err ? reject(err) : resolve()))
            })
            rawClient!.once("error", reject)
        })

        const received = await new Promise<string>((resolve, reject) => {
            const timeout = setTimeout(
                () => reject(new Error("timeout esperando mensagem MQTT")),
                3000,
            )
            rawClient!.once("message", (_topic, message) => {
                clearTimeout(timeout)
                resolve(message.toString())
            })
            publisher.publish(topic, sample)
        })

        const parsed = JSON.parse(received) as ElectricalSample
        expect(parsed).toEqual(sample)
        for (const field of PHASE_FIELD_NAMES) {
            expect(Number.isFinite(parsed[field])).toBe(true)
        }

        await publisher.disconnect()
    })
})
