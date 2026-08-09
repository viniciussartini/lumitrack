import { env } from "@/config/env.js"
import { logger } from "@/shared/logger.js"
import { createBroker } from "@/broker/broker.js"
import { createInternalPublisher } from "@/mqtt/internalPublisher.js"
import { SimulationStore } from "@/simulation/store.js"
import { SimulationEngine } from "@/simulation/simulationEngine.js"
import { bootstrapDemoDevices } from "@/simulation/demoBootstrap.js"
import { createApp } from "@/api/app.js"

async function main(): Promise<void> {
    const credentials = { username: env.BROKER_USERNAME, password: env.BROKER_PASSWORD }

    const broker = createBroker(credentials)
    await broker.start(env.BROKER_PORT, env.BROKER_HOST)

    const publisher = createInternalPublisher(
        `mqtt://${env.BROKER_HOST}:${env.BROKER_PORT}`,
        credentials,
    )
    await publisher.connect()

    const store = new SimulationStore()

    // Antes de ligar o motor, para que o primeiro tick já encontre os
    // devices e o painel da demo tenha dado ao vivo o quanto antes.
    if (env.DEMO_BOOTSTRAP_ENABLED) {
        const result = bootstrapDemoDevices(store)
        if (result) {
            logger.info(
                `[Bootstrap] Rede de demonstração criada com ${result.deviceIds.length} device(s) ligado(s).`,
            )
        }
    }

    const engine = new SimulationEngine(store, publisher)
    engine.startEngine()

    const app = createApp({ store, engine })
    const server = app.listen(env.API_PORT, env.API_HOST, () => {
        logger.info(`API de controle em http://${env.API_HOST}:${env.API_PORT}`)
        logger.info(`Broker MQTT embutido em mqtt://${env.BROKER_HOST}:${env.BROKER_PORT}`)
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
