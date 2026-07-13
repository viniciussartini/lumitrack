import { describe, it, expect } from "vitest"
import { connect as netConnect } from "net"
import { createBroker } from "@/broker/broker.js"

describe("createBroker", () => {
    it("start()/stop() não lançam, e retorna a porta efetivamente vinculada", async () => {
        const broker = createBroker()
        const port = await broker.start(0)

        expect(port).toBeGreaterThan(0)

        await expect(broker.stop()).resolves.toBeUndefined()
    })

    it("stop() sem nunca ter dado start() é no-op seguro", async () => {
        const broker = createBroker()
        await expect(broker.stop()).resolves.toBeUndefined()
    })

    it("aceita conexões TCP na porta vinculada", async () => {
        const broker = createBroker()
        const port = await broker.start(0)

        await new Promise<void>((resolve, reject) => {
            const socket = netConnect(port, "localhost", () => {
                socket.end()
                resolve()
            })
            socket.once("error", reject)
        })

        await broker.stop()
    })
})
