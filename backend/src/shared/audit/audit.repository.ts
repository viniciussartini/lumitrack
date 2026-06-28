import { PrismaClient, Prisma } from "@/generated/prisma/client.js"
import type { AuditEntryInput } from "@/shared/audit/audit.types.js"

type PrismaAuditLog = NonNullable<
    Awaited<ReturnType<PrismaClient["auditLog"]["findUnique"]>>
>

export type AuditLogResponse = PrismaAuditLog

export class AuditRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async create(entry: AuditEntryInput): Promise<void> {
        await this.prisma.auditLog.create({
            data: {
                userId: entry.userId ?? null,
                action: entry.action,
                outcome: entry.outcome,
                resourceType: entry.resourceType ?? null,
                resourceId: entry.resourceId ?? null,
                ipAddress: entry.ipAddress ?? null,
                userAgent: entry.userAgent ?? null,
                ...(entry.metadata ? { metadata: entry.metadata as Prisma.InputJsonValue } : {}),
            },
        })
    }

    // Usado pela exportação de dados do titular (#09 — Art. 18 LGPD): o
    // próprio audit log é dado pessoal do titular, sobre ele.
    async findByUserId(userId: string): Promise<AuditLogResponse[]> {
        return this.prisma.auditLog.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
        })
    }

    // #10 — Retenção e expurgo (Art. 15/16 LGPD): mantém os registros por
    // DATA_RETENTION_AUDIT_LOG_DAYS (default ~2 anos) — equilíbrio entre o
    // Art. 48 (capacidade de reconstruir incidentes) e o princípio de
    // minimização do Art. 15/16 (não guardar dados além do necessário).
    // Remoção completa (não anonimização) — decisão registrada com o usuário.
    async deleteOlderThan(threshold: Date): Promise<number> {
        const result = await this.prisma.auditLog.deleteMany({
            where: { createdAt: { lt: threshold } },
        })
        return result.count
    }
}
