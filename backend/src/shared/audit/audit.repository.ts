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
}
