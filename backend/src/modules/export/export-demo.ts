import { buildDemoSessions } from "@/modules/session/session-demo.js"
import type { ExportedSession } from "@/modules/session/session.types.js"
import type { AuditLogResponse } from "@/shared/audit/audit.repository.js"

const DAY_MS = 24 * 60 * 60 * 1000
const SESSION_LIFETIME_MS = 90 * DAY_MS

/**
 * Sessões fixas e representativas para a exportação da conta de demonstração.
 * A conta é compartilhada entre visitantes, então as sessões reais seriam de
 * terceiros; reaproveita a lista da tela de sessões para as duas mostrarem o
 * mesmo conteúdo.
 *
 * @param now - Instante de referência dos últimos acessos.
 * @returns Uma entrada por sessão fictícia, sem token nem id real.
 */
export const buildDemoExportedSessions = (now: Date): ExportedSession[] =>
    buildDemoSessions(now).map((session) => {
        const createdAt = new Date(session.lastAccessAt)
        return {
            channel: session.channel,
            deviceLabel: session.deviceLabel,
            origin: session.origin,
            createdAt,
            expiresAt: new Date(createdAt.getTime() + SESSION_LIFETIME_MS),
            revokedAt: null,
        }
    })

/**
 * Registros de auditoria fixos para a exportação da conta de demonstração. O
 * log real da conta guarda IP e user-agent dos visitantes, que não são do
 * titular que pede a exportação; aqui o IP e o user-agent ficam sempre nulos.
 *
 * @param userId - Id da conta de demonstração, só para preencher o registro.
 * @param now - Instante de referência dos registros.
 * @returns Registros fictícios, do mais recente para o mais antigo.
 */
export const buildDemoAuditLogs = (userId: string, now: Date): AuditLogResponse[] =>
    (["LOGIN", "DATA_EXPORT"] as const).map((action, index) => ({
        id: `demo-audit-${action.toLowerCase()}`,
        userId,
        action,
        outcome: "SUCCESS",
        resourceType: "User",
        resourceId: userId,
        ipAddress: null,
        userAgent: null,
        metadata: null,
        createdAt: new Date(now.getTime() - index * DAY_MS),
    }))
