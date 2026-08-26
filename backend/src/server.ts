import { createApp } from "@/app.js"
import { env } from "@/config/env.js"
import { logger } from "@/shared/logger/logger.js"
import { prisma, getPoolStats } from "@/shared/database/prisma.js"
import { IoTConnectionManager } from "@/modules/iot/iot-worker/IoTConnectionManager.js"
import { IoTDataProcessor } from "@/modules/iot/iot-worker/IoTDataProcessor.js"
import { MinuteRollupScheduler } from "@/modules/iot/iot-worker/MinuteRollupScheduler.js"
import { MeterReadingRepository } from "@/modules/meter/meter-reading.repository.js"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
import { AlertRepository } from "@/modules/alert/alert.repository.js"
import { AlertTriggerEventRepository } from "@/modules/alert/alert-trigger-event.repository.js"
import { AlertEvaluator } from "@/modules/alert/alert-evaluator.js"
import { UserEventHub } from "@/shared/sse/user-event-hub.js"
import { NotificationStore } from "@/shared/notifications/notification-store.js"
import { AuthRepository } from "@/modules/auth/auth.repository.js"
import { AuditRepository } from "@/shared/audit/audit.repository.js"
import { RetentionService } from "@/shared/retention/retention.service.js"
import { RetentionPurgeScheduler } from "@/shared/retention/RetentionPurgeScheduler.js"
import { TariffFlagRepository } from "@/modules/tariff-flag/tariff-flag.repository.js"
import { TariffFlagHistoryRepository } from "@/modules/tariff-flag/tariff-flag-history.repository.js"
import { AneelTariffFlagSource } from "@/modules/tariff-flag/sync/AneelTariffFlagSource.js"
import { TariffFlagSyncService } from "@/modules/tariff-flag/sync/TariffFlagSyncService.js"
import { TariffFlagSyncScheduler } from "@/modules/tariff-flag/sync/TariffFlagSyncScheduler.js"

// Singletons do processo — distribuem eventos SSE (alert-firing,
// notification) para clientes conectados. Passados para createApp() para
// que a MESMA instância seja usada tanto pelas rotas HTTP (alert) quanto
// pelo stream SSE — sem isso, um alerta disparado pelo AlertEvaluator nunca
// chegaria a um listener SSE registrado numa instância diferente.
const userEventHub = new UserEventHub()
const notificationStore = new NotificationStore()

// Compartilhado com restoreIoTConnections() abaixo — evita montar 2
// instâncias do repository só para ler o mesmo Meter de lugares diferentes.
const meterRepository = new MeterRepository(prisma)

// AlertEvaluator (Fase 4) — avalia cada amostra elétrica contra os alertas
// por faixa de potência habilitados do medidor (histerese por contagem de
// amostras consecutivas). Registrado como listener do processor logo abaixo.
const alertEvaluator = new AlertEvaluator(
    new AlertRepository(prisma),
    new AlertTriggerEventRepository(prisma),
    { meterRepository },
    userEventHub,
    notificationStore,
)

/**
 * Inicialização do pipeline IoT (Fase 2 — reformulação)
 *
 * Primeiro o manager (conexões), depois o processor (valida/calcula energia,
 * alimenta o buffer), depois o scheduler (persiste os baldes de minuto).
 *
 * Diferente do pipeline anterior (por hora, por device, com cálculo de custo
 * e checagem de alertas no rollup), este é propositalmente mais simples: o
 * scheduler só persiste grandezas elétricas cruas por medidor/minuto. Custo
 * fica para a agregação (Fase 3); alertas por potência são avaliados amostra
 * a amostra pelo AlertEvaluator (Fase 4), não mais no rollup.
 */
const manager = IoTConnectionManager.getInstance()
const processor = new IoTDataProcessor(manager)

const scheduler = new MinuteRollupScheduler(
    processor.buffer,
    new MeterReadingRepository(prisma),
    getPoolStats,
)

// Registra o processor no manager ANTES de restaurar as conexões,
// garantindo que nenhuma leitura seja perdida durante o boot.
processor.start()
scheduler.start()

// Registra o AlertEvaluator como mais um listener de amostras processadas —
// cada leitura elétrica recebida é avaliada contra os alertas habilitados
// do medidor, sem acoplar o processor ao módulo de alertas.
processor.addSampleListener((sample) => {
    void alertEvaluator.evaluate(sample.meterId, sample.powerW, sample.receivedAt)
})

// Retenção e expurgo de dados: roda no boot e a cada 24h. As 4 primeiras
// entidades são Art. 15/16 LGPD (tokens/resets já inativos, audit logs
// antigos); as 4 últimas (ADR-0014) são armazenamento/performance, sem
// titular real. Períodos configuráveis via env.DATA_RETENTION_*.
const retentionService = new RetentionService(
    new AuthRepository(prisma),
    new AuditRepository(prisma),
    new MeterReadingRepository(prisma),
    new AlertTriggerEventRepository(prisma),
    new TariffFlagHistoryRepository(prisma),
    {
        authToken: env.DATA_RETENTION_AUTH_TOKEN_DAYS,
        passwordReset: env.DATA_RETENTION_PASSWORD_RESET_DAYS,
        auditLog: env.DATA_RETENTION_AUDIT_LOG_DAYS,
        refreshToken: env.DATA_RETENTION_REFRESH_TOKEN_DAYS,
        meterReading: env.DATA_RETENTION_METER_READING_DAYS,
        alertTriggerEvent: env.DATA_RETENTION_ALERT_TRIGGER_EVENT_DAYS,
        mfaBackupCode: env.DATA_RETENTION_MFA_BACKUP_CODE_DAYS,
        tariffFlagHistory: env.DATA_RETENTION_TARIFF_FLAG_HISTORY_DAYS,
    },
)
const retentionScheduler = new RetentionPurgeScheduler(retentionService)
retentionScheduler.start()

// Sincronização automática da bandeira tarifária vigente a partir
// da fonte oficial ANEEL (ver ADR-0007). Mesmo padrão do RetentionPurgeScheduler:
// roda no boot e a cada 24h; falha da fonte nunca derruba o processo nem
// altera o config vigente (falha fechada — mantém o último valor conhecido).
const tariffFlagSyncService = new TariffFlagSyncService(
    new AneelTariffFlagSource(),
    new TariffFlagRepository(prisma),
    new TariffFlagHistoryRepository(prisma),
)
const tariffFlagSyncScheduler = new TariffFlagSyncScheduler(tariffFlagSyncService)
tariffFlagSyncScheduler.start()

/**
 * Criação do app
 *
 * processor e userEventHub atravessam a fronteira server→app: a rota SSE
 * (/api/iot/stream) só é montada quando ambos estão presentes.
 */
const app = createApp({ processor, userEventHub, alertEvaluator, notificationStore })

const server = app.listen(env.PORT, () => {
    logger.info(`LumiTrack API rodando em http://localhost:${env.PORT}`)
    logger.info(`Ambiente: ${env.NODE_ENV}`)
    logger.info(`Health: http://localhost:${env.PORT}/health`)

    // app.listen espera um callback () => void — a inicialização pós-boot é
    // async, então roda numa IIFE com catch explícito em vez de deixar a
    // rejeição da promise do callback virar unhandledRejection silencioso
    // (falhar fechado: um erro aqui derruba o processo, não passa batido).
    void (async () => {
        try {
            // Carrega o cache de alertas habilitados ANTES de restaurar as
            // conexões IoT — evita que as primeiras amostras recebidas
            // passem sem avaliação.
            await alertEvaluator.loadCache()

            // Restaura as conexões IoT ativas do banco após o servidor estar
            // escutando. Fazemos isso aqui (e não antes do listen) para
            // garantir que o servidor já está pronto para receber
            // requisições quando as primeiras leituras chegam.
            await restoreIoTConnections()
        } catch (err) {
            logger.error({ err }, "Falha ao inicializar cache de alertas ou restaurar conexões IoT")
            process.exit(1)
        }
    })()
})

/**
 * Restauração de conexões IoT
 *
 * Quando o servidor reinicia, todo Meter cadastrado precisa ter sua conexão
 * restabelecida. Sem isso, o monitoramento em tempo real seria interrompido
 * em toda reinicialização do processo.
 *
 * O IoTConnectionManager ignora silenciosamente medidores já conectados,
 * então esta função é segura para chamar múltiplas vezes.
 */
async function restoreIoTConnections(): Promise<void> {
    try {
        // Já decifrado (issue #182 — extra.password de medidores MQTT é
        // cifrado em repouso; findAllConnectionConfigs é o único caminho
        // interno autorizado a devolver o valor em texto claro).
        const configs = await meterRepository.findAllConnectionConfigs()

        if (configs.length === 0) {
            logger.info("[Boot] Nenhum medidor encontrado. Nada a restaurar.")
            return
        }

        logger.info(`[Boot] Restaurando ${configs.length} conexão(ões) IoT...`)

        const results = await Promise.allSettled(configs.map((config) => manager.start(config)))

        const succeeded = results.filter((r) => r.status === "fulfilled").length
        const failed = results.filter((r) => r.status === "rejected").length

        logger.info(`[Boot] Conexões restauradas: ${succeeded} ok, ${failed} falha(s).`)
    } catch (err) {
        // Falha na restauração não deve impedir o servidor de responder —
        // o monitoramento IoT é importante mas não é o núcleo da API REST.
        logger.error({ err }, "[Boot] Erro ao restaurar conexões IoT")
    }
}

/**
 * Graceful shutdown
 *
 * Garante que o scheduler para de persistir, as conexões IoT são encerradas
 * de forma limpa, e o servidor para de aceitar novas requisições antes de sair.
 * Importante em produção com PM2/Docker para evitar perda de dados no buffer.
 */
async function shutdown(signal: string): Promise<void> {
    logger.info(`Sinal ${signal} recebido. Encerrando servidor...`)

    // Para o scheduler — evita que um flush parcial aconteça durante o shutdown.
    scheduler.stop()
    retentionScheduler.stop()
    tariffFlagSyncScheduler.stop()

    // Flush final: persiste qualquer balde pendente no buffer antes de sair,
    // incluindo o minuto em curso (flushAll, não flush).
    logger.info("[Shutdown] Executando flush final do buffer IoT...")
    await scheduler.flushAll()

    // Desconecta todos os medidores de forma limpa.
    await IoTConnectionManager.getInstance().stopAll()

    server.close(() => {
        logger.info("Servidor encerrado com sucesso.")
        process.exit(0)
    })
}

process.on("SIGTERM", () => {
    void shutdown("SIGTERM")
})
process.on("SIGINT", () => {
    void shutdown("SIGINT")
})
