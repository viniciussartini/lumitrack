import { createApp } from "@/app.js"
import { env } from "@/config/env.js"
import { prisma } from "@/shared/database/prisma.js"
import { IoTConnectionManager } from "@/modules/iot/iot-worker/IoTConnectionManager.js"
import { IoTDataProcessor } from "@/modules/iot/iot-worker/IoTDataProcessor.js"
import { HourlyRollupScheduler } from "@/modules/iot/iot-worker/HourlyRollupScheduler.js"
import { ConsumptionRepository } from "@/modules/consumption/consumption.repository.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import type { IoTConfigResponse } from "@/modules/iot/iot.repository.js"


/**
 * Inicialização do pipeline IoT
 * 
 * Primeiro o buffer, depois o processador, depois o scheduler
 * e por fim o manager
 */

const manager   = IoTConnectionManager.getInstance()
const processor = new IoTDataProcessor(manager)

const scheduler = new HourlyRollupScheduler(
    processor.buffer,
    new ConsumptionRepository(prisma),
    new DeviceRepository(prisma),
    new AreaRepository(prisma),
    new PropertyRepository(prisma),
    new DistributorRepository(prisma),
)

// Registra o processor no manager ANTES de restaurar as conexões,
// garantindo que nenhuma leitura seja perdida durante o boot.
processor.start()
scheduler.start()

/**
 * Criação do app
 * 
 * O processor é passado para o app para que a rota SSE possa registrar
 * listeners nele. É a única dependência que atravessa a fronteira server→app.
 */
const app = createApp({ processor })

const server = app.listen(env.PORT, async () => {
    console.log(`LumiTrack API rodando em http://localhost:${env.PORT}`)
    console.log(`Ambiente: ${env.NODE_ENV}`)
    console.log(`Health: http://localhost:${env.PORT}/health`)

    // Restaura as conexões IoT ativas do banco após o servidor estar escutando.
    // Fazemos isso aqui (e não antes do listen) para garantir que o servidor
    // já está pronto para receber requisições quando as primeiras leituras chegam.
    await restoreIoTConnections()
})

/**
 * Restauração de conexões IoT
 * 
 * Quando o servidor reinicia, todos os devices com IoTDeviceConfig cadastrada
 * precisam ter sua conexão restabelecida. Sem isso, o monitoramento em tempo
 * real seria interrompido em toda reinicialização do processo.
 * 
 * Esta função busca todas as configs no banco e reconecta cada device.
 * O IoTConnectionManager ignora silenciosamente devices já conectados,
 * então esta função é segura para chamar múltiplas vezes.
 * @returns 
 */
async function restoreIoTConnections(): Promise<void> {
    try {
        const configs = await prisma.ioTDeviceConfig.findMany()

        if (configs.length === 0) {
            console.log("[Boot] Nenhuma config IoT encontrada. Nada a restaurar.")
            return
        }

        console.log(`[Boot] Restaurando ${configs.length} conexão(ões) IoT...`)

        // O campo `extra` retornado pelo Prisma é tipado como `JsonValue`
        // (união de string | number | boolean | null | JsonObject | JsonArray),
        // mas IoTConfigResponse espera `Record<string, unknown> | null`.
        // Em runtime, o campo é sempre um objeto JSON ou null.
        const typedConfigs = configs as unknown as IoTConfigResponse[]

        const results = await Promise.allSettled(
            typedConfigs.map((config) => manager.start(config)),
        )

        const succeeded = results.filter((r) => r.status === "fulfilled").length
        const failed    = results.filter((r) => r.status === "rejected").length

        console.log(`[Boot] Conexões restauradas: ${succeeded} ok, ${failed} falha(s).`)
    } catch (err) {
        // Falha na restauração não deve impedir o servidor de responder —
        // o monitoramento IoT é importante mas não é o núcleo da API REST.
        console.error("[Boot] Erro ao restaurar conexões IoT:", err)
    }
}

/**
 * Graceful shutdown
 * 
 * Garante que o scheduler para de persistir, as conexões IoT são encerradas
 * de forma limpa, e o servidor para de aceitar novas requisições antes de sair.
 * Importante em produção com PM2/Docker para evitar perda de dados no buffer.
 * @param signal 
 */
async function shutdown(signal: string): Promise<void> {
    console.log(`\n⚡ Sinal ${signal} recebido. Encerrando servidor...`)

    // Para o scheduler — evita que um flush parcial aconteça durante o shutdown.
    scheduler.stop()

    // Flush final: persiste qualquer acumulado pendente no buffer antes de sair.
    // Sem isso, até 59 minutos de leituras IoT poderiam ser perdidos em um restart.
    console.log("[Shutdown] Executando flush final do buffer IoT...")
    await processor.buffer.getAllHourlySnapshots().length > 0
        ? new HourlyRollupScheduler(
            processor.buffer,
            new ConsumptionRepository(prisma),
            new DeviceRepository(prisma),
            new AreaRepository(prisma),
            new PropertyRepository(prisma),
            new DistributorRepository(prisma),
            ).flush()
        : Promise.resolve()

    // Desconecta todos os devices IoT de forma limpa.
    await IoTConnectionManager.getInstance().stopAll()

    server.close(() => {
        console.log("Servidor encerrado com sucesso.")
        process.exit(0)
    })
}

process.on("SIGTERM", () => { void shutdown("SIGTERM") })
process.on("SIGINT",  () => { void shutdown("SIGINT") })