import type { ReportService } from "@/modules/report/report.service.js"
import { formatPeriodLabel } from "@/modules/report/generators/format.js"
import { computeNextRun } from "@/modules/report-schedule/nextRun.js"
import type {
    ReportScheduleRecord,
    ReportScheduleRepository,
} from "@/modules/report-schedule/report-schedule.repository.js"
import { resolveScheduledReportInput } from "@/modules/report-schedule/scheduledPeriod.js"
import type { AuditService } from "@/shared/audit/audit.service.js"
import { UnsupportedReportTargetError } from "@/modules/report/report.errors.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"
import { logger } from "@/shared/logger/logger.js"

const log = logger.child({ module: "ReportScheduleRunner" })

/** Tentativas de envio por execução antes de descartá-la e seguir para a próxima. */
export const MAX_RUN_ATTEMPTS = 4

/** Mensagem de e-mail de um relatório agendado. */
export interface ScheduledReportEmail {
    recipients: string[]
    reportType: ReportScheduleRecord["type"]
    periodLabel: string
    fileName: string
    contentType: string
    content: Buffer
}

/** Envia o relatório aos destinatários como anexo; lança se nenhum for aceito. */
export type SendScheduledReportEmailFn = (email: ScheduledReportEmail) => Promise<void>

// Só o nome e o código do erro vão para o log: a mensagem de um erro de SMTP
// costuma repetir o endereço do destinatário, que nunca pode ser logado.
function describeError(error: unknown): { errorName: string; errorCode?: string } {
    if (!(error instanceof Error)) return { errorName: "UnknownError" }
    const code = (error as { code?: unknown }).code
    return typeof code === "string"
        ? { errorName: error.name, errorCode: code }
        : { errorName: error.name }
}

/**
 * Executa as configurações de envio vencidas: gera o relatório do período,
 * envia por e-mail, grava no histórico com origem agendada e avança a próxima
 * execução.
 *
 * A próxima execução só avança depois do envio. Assim, uma falha de SMTP ou
 * uma queda do servidor deixa a execução vencida, e a passada seguinte a
 * retoma; reiniciar depois de um envio concluído não repete nada.
 *
 * A garantia é de "pelo menos uma vez, com uma instância só": o e-mail sai
 * antes de a execução ser registrada, então uma falha do banco entre os dois
 * passos, ou duas instâncias vivas ao mesmo tempo, podem repetir um envio. A
 * trava de passada do scheduler cobre a sobreposição dentro do processo.
 */
export class ReportScheduleRunner {
    /**
     * @param scheduleRepository - Configurações e controle de execução.
     * @param reportService - Gera o arquivo, com checagem de posse do alvo.
     * @param sendEmail - Envio do anexo aos destinatários.
     * @param auditService - Registra cada envio concluído.
     * @param now - Relógio injetável, para os testes fixarem "agora".
     */
    constructor(
        private readonly scheduleRepository: ReportScheduleRepository,
        private readonly reportService: Pick<ReportService, "render">,
        private readonly sendEmail: SendScheduledReportEmailFn,
        private readonly auditService: Pick<AuditService, "record">,
        private readonly now: () => Date = () => new Date(),
    ) {}

    /**
     * Uma passada: processa as configurações vencidas, uma de cada vez. A
     * falha de uma não impede as demais.
     */
    async runDue(): Promise<void> {
        const now = this.now()
        for (const schedule of await this.scheduleRepository.findDue(now)) {
            await this.runOne(schedule, now)
        }
    }

    private async runOne(schedule: ReportScheduleRecord, now: Date): Promise<void> {
        const slotAt = schedule.nextRunAt
        if (slotAt === null) return

        try {
            const input = resolveScheduledReportInput(schedule, slotAt)
            const rendered = await this.reportService.render(schedule.userId, input)

            await this.sendEmail({
                recipients: schedule.recipients,
                reportType: schedule.type,
                periodLabel: formatPeriodLabel(rendered.period.from, rendered.period.to),
                fileName: rendered.fileName,
                contentType: rendered.contentType,
                content: rendered.content,
            })

            const recorded = await this.scheduleRepository.completeRun(
                schedule.id,
                slotAt,
                computeNextRun(schedule.frequency, schedule.sendDay, now),
                {
                    userId: schedule.userId,
                    targetType: schedule.targetType,
                    targetId: schedule.targetId,
                    type: schedule.type,
                    format: schedule.format,
                    origin: "SCHEDULED",
                    periodStart: rendered.period.from,
                    periodEnd: rendered.period.to,
                    fileName: rendered.fileName,
                    content: rendered.content,
                },
            )
            if (recorded) await this.auditSend(schedule)
        } catch (error) {
            await this.handleFailure(schedule, slotAt, now, error)
        }
    }

    private async skip(schedule: ReportScheduleRecord, slotAt: Date, now: Date): Promise<void> {
        await this.scheduleRepository.skipRun(
            schedule.id,
            slotAt,
            computeNextRun(schedule.frequency, schedule.sendDay, now),
        )
    }

    private async auditSend(schedule: ReportScheduleRecord): Promise<void> {
        await this.auditService.record({
            userId: schedule.userId,
            action: "REPORT_GENERATE",
            outcome: "SUCCESS",
            resourceType: "ReportSchedule",
            resourceId: schedule.id,
            metadata: {
                type: schedule.type,
                format: schedule.format,
                origin: "SCHEDULED",
                recipientCount: schedule.recipients.length,
            },
        })
    }

    // Há três tipos de falha. Alvo excluído, de outro dono, sem medidor ou que
    // deixou de comportar o tipo (propriedade que saiu do Grupo A) não se
    // resolve sozinho: pausa a configuração. Um relatório que a validação
    // recusa (episódios demais, arquivo acima do teto) falharia igual em
    // todas as tentativas: descarta só esta execução, e a seguinte, de outro
    // período, pode caber. Qualquer outra falha (SMTP, banco) é tentada de
    // novo na próxima passada, até esgotar as tentativas da execução.
    private async handleFailure(
        schedule: ReportScheduleRecord,
        slotAt: Date,
        now: Date,
        error: unknown,
    ): Promise<void> {
        const context = { scheduleId: schedule.id, ...describeError(error) }

        if (
            error instanceof NotFoundError ||
            error instanceof ForbiddenError ||
            error instanceof UnsupportedReportTargetError
        ) {
            await this.scheduleRepository.pause(schedule.id)
            log.warn(context, "Configuração de envio pausada: o alvo não está mais disponível")
            return
        }

        if (error instanceof ValidationError) {
            await this.skip(schedule, slotAt, now)
            log.error(context, "Execução descartada: o relatório não passa na validação")
            return
        }

        const attempts = await this.scheduleRepository.incrementFailedAttempts(schedule.id)
        if (attempts !== null && attempts >= MAX_RUN_ATTEMPTS) {
            await this.skip(schedule, slotAt, now)
            log.error(context, "Envio descartado após esgotar as tentativas")
            return
        }
        log.warn({ ...context, attempts }, "Falha no envio agendado; será tentado de novo")
    }
}
