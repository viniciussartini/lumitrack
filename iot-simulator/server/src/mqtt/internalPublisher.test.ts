import { describe, it, expect, afterEach } from "vitest"
import mqtt, { type MqttClient } from "mqtt"
import { createBroker, type EmbeddedBroker } from "@/broker/broker.js"
import { createInternalPublisher } from "@/mqtt/internalPublisher.js"

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
        broker = createBroker()
        const port = await broker.start(0)

        const publisher = createInternalPublisher(`mqtt://localhost:${port}`)
        await publisher.connect()
        expect(publisher.isConnected()).toBe(true)

        const topic = "lumitrack/sim/dev1"
        const payload = { voltage: 220, current: 2, powerW: 440, powerFactor: 0.95 }

        rawClient = mqtt.connect(`mqtt://localhost:${port}`)
        await new Promise<void>((resolve, reject) => {
            rawClient!.once("connect", () => {
                rawClient!.subscribe(topic, (err) => (err ? reject(err) : resolve()))
            })
            rawClient!.once("error", reject)
        })

        const received = await new Promise<string>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("timeout esperando mensagem MQTT")), 3000)
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
        const publisher = createInternalPublisher("mqtt://localhost:1")
        expect(() => publisher.publish("t", { a: 1 })).not.toThrow()
    })
})
