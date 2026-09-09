/**
 * DemandAlertScheduler — avalia, 1x/minuto, os alertas de ultrapassagem de
 * demanda contratada (Grupo A) habilitados contra o agregado mensal de
 * `MeterDemandRollup`.
 *
 * Scheduler IRMÃO do `DemandRollupScheduler`, não uma extensão dele (mesmo
 * raciocínio do comentário de topo daquele): lê o resultado já persistido,
 * não recalcula nada a partir de `MeterReading`. Alinhado ao minuto cheio com
 * um offset MAIOR que o do `DemandRollupScheduler` (que atualiza o rollup),
 * garantindo que este tick sempre lê o valor já corrigido do minuto.
 *
 * Deliberadamente sem o motor de episódio/histerese do `AlertEvaluator`
 * (ver ADR-0020):
 * `MeterDemandRollup` é um agregado que só cresce dentro do ciclo de
 * faturamento (nunca "volta pra dentro da faixa" a tempo de precisar de
 * anti-flapping) — idempotência via `lastNotifiedPeriodStart` (no máximo 1
 * notificação por ciclo) é suficiente.
 */
import type {
    DemandAlertRepository,
    DemandAlertResponse,
} from "@/modules/demand-alert/demand-alert.repository.js"
import type { MeterRepository, MeterWithTargetRow } from "@/modules/meter/meter.repository.js"
import type {
    MeterDemandRollupRepository,
    MeterDemandRollupResponse,
} from "@/modules/meter/meter-demand-rollup.repository.js"
import {
    resolveContractedDemands,
    measuredDemandKwFor,
    type ContractedDemand,
} from "@/shared/tariff/contractedDemand.js"
import { resolveMeterTarget, type MeterTargetRepos } from "@/modules/meter/meter-target.js"
import type { UserEventHub } from "@/shared/sse/user-event-hub.js"
import type { NotificationStore } from "@/shared/notifications/notification-store.js"
import { toSaoPauloLocal, fromSaoPauloLocal } from "@/shared/time/localTime.js"
import { logger } from "@/shared/logger/logger.js"
import type { TariffPost } from "@/generated/prisma/client.js"

const log = logger.child({ module: "DemandAlertScheduler" })

// Folga maior que a do DemandRollupScheduler (5s) — dá tempo dele terminar
// de atualizar o rollup do minuto antes deste tick ler o valor.
const START_OFFSET_MS = 15_000

const POST_LABELS: Record<TariffPost, string> = { PEAK: "ponta", OFF_PEAK: "fora de ponta" }

export class DemandAlertScheduler {
    private flushTimer: ReturnType<typeof setInterval> | null = null
    private alignTimer: ReturnType<typeof setTimeout> | null = null

    constructor(
        private readonly demandAlertRepository: DemandAlertRepository,
        private readonly meterRepository: MeterRepository,
        private readonly meterDemandRollupRepository: MeterDemandRollupRepository,
        private readonly meterTargetRepos: MeterTargetRepos,
        private readonly userEventHub: UserEventHub,
        private readonly notificationStore: NotificationStore,
    ) {}

    /** Inicia o scheduler, alinhando o primeiro tick ao próximo minuto cheio (+ folga). */
    start(): void {
        const delay = this.msUntilNextMinute() + START_OFFSET_MS

        log.info(
            { firstTickAt: new Date(Date.now() + delay).toISOString() },
            `Iniciado. Primeiro tick em ${Math.round(delay / 1000)}s`,
        )

        this.alignTimer = setTimeout(() => {
            void this.tick()
            this.flushTimer = setInterval(() => {
                void this.tick()
            }, 60_000)
        }, delay)
    }

    /** Para o scheduler — usado no graceful shutdown do servidor. */
    stop(): void {
        if (this.alignTimer) {
            clearTimeout(this.alignTimer)
            this.alignTimer = null
        }
        if (this.flushTimer) {
            clearInterval(this.flushTimer)
            this.flushTimer = null
        }
        log.info("Parado.")
    }

    /**
     * Avalia todos os alertas habilitados contra o rollup do ciclo corrente.
     * Público para testes e para o tick periódico.
     *
     * @param now - Instante de referência (injetável para teste).
     */
    async tick(now: Date = new Date()): Promise<void> {
        const alerts = await this.demandAlertRepository.findAllEnabled()
        if (alerts.length === 0) {
            return
        }

        const periodStart = this.currentPeriodStart(now)
        // Alerta já notificado neste ciclo nunca precisa de rollup nem de
        // resolução de alvo — filtrar aqui evita 2 consultas em lote inúteis
        // quando a maioria dos alertas já disparou no mês corrente.
        const pendingAlerts = alerts.filter(
            (a) =>
                !a.lastNotifiedPeriodStart ||
                a.lastNotifiedPeriodStart.getTime() !== periodStart.getTime(),
        )
        if (pendingAlerts.length === 0) {
            return
        }

        const meterIds = [...new Set(pendingAlerts.map((a) => a.meterId))]
        const [targets, rollupsByMeter] = await Promise.all([
            this.meterRepository.findManyByIdsWithTarget(meterIds),
            this.meterDemandRollupRepository.findByMetersAndPeriod(meterIds, periodStart),
        ])

        const results = await Promise.allSettled(
            pendingAlerts.map((alert) =>
                this.processOne(
                    alert,
                    targets.get(alert.meterId),
                    rollupsByMeter.get(alert.meterId) ?? [],
                    periodStart,
                ),
            ),
        )

        for (let i = 0; i < results.length; i++) {
            const result = results[i]!
            if (result.status === "rejected") {
                log.error(
                    { demandAlertId: pendingAlerts[i]!.id, err: result.reason },
                    "Falha ao avaliar alerta de ultrapassagem de demanda — seguindo para os demais",
                )
            }
        }
    }

    private async processOne(
        alert: DemandAlertResponse,
        target: MeterWithTargetRow | undefined,
        rows: MeterDemandRollupResponse[],
        periodStart: Date,
    ): Promise<void> {
        const property = target?.property
        if (!property) {
            log.warn(
                { demandAlertId: alert.id, meterId: alert.meterId },
                "Medidor ou propriedade não encontrados — alerta pulado",
            )
            return
        }
        // Fail-closed: a propriedade pode ter mudado de grupo/modalidade
        // depois que o alerta foi criado — em vez de lançar, pula em
        // silêncio (avisado só em log), igual à ausência de rollup abaixo.
        if (property.tariffGroup !== "GROUP_A") {
            log.warn(
                { demandAlertId: alert.id, meterId: alert.meterId },
                "Propriedade não é mais Grupo A — alerta pulado",
            )
            return
        }
        if (property.tariffModality !== "GREEN" && property.tariffModality !== "BLUE") {
            log.warn(
                { demandAlertId: alert.id, meterId: alert.meterId },
                "Modalidade sem cálculo de demanda implementado — alerta pulado",
            )
            return
        }

        // Mesmo tratamento fail-closed dos 3 casos acima: propriedade Grupo A
        // pode ficar sem demanda contratada cadastrada num estado transitório
        // (ex.: em edição) — pula em vez de deixar a exceção subir e virar
        // `log.error` recorrente a cada tick.
        let contractedDemands: ContractedDemand[]
        try {
            contractedDemands = resolveContractedDemands(property, property.tariffModality)
        } catch (err) {
            log.warn(
                { demandAlertId: alert.id, meterId: alert.meterId, err },
                "Propriedade sem demanda contratada cadastrada — alerta pulado",
            )
            return
        }

        if (rows.length === 0) {
            return // sem dado ainda neste ciclo — nunca dispara por ausência
        }

        const breach = contractedDemands
            .map((cd) => ({
                post: cd.post,
                ratioPercent: (measuredDemandKwFor(cd.post, rows) / cd.contractedDemandKw) * 100,
            }))
            .find((r) => r.ratioPercent >= alert.thresholdPercent)

        if (!breach) {
            return
        }

        await this.notify(alert, breach.post, breach.ratioPercent)
        await this.demandAlertRepository.update(alert.id, { lastNotifiedPeriodStart: periodStart })
    }

    private async notify(
        alert: DemandAlertResponse,
        post: TariffPost | null,
        ratioPercent: number,
    ): Promise<void> {
        const target = await resolveMeterTarget(this.meterTargetRepos, alert.meterId)
        const postLabel = post ? ` (posto ${POST_LABELS[post]})` : ""
        const notification = this.notificationStore.add(alert.userId, {
            alertId: alert.id,
            alertName: alert.name,
            meterId: alert.meterId,
            targetType: target?.targetType ?? "PROPERTY",
            targetPath: target?.targetPath ?? "/",
            message: `Alerta "${alert.name}": demanda medida atingiu ${ratioPercent.toFixed(1)}% da demanda contratada${postLabel}.`,
        })
        this.userEventHub.emit(alert.userId, "notification", notification)
    }

    private currentPeriodStart(now: Date): Date {
        const local = toSaoPauloLocal(now)
        return fromSaoPauloLocal(new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1)))
    }

    private msUntilNextMinute(): number {
        const now = new Date()
        const next = new Date(now)
        next.setSeconds(60, 0)
        return next.getTime() - now.getTime()
    }
}
