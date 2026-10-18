/**
 * GoalAlertScheduler — avalia, a cada 15 minutos, o alerta de meta: quando o
 * consumo do mês corrente alcança o percentual configurado da meta do mês, ou
 * o acumulado do ano alcança o da meta anual, avisa o dono pelo sino de
 * notificações.
 *
 * Mesmo desenho do `DemandAlertScheduler` (ver ADR-0020): lê o consumo já
 * agregado, nunca leituras brutas, e a idempotência vem de uma marca na
 * própria meta — um aviso por mês e um por ano. A marca é reivindicada com um
 * `UPDATE` condicional antes de avisar, então duas instâncias do processo
 * jamais avisam duas vezes.
 */
import type { GoalUnit } from "@/generated/prisma/client.js"
import { computeGoalAlertState } from "@/modules/goal/goal-alert.js"
import type { GoalConsumptionReader, MonthlyValues } from "@/modules/goal/goal-consumption.js"
import { computeGoalProgress } from "@/modules/goal/goal-progress.js"
import type { GoalRepository, GoalWithProperty } from "@/modules/goal/goal.repository.js"
import type { NotificationStore } from "@/shared/notifications/notification-store.js"
import type { UserEventHub } from "@/shared/sse/user-event-hub.js"
import { toSaoPauloLocal } from "@/shared/time/localTime.js"
import { logger } from "@/shared/logger/logger.js"

const log = logger.child({ module: "GoalAlertScheduler" })

const INTERVAL_MS = 15 * 60 * 1000
const FIRST_TICK_DELAY_MS = 60 * 1000

/** Onde o aviso leva: a página das metas, já na propriedade da meta avisada. */
const goalsPath = (propertyId: string): string =>
    `/configuracoes/metas?propertyId=${encodeURIComponent(propertyId)}`

/** O que o aviso diz, por unidade da meta. */
const WORDING: Record<
    GoalUnit,
    {
        month: (percent: string) => string
        /** Demanda é pico e não acumula: não há aviso anual. */
        year: ((percent: string) => string) | null
        /** Complemento do nome do aviso, para distinguir as metas da mesma propriedade. */
        nameSuffix: string
    }
> = {
    KWH: {
        month: (percent) => `o consumo do mês atingiu ${percent}% da meta do mês`,
        year: (percent) => `o consumo acumulado do ano atingiu ${percent}% da meta anual`,
        nameSuffix: "",
    },
    BRL: {
        month: (percent) => `o custo do mês atingiu ${percent}% da meta de custo do mês`,
        year: (percent) => `o custo acumulado do ano atingiu ${percent}% da meta de custo anual`,
        nameSuffix: " · R$",
    },
    KW: {
        month: (percent) => `a demanda medida do mês atingiu ${percent}% da meta de demanda do mês`,
        year: null,
        nameSuffix: " · kW",
    },
}

const formatPercent = (percent: number): string =>
    percent.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export class GoalAlertScheduler {
    private firstTickTimer: ReturnType<typeof setTimeout> | null = null
    private timer: ReturnType<typeof setInterval> | null = null
    private running = false

    /**
     * @param goalRepository - Metas pendentes e reivindicação dos avisos.
     * @param consumptionReader - Consumo mensal do medidor de cada propriedade.
     * @param userEventHub - Entrega o aviso em tempo real ao dono, se conectado.
     * @param notificationStore - Guarda o aviso para o sino de notificações.
     */
    constructor(
        private readonly goalRepository: GoalRepository,
        private readonly consumptionReader: GoalConsumptionReader,
        private readonly userEventHub: UserEventHub,
        private readonly notificationStore: NotificationStore,
    ) {}

    /** Inicia o avaliador: a primeira passada um minuto depois do boot, e então a cada 15 minutos. */
    start(): void {
        this.firstTickTimer = setTimeout(() => {
            void this.tick()
            this.timer = setInterval(() => {
                void this.tick()
            }, INTERVAL_MS)
        }, FIRST_TICK_DELAY_MS)
        log.info("Iniciado. O alerta de meta roda a cada 15 minutos.")
    }

    /** Para o avaliador — usado no encerramento do servidor. */
    stop(): void {
        if (this.firstTickTimer) {
            clearTimeout(this.firstTickTimer)
            this.firstTickTimer = null
        }
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = null
        }
        log.info("Parado.")
    }

    /**
     * Uma passada: avalia as metas do ano corrente que ainda têm aviso a dar.
     * Nunca rejeita — quem dispara não espera a promise, e uma rejeição solta
     * derrubaria o processo. Uma falha é registrada e a passada seguinte tenta
     * de novo; a falha de uma propriedade não impede as demais.
     *
     * @param now - Instante de referência (injetável para teste).
     */
    async tick(now: Date = new Date()): Promise<void> {
        // Uma passada lenta não se sobrepõe à seguinte.
        if (this.running) return
        this.running = true
        try {
            await this.evaluate(now)
        } catch (err) {
            log.error(
                { err },
                "Falha ao avaliar os alertas de meta — tenta de novo na próxima passada",
            )
        } finally {
            this.running = false
        }
    }

    private async evaluate(now: Date): Promise<void> {
        const local = toSaoPauloLocal(now)
        const year = local.getUTCFullYear()
        const month = local.getUTCMonth() + 1

        const goals = await this.goalRepository.findPendingAlertGoals(year, month)
        // Uma leitura por propriedade e unidade: a meta em kWh e a em R$ da mesma
        // propriedade leem o realizado de fontes diferentes.
        const bySource = new Map<string, GoalWithProperty[]>()
        for (const goal of goals) {
            const key = `${goal.propertyId}:${goal.unit}`
            bySource.set(key, [...(bySource.get(key) ?? []), goal])
        }

        // Um grupo de cada vez: o custo em R$ roda várias consultas por mês, e
        // o avaliador não tem pressa — não deve disputar o pool com as requisições.
        for (const group of bySource.values()) {
            try {
                await this.evaluateGroup(group, year, month, now)
            } catch (err) {
                log.error(
                    { propertyId: group[0]?.propertyId, err },
                    "Falha ao avaliar as metas de uma propriedade — seguindo para as demais",
                )
            }
        }
    }

    // Metas da mesma propriedade e unidade: mesmo dono e mesma fonte de realizado.
    private async evaluateGroup(
        goals: GoalWithProperty[],
        year: number,
        month: number,
        now: Date,
    ): Promise<void> {
        const first = goals[0]
        if (!first) return
        const monthly = await this.consumptionReader.monthlyValues(
            first.userId,
            first.propertyId,
            year,
            first.unit,
            now,
        )
        for (const goal of goals) {
            await this.evaluateGoal(goal, monthly, month, now)
        }
    }

    private async evaluateGoal(
        goal: GoalWithProperty,
        monthly: MonthlyValues,
        month: number,
        now: Date,
    ): Promise<void> {
        const progress = computeGoalProgress({
            year: goal.year,
            unit: goal.unit,
            monthlyTargets: goal.monthlyTargets,
            realizedByMonth: monthly.forYear(goal.year),
            now,
        })
        const state = computeGoalAlertState(progress, goal.alertPercent, now, goal.unit)

        if (
            state.month.reached &&
            state.month.percent !== null &&
            goal.alertNotifiedMonth !== month &&
            (await this.goalRepository.claimMonthAlert(goal, month))
        ) {
            this.notify(goal, `${WORDING[goal.unit].month(formatPercent(state.month.percent))}`)
        }

        const yearWording = WORDING[goal.unit].year
        if (
            yearWording &&
            state.year.reached &&
            state.year.percent !== null &&
            !goal.alertNotifiedYear &&
            (await this.goalRepository.claimYearAlert(goal))
        ) {
            this.notify(goal, yearWording(formatPercent(state.year.percent)))
        }
    }

    private notify(goal: GoalWithProperty, what: string): void {
        const notification = this.notificationStore.add(goal.userId, {
            alertId: goal.id,
            alertName: `Meta ${goal.year} · ${goal.property.name}${WORDING[goal.unit].nameSuffix}`,
            meterId: null,
            targetType: "PROPERTY",
            targetPath: goalsPath(goal.propertyId),
            message: `Meta de ${goal.year} (${goal.property.name}): ${what}.`,
        })
        this.userEventHub.emit(goal.userId, "notification", notification)
    }
}
