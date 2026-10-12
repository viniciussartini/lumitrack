import type { UserRepository, UserWithoutPassword } from "@/modules/user/user.repository.js"
import type {
    PropertyRepository,
    PropertyResponse,
} from "@/modules/property/property.repository.js"
import type {
    DistributorRepository,
    DistributorResponse,
} from "@/modules/distributor/distributor.repository.js"
import type { AlertRepository, AlertResponse } from "@/modules/alert/alert.repository.js"
import type {
    DemandAlertRepository,
    DemandAlertResponse,
} from "@/modules/demand-alert/demand-alert.repository.js"
import type {
    AclContractRepository,
    AclContractResponse,
} from "@/modules/acl-contract/acl-contract.repository.js"
import type { AreaRepository, AreaResponse } from "@/modules/area/area.repository.js"
import type { DeviceRepository, DeviceResponse } from "@/modules/device/device.repository.js"
import type { ReportRepository, ReportResponse } from "@/modules/report/report.repository.js"
import {
    toPublicGoal,
    type GoalPublicRecord,
    type GoalRepository,
} from "@/modules/goal/goal.repository.js"
import type {
    ReportScheduleRecord,
    ReportScheduleRepository,
} from "@/modules/report-schedule/report-schedule.repository.js"
import type { SessionRepository } from "@/modules/session/session.repository.js"
import type { ExportedSession } from "@/modules/session/session.types.js"
import type { AuditRepository, AuditLogResponse } from "@/shared/audit/audit.repository.js"
import { NotFoundError } from "@/shared/errors/AppError.js"
import { DEMO_ACCOUNT_EMAILS } from "@/shared/config/demoAccounts.js"
import { buildDemoAuditLogs, buildDemoExportedSessions } from "@/modules/export/export-demo.js"

/** Janela do log de auditoria exportado, em meses a contar de agora. */
export const AUDIT_LOG_WINDOW_MONTHS = 12

/** Teto de registros de auditoria exportados; sobram os mais recentes. */
export const AUDIT_LOG_MAX_ROWS = 5000

// Payload agregado com todos os dados pessoais que o LumiTrack guarda sobre
// o titular (Art. 18 LGPD).
//
// O histórico de consumo (antigo `consumptionRecords`, baseado em
// ConsumptionRecord) foi removido daqui — esse modelo não existe mais. A
// exportação de consumo agregado via MeterReading ainda não foi incluída
// aqui, apesar do TariffService já existir — fica para quando entrar no
// escopo do export.
//
// `distributors` não vem de `findAllByUser` — a distribuidora é um
// catálogo global sem dono. Aqui buscamos só as distribuidoras
// efetivamente vinculadas às propriedades do titular (via `findAllByIds`),
// que é a informação que de fato compõe o dado pessoal exportado (a
// propriedade aponta pra elas).
export type DataExportPayload = {
    generatedAt: Date
    user: UserWithoutPassword
    properties: PropertyResponse[]
    distributors: DistributorResponse[]
    areas: AreaResponse[]
    devices: DeviceResponse[]
    alerts: AlertResponse[]
    demandAlerts: DemandAlertResponse[]
    aclContracts: AclContractResponse[]
    // Só os metadados dos relatórios emitidos — os arquivos (bytes) não vão no
    // payload; ficam disponíveis para download enquanto durar a retenção.
    reports: ReportResponse[]
    // Configurações de envio automático, com os e-mails de destinatários — dado
    // pessoal de terceiros que o titular informou.
    reportSchedules: Omit<ReportScheduleRecord, "userId">[]
    // Metas anuais de consumo definidas pelo titular, por propriedade.
    goals: GoalPublicRecord[]
    // Sessões guardadas (vigentes ou não expurgadas): canal, dispositivo
    // reduzido e IP mascarado — nunca o token, o hash, o user-agent nem o IP.
    sessions: ExportedSession[]
    // O log de auditoria cobre só `AUDIT_LOG_WINDOW_MONTHS` meses (a partir de
    // `auditLogsSince`) e, no máximo, `AUDIT_LOG_MAX_ROWS` registros.
    auditLogsSince: Date
    auditLogs: AuditLogResponse[]
}

/**
 * Agrega, num único payload, todos os dados pessoais que o LumiTrack guarda
 * sobre um titular (Art. 18 LGPD), para exportação em JSON ou PDF.
 */
export class ExportService {
    /**
     * @param userRepository - Dados cadastrais do titular.
     * @param propertyRepository - Propriedades do titular.
     * @param distributorRepository - Catálogo de distribuidoras, para resolver as vinculadas às propriedades do titular.
     * @param alertRepository - Alertas configurados pelo titular.
     * @param demandAlertRepository - Alertas de ultrapassagem de demanda configurados pelo titular.
     * @param aclContractRepository - Contratos de energia do Mercado Livre (ACL) configurados pelo titular.
     * @param areaRepository - Áreas das propriedades do titular.
     * @param deviceRepository - Dispositivos das áreas do titular.
     * @param auditRepository - Trilha de auditoria de acesso a dados do titular.
     * @param reportRepository - Relatórios emitidos pelo titular (metadados).
     * @param reportScheduleRepository - Configurações de envio automático de relatório do titular.
     * @param goalRepository - Metas anuais de consumo do titular.
     * @param sessionRepository - Sessões (dispositivo e origem) guardadas para o titular.
     */
    constructor(
        private readonly userRepository: UserRepository,
        private readonly propertyRepository: PropertyRepository,
        private readonly distributorRepository: DistributorRepository,
        private readonly alertRepository: AlertRepository,
        private readonly demandAlertRepository: DemandAlertRepository,
        private readonly aclContractRepository: AclContractRepository,
        private readonly areaRepository: AreaRepository,
        private readonly deviceRepository: DeviceRepository,
        private readonly auditRepository: AuditRepository,
        private readonly reportRepository: ReportRepository,
        private readonly reportScheduleRepository: ReportScheduleRepository,
        private readonly goalRepository: GoalRepository,
        private readonly sessionRepository: SessionRepository,
    ) {}

    /**
     * Monta o payload completo de exportação de dados do titular. `userId`
     * vem sempre do middleware `authenticate` (`GET /api/users/me/data-export`,
     * sem `:id` na URL) — não há checagem de ownership a fazer aqui, cada
     * repositório já filtra nativamente por `userId`.
     *
     * @param userId - Id do usuário autenticado (titular dos dados).
     * @returns Payload agregado com todos os dados pessoais do titular.
     */
    async generate(userId: string): Promise<DataExportPayload> {
        const user = await this.userRepository.findById(userId)
        if (!user) {
            throw new NotFoundError("Usuário não encontrado")
        }

        const now = new Date()
        const auditLogsSince = new Date(now)
        auditLogsSince.setMonth(auditLogsSince.getMonth() - AUDIT_LOG_WINDOW_MONTHS)

        // Duas levas em vez de um `Promise.all` único: onze consultas de uma vez
        // ocupariam o pool inteiro (10 conexões) para uma única requisição.
        const [properties, alerts, demandAlerts, aclContracts, areas, devices] = await Promise.all([
            this.propertyRepository.findAllByUser(userId),
            this.alertRepository.findAllByUser(userId),
            this.demandAlertRepository.findAllByUser(userId),
            this.aclContractRepository.findAllByUser(userId),
            this.areaRepository.findAllByUser(userId),
            this.deviceRepository.findAllByUser(userId),
        ])
        const [reports, reportSchedules, goals] = await Promise.all([
            this.reportRepository.findAllMetadataByUser(userId),
            this.reportScheduleRepository.findAllByUser(userId),
            this.goalRepository.findAllByUser(userId),
        ])

        // A conta de demonstração é compartilhada entre visitantes: o log de
        // auditoria e os tokens dela guardam IP e dispositivo de terceiros, então
        // recebe conteúdo fixo e nunca os consulta.
        const [sessions, auditLogs] = DEMO_ACCOUNT_EMAILS.has(user.email)
            ? [buildDemoExportedSessions(now), buildDemoAuditLogs(userId, now)]
            : await Promise.all([
                  this.sessionRepository.findAllForExport(userId, now),
                  this.auditRepository.findByUserId(userId, {
                      since: auditLogsSince,
                      limit: AUDIT_LOG_MAX_ROWS,
                  }),
              ])

        const distributorIds = [...new Set(properties.map((p) => p.distributorId))]
        const distributors = await this.distributorRepository.findAllByIds(distributorIds)

        return {
            generatedAt: now,
            user,
            properties,
            distributors,
            areas,
            devices,
            alerts,
            demandAlerts,
            aclContracts,
            reports,
            reportSchedules: reportSchedules.map(({ userId: _owner, ...rest }) => rest),
            goals: goals.map(toPublicGoal),
            sessions,
            auditLogsSince,
            auditLogs,
        }
    }
}
