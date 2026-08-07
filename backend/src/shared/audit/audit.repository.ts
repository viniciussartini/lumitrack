import { PrismaClient, Prisma } from "@/generated/prisma/client.js"
import type { AuditAction, AuditEntryInput, AuditOutcome } from "@/shared/audit/audit.types.js"

type PrismaAuditLog = NonNullable<Awaited<ReturnType<PrismaClient["auditLog"]["findUnique"]>>>

export type AuditLogResponse = PrismaAuditLog

// Filtros do endpoint administrativo de consulta do audit log (#16 — A09/
// Art. 48). Todos opcionais — nenhum filtro aplicado retorna tudo (paginado).
export type AuditLogFilters = {
    userId?: string
    action?: AuditAction
    outcome?: AuditOutcome
    resourceType?: string
    resourceId?: string
    from?: Date
    to?: Date
}

export type PaginatedAuditLogs = {
    items: AuditLogResponse[]
    total: number
    page: number
    pageSize: number
}

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

    // Endpoint administrativo de consulta do audit log (#16 — A09/Art. 48).
    // Único ponto do repository com filtros arbitrários + paginação — os
    // demais métodos são consultas fixas (findByUserId) ou de manutenção
    // (deleteOlderThan).
    async findMany(
        filters: AuditLogFilters,
        page: number,
        pageSize: number,
    ): Promise<PaginatedAuditLogs> {
        const where: Prisma.AuditLogWhereInput = {
            ...(filters.userId && { userId: filters.userId }),
            ...(filters.action && { action: filters.action }),
            ...(filters.outcome && { outcome: filters.outcome }),
            ...(filters.resourceType && { resourceType: filters.resourceType }),
            ...(filters.resourceId && { resourceId: filters.resourceId }),
            ...((filters.from || filters.to) && {
                createdAt: {
                    ...(filters.from && { gte: filters.from }),
                    ...(filters.to && { lte: filters.to }),
                },
            }),
        }

        const [items, total] = await Promise.all([
            this.prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.auditLog.count({ where }),
        ])

        return { items, total, page, pageSize }
    }
}
