/**
 * AlertEvaluator — avalia cada amostra elétrica recebida contra os alertas
 * por faixa de potência habilitados do medidor (singleton no server.ts,
 * registrado como listener de `IoTDataProcessor.addSampleListener`).
 *
 * Cache em memória `meterId → Alert[]` (só os habilitados), carregado no
 * boot (`loadCache`) e invalidado seletivamente pelo `AlertService` a cada
 * create/update/delete/toggle — o mesmo padrão de injeção de invalidação já
 * usado no restante do projeto (ex.: RBAC lido do banco a cada requisição).
 *
 * Anti-flapping por contagem de amostras consecutivas (não por tempo): abre
 * um episódio de disparo após N amostras seguidas fora da faixa, fecha após
 * M amostras seguidas dentro dela. Isso absorve ruído de curta duração sem
 * disparar/encerrar a cada amostra individual.
 */
import type { AlertRepository, AlertResponse } from "@/modules/alert/alert.repository.js"
import type { AlertTriggerEventRepository } from "@/modules/alert/alert-trigger-event.repository.js"
import { resolveMeterTarget, type MeterTargetRepos } from "@/modules/meter/meter-target.js"
import type { UserEventHub } from "@/shared/sse/user-event-hub.js"
import type { NotificationStore } from "@/shared/notifications/notification-store.js"
import { logger } from "@/shared/logger/logger.js"

// 3 amostras fora abrem o episódio, 5 amostras dentro o fecham —
// assimetria proposital, é mais barato continuar "em alerta" por mais um
// pouco do que apagar e reacender à toa.
const OPEN_AFTER_CONSECUTIVE_OUTSIDE = 3
const CLOSE_AFTER_CONSECUTIVE_INSIDE = 5

interface EpisodeState {
    alertId: string
    userId: string
    meterId: string
    alertName: string
    outsideStreak: number
    insideStreak: number
    firing: boolean
    startedAt: Date | undefined
    minPowerW: number
    maxPowerW: number
    sumPowerW: number
    sampleCount: number
}

export type FiringAlert = {
    alertId: string
    meterId: string
    alertName: string
    startedAt: Date
}

export class AlertEvaluator {
    private readonly cache = new Map<string, AlertResponse[]>() // meterId → alertas habilitados
    private readonly episodes = new Map<string, EpisodeState>() // alertId → episódio em andamento

    constructor(
        private readonly alertRepository: AlertRepository,
        private readonly alertTriggerEventRepository: AlertTriggerEventRepository,
        private readonly meterTargetRepos: MeterTargetRepos,
        private readonly userEventHub: UserEventHub,
        private readonly notificationStore: NotificationStore,
    ) {}

    // Popula o cache inteiro — chamado uma vez no boot do servidor, antes de
    // restaurar as conexões IoT (para não perder avaliação das primeiras
    // amostras que chegarem).
    async loadCache(): Promise<void> {
        const alerts = await this.alertRepository.findAllEnabled()
        this.cache.clear()
        for (const alert of alerts) {
            const list = this.cache.get(alert.meterId) ?? []
            list.push(alert)
            this.cache.set(alert.meterId, list)
        }
    }

    // Recarrega só os alertas de um medidor — chamado pelo AlertService após
    // create/update/delete/toggle. Se um alerta em disparo for desabilitado
    // ou excluído, o episódio é encerrado imediatamente (persiste o evento e
    // notifica), em vez de ficar "preso" em firing para sempre.
    async invalidateMeter(meterId: string): Promise<void> {
        const alerts = await this.alertRepository.findAllEnabledByMeter(meterId)
        if (alerts.length === 0) {
            this.cache.delete(meterId)
        } else {
            this.cache.set(meterId, alerts)
        }

        const stillEnabledIds = new Set(alerts.map((a) => a.id))
        for (const [alertId, state] of this.episodes) {
            if (state.meterId === meterId && state.firing && !stillEnabledIds.has(alertId)) {
                await this.closeEpisode(state, new Date())
                this.episodes.delete(alertId)
            }
        }
    }

    async evaluate(meterId: string, powerW: number, at: Date): Promise<void> {
        const alerts = this.cache.get(meterId)
        if (!alerts || alerts.length === 0) return

        for (const alert of alerts) {
            try {
                await this.evaluateAlert(alert, powerW, at)
            } catch (err) {
                // Um alerta com erro não deve impedir a avaliação dos demais
                // nem derrubar o pipeline de ingestão (mesmo raciocínio do
                // IoTDataProcessor: código de worker não propaga exceção).
                logger.error(
                    { module: "AlertEvaluator", alertId: alert.id, err },
                    "Erro ao avaliar alerta",
                )
            }
        }
    }

    isFiring(alertId: string): boolean {
        return !!this.episodes.get(alertId)?.firing
    }

    getFiringByUser(userId: string): FiringAlert[] {
        const result: FiringAlert[] = []
        for (const [alertId, state] of this.episodes) {
            if (state.firing && state.userId === userId) {
                result.push({
                    alertId,
                    meterId: state.meterId,
                    alertName: state.alertName,
                    startedAt: state.startedAt!,
                })
            }
        }
        return result
    }

    private async evaluateAlert(alert: AlertResponse, powerW: number, at: Date): Promise<void> {
        const referenceW = alert.referencePowerKw * 1000
        const tolerance = alert.tolerancePercent / 100
        const minW = referenceW * (1 - tolerance)
        const maxW = referenceW * (1 + tolerance)
        const outside = powerW < minW || powerW > maxW

        let state = this.episodes.get(alert.id)
        if (!state) {
            state = {
                alertId: alert.id,
                userId: alert.userId,
                meterId: alert.meterId,
                alertName: alert.name,
                outsideStreak: 0,
                insideStreak: 0,
                firing: false,
                startedAt: undefined,
                minPowerW: powerW,
                maxPowerW: powerW,
                sumPowerW: 0,
                sampleCount: 0,
            }
            this.episodes.set(alert.id, state)
        }

        // Mantém o snapshot do nome atualizado (pode ter sido renomeado).
        state.alertName = alert.name

        if (outside) {
            state.outsideStreak += 1
            state.insideStreak = 0
        } else {
            state.insideStreak += 1
            state.outsideStreak = 0
        }

        if (!state.firing) {
            if (state.outsideStreak >= OPEN_AFTER_CONSECUTIVE_OUTSIDE) {
                state.firing = true
                state.startedAt = at
                state.minPowerW = powerW
                state.maxPowerW = powerW
                state.sumPowerW = powerW
                state.sampleCount = 1

                this.userEventHub.emit(alert.userId, "alert-firing", {
                    type: "start",
                    alertId: alert.id,
                    alertName: alert.name,
                    meterId: alert.meterId,
                    startedAt: state.startedAt,
                })
            }
            return
        }

        // Episódio em andamento — acumula estatísticas da faixa.
        state.minPowerW = Math.min(state.minPowerW, powerW)
        state.maxPowerW = Math.max(state.maxPowerW, powerW)
        state.sumPowerW += powerW
        state.sampleCount += 1

        if (state.insideStreak >= CLOSE_AFTER_CONSECUTIVE_INSIDE) {
            await this.closeEpisode(state, at)
        }
    }

    // Fecha o episódio: persiste o AlertTriggerEvent, emite alert-firing (end)
    // e SÓ ENTÃO cria a notificação — ordem exigida pelo plano (4.1).
    private async closeEpisode(state: EpisodeState, endedAt: Date): Promise<void> {
        const startedAt = state.startedAt!
        const durationSeconds = Math.max(
            0,
            Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
        )
        const avgPowerW = state.sumPowerW / state.sampleCount

        await this.alertTriggerEventRepository.create({
            alertId: state.alertId,
            startedAt,
            endedAt,
            durationSeconds,
            minPowerW: state.minPowerW,
            maxPowerW: state.maxPowerW,
            avgPowerW,
            sampleCount: state.sampleCount,
        })

        this.userEventHub.emit(state.userId, "alert-firing", {
            type: "end",
            alertId: state.alertId,
            alertName: state.alertName,
            meterId: state.meterId,
            startedAt,
            endedAt,
        })

        const target = await resolveMeterTarget(this.meterTargetRepos, state.meterId)
        const notification = this.notificationStore.add(state.userId, {
            alertId: state.alertId,
            alertName: state.alertName,
            meterId: state.meterId,
            targetType: target?.targetType ?? "PROPERTY",
            targetPath: target?.targetPath ?? "/",
            message: `Alerta "${state.alertName}" foi disparado. Clique aqui para ver.`,
        })
        this.userEventHub.emit(state.userId, "notification", notification)

        // Reseta o episódio — o alerta não desarma, um novo ciclo pode abrir
        // a qualquer momento enquanto o medidor continuar reportando.
        state.firing = false
        state.outsideStreak = 0
        state.insideStreak = 0
        state.startedAt = undefined
    }
}
