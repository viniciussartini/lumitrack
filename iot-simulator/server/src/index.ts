import { env } from "@/config/env.js"
import { logger } from "@/shared/logger.js"
import { createBroker } from "@/broker/broker.js"
import { createInternalPublisher } from "@/mqtt/internalPublisher.js"
import { SimulationStore } from "@/simulation/store.js"
import { SimulationEngine } from "@/simulation/simulationEngine.js"
import { createApp } from "@/api/app.js"

async function main(): Promise<void> {
    const broker = createBroker()
    await broker.start(env.BROKER_PORT)

    const publisher = createInternalPublisher(`mqtt://localhost:${env.BROKER_PORT}`)
    await publisher.connect()

    const store = new SimulationStore()
    const engine = new SimulationEngine(store, publisher)
    engine.startEngine()

    const app = createApp({ store, engine })
    const server = app.listen(env.API_PORT, () => {
        logger.info(`API de controle em http://localhost:${env.API_PORT}`)
        logger.info(`Broker MQTT embutido em mqtt://localhost:${env.BROKER_PORT}`)
    })

    let shuttingDown = false

    async function shutdown(signal: string): Promise<void> {
        if (shuttingDown) return
        shuttingDown = true

        logger.info(`Sinal ${signal} recebido. Encerrando simulador...`)
        engine.stopEngine()
        await publisher.disconnect()
        await new Promise<void>((resolve) => server.close(() => resolve()))
        await broker.stop()
        logger.info("Simulador encerrado.")
        process.exit(0)
    }

    process.on("SIGTERM", () => {
        void shutdown("SIGTERM")
    })
    process.on("SIGINT", () => {
        void shutdown("SIGINT")
    })
}

void main()
