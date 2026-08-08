import { describe, it, expect } from "vitest"
import { connect as netConnect } from "net"
import mqtt from "mqtt"
import { createBroker } from "@/broker/broker.js"

const credentials = { username: "sim-user", password: "sim-pass" }

describe("createBroker", () => {
    it("start()/stop() não lançam, e retorna a porta efetivamente vinculada", async () => {
        const broker = createBroker(credentials)
        const port = await broker.start(0)

        expect(port).toBeGreaterThan(0)

        await expect(broker.stop()).resolves.toBeUndefined()
    })

    it("stop() sem nunca ter dado start() é no-op seguro", async () => {
        const broker = createBroker(credentials)
        await expect(broker.stop()).resolves.toBeUndefined()
    })

    it("aceita conexões TCP na porta vinculada", async () => {
        const broker = createBroker(credentials)
        const port = await broker.start(0)

        await new Promise<void>((resolve, reject) => {
            const socket = netConnect(port, "127.0.0.1", () => {
                socket.end()
                resolve()
            })
            socket.once("error", reject)
        })

        await broker.stop()
    })

    it("rejeita cliente MQTT sem credenciais (issue #180)", async () => {
        const broker = createBroker(credentials)
        const port = await broker.start(0)

        const client = mqtt.connect(`mqtt://127.0.0.1:${port}`, { reconnectPeriod: 0 })
        try {
            await new Promise<void>((resolve, reject) => {
                client.once("connect", () => reject(new Error("não deveria conectar sem senha")))
                client.once("error", () => resolve())
            })
        } finally {
            client.end(true)
            await broker.stop()
        }
    })

    it("rejeita cliente MQTT com credenciais erradas", async () => {
        const broker = createBroker(credentials)
        const port = await broker.start(0)

        const client = mqtt.connect(`mqtt://127.0.0.1:${port}`, {
            reconnectPeriod: 0,
            username: "sim-user",
            password: "senha-errada",
        })
        try {
            await new Promise<void>((resolve, reject) => {
                client.once("connect", () =>
                    reject(new Error("não deveria conectar com senha errada")),
                )
                client.once("error", () => resolve())
            })
        } finally {
            client.end(true)
            await broker.stop()
        }
    })

    it("aceita cliente MQTT com credenciais corretas", async () => {
        const broker = createBroker(credentials)
        const port = await broker.start(0)

        const client = mqtt.connect(`mqtt://127.0.0.1:${port}`, {
            reconnectPeriod: 0,
            username: credentials.username,
            password: credentials.password,
        })
        try {
            await new Promise<void>((resolve, reject) => {
                client.once("connect", () => resolve())
                client.once("error", reject)
            })
        } finally {
            client.end(true)
            await broker.stop()
        }
    })
})
