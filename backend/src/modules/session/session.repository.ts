import { PrismaClient } from "@/generated/prisma/client.js"
import type { ExportedSession } from "@/modules/session/session.types.js"
import {
    groupSessionsForExport,
    type StoredSessionToken,
} from "@/modules/session/session-export.js"

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

// Token de acesso vigente: não revogado e sem expiração ou com expiração futura.
const LIVE_ACCESS_TOKEN = (now: Date) => ({
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
})

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
     * As sessões que o titular tem guardadas, vigentes ou não (ainda não
     * expurgadas) — a parte de sessões da exportação dos dados pessoais. Web
     * vem do refresh token, mobile do token de acesso; os tokens da mesma
     * sessão viram uma entrada só. Mais recentes primeiro.
     *
     * @param userId - Titular dos dados.
     * @param now - Instante de referência para a expiração.
     * @returns Uma entrada por sessão, sem token, hash nem ids.
     */
    async findAllForExport(userId: string, now: Date = new Date()): Promise<ExportedSession[]> {
        const select = {
            sessionId: true,
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
            (row: Omit<StoredSessionToken, "channel">): StoredSessionToken => ({ ...row, channel })
        return groupSessionsForExport(
            [...web.map(withChannel("WEB")), ...mobile.map(withChannel("MOBILE"))],
            now,
        )
    }

    /**
     * Revoga todos os tokens vigentes de uma sessão — o refresh token e os JWTs
     * de acesso, inclusive os anteriores às renovações, que valeriam até 1 h —,
     * para ela falhar já na próxima chamada. Só toca em token do dono e ainda
     * vigente, então o resultado diz o que de fato foi revogado: zero é sessão
     * inexistente, de outro usuário ou já encerrada, e dois pedidos
     * simultâneos não revogam duas vezes.
     *
     * @param userId - Dono da sessão; sempre o usuário autenticado.
     * @param sessionId - Sessão a encerrar.
     * @param now - Instante de referência para a expiração.
     * @returns Quantos tokens foram revogados.
     */
    async revokeSession(userId: string, sessionId: string, now: Date): Promise<number> {
        return this.revokeSessions(userId, [sessionId], now)
    }

    /**
     * Encerra todas as sessões vigentes do usuário, menos a informada.
     *
     * @param userId - Dono das sessões; sempre o usuário autenticado.
     * @param currentSessionId - Sessão que permanece.
     * @param now - Instante de referência para a expiração.
     * @returns Quantas sessões foram encerradas.
     */
    async revokeOthers(userId: string, currentSessionId: string, now: Date): Promise<number> {
        const others = { userId, sessionId: { not: currentSessionId } }
        const [web, mobile] = await Promise.all([
            this.prisma.refreshToken.findMany({
                where: { ...others, revokedAt: null, expiresAt: { gt: now } },
                select: { sessionId: true },
            }),
            this.prisma.authToken.findMany({
                where: { ...others, channel: "MOBILE", ...LIVE_ACCESS_TOKEN(now) },
                select: { sessionId: true },
            }),
        ])
        const sessionIds = [...new Set([...web, ...mobile].map((row) => row.sessionId))]
        await this.revokeSessions(userId, sessionIds, now)
        return sessionIds.length
    }

    private async revokeSessions(userId: string, sessionIds: string[], now: Date): Promise<number> {
        if (sessionIds.length === 0) return 0
        const owned = { userId, sessionId: { in: sessionIds }, revokedAt: null }
        const data = { revokedAt: new Date() }
        const [refresh, access] = await this.prisma.$transaction([
            this.prisma.refreshToken.updateMany({
                where: { ...owned, expiresAt: { gt: now } },
                data,
            }),
            this.prisma.authToken.updateMany({
                where: { ...owned, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
                data,
            }),
        ])
        return refresh.count + access.count
    }
}
