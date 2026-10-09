import { PrismaClient } from "@/generated/prisma/client.js"

/** Um token vigente como a listagem de sessões o enxerga, sem o valor nem o hash. */
export interface ActiveSessionToken {
    sessionId: string
    channel: "WEB" | "MOBILE"
    deviceLabel: string | null
    origin: string | null
    issuedAt: Date
}

// Teto de linhas lidas por canal: uma conta com mais sessões vivas que isso
// não é uso normal, e a lista não precisa mostrá-las todas.
const MAX_ROWS_PER_CHANNEL = 100

/** Registro de sessão para a exportação do titular, vigente ou não, sem token, hash nem ids. */
export interface ExportedSession {
    channel: "WEB" | "MOBILE"
    deviceLabel: string | null
    origin: string | null
    createdAt: Date
    expiresAt: Date | null
    revokedAt: Date | null
}

/** Acesso aos tokens vigentes de um usuário, base da lista de sessões ativas. */
export class SessionRepository {
    /** @param prisma - Cliente Prisma usado para todas as queries do módulo. */
    constructor(private readonly prisma: PrismaClient) {}

    /**
     * Refresh tokens vigentes (não revogados e não expirados) do usuário — uma
     * sessão web é o refresh token vigente da cadeia. Mais recentes primeiro.
     *
     * @param userId - Dono das sessões; sempre o usuário autenticado.
     * @param now - Instante de referência para a expiração.
     * @returns Os tokens vigentes, sem o valor nem o hash.
     */
    async findActiveWeb(userId: string, now: Date): Promise<ActiveSessionToken[]> {
        const rows = await this.prisma.refreshToken.findMany({
            where: { userId, revokedAt: null, expiresAt: { gt: now } },
            select: { sessionId: true, deviceLabel: true, origin: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: MAX_ROWS_PER_CHANNEL,
        })
        return rows.map(({ createdAt, ...row }) => ({
            ...row,
            channel: "WEB",
            issuedAt: createdAt,
        }))
    }

    /**
     * Tokens mobile vigentes do usuário — o mobile não tem refresh, então a
     * sessão é o próprio token de acesso. Mais recentes primeiro.
     *
     * @param userId - Dono das sessões; sempre o usuário autenticado.
     * @param now - Instante de referência para a expiração.
     * @returns Os tokens vigentes, sem o valor nem o hash.
     */
    async findActiveMobile(userId: string, now: Date): Promise<ActiveSessionToken[]> {
        const rows = await this.prisma.authToken.findMany({
            where: {
                userId,
                channel: "MOBILE",
                revokedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            select: { sessionId: true, deviceLabel: true, origin: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: MAX_ROWS_PER_CHANNEL,
        })
        return rows.map(({ createdAt, ...row }) => ({
            ...row,
            channel: "MOBILE",
            issuedAt: createdAt,
        }))
    }

    /**
     * Todos os registros de sessão que o titular tem guardados, vigentes ou
     * não (ainda não expurgados) — a parte de sessões da exportação dos dados
     * pessoais. Web vem do refresh token, mobile do token de acesso. Mais
     * recentes primeiro.
     *
     * @param userId - Titular dos dados.
     * @returns Os registros, sem token, hash nem ids.
     */
    async findAllForExport(userId: string): Promise<ExportedSession[]> {
        const select = {
            deviceLabel: true,
            origin: true,
            createdAt: true,
            expiresAt: true,
            revokedAt: true,
        } as const
        const [web, mobile] = await Promise.all([
            this.prisma.refreshToken.findMany({ where: { userId }, select }),
            this.prisma.authToken.findMany({ where: { userId, channel: "MOBILE" }, select }),
        ])
        const withChannel =
            (channel: ExportedSession["channel"]) =>
            (row: Omit<ExportedSession, "channel">): ExportedSession => ({ ...row, channel })
        return [...web.map(withChannel("WEB")), ...mobile.map(withChannel("MOBILE"))].sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
        )
    }
}
