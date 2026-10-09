import type { ExportedSession } from "@/modules/session/session.types.js"

/** Um token guardado (refresh web ou acesso mobile) com o id da sessão a que pertence. */
export interface StoredSessionToken extends ExportedSession {
    sessionId: string
}

const latest = (a: Date, b: Date): Date => (a.getTime() >= b.getTime() ? a : b)

const summarize = (tokens: StoredSessionToken[], now: Date): ExportedSession => {
    const byCreation = [...tokens].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    const first = byCreation[0]!
    const newest = byCreation[byCreation.length - 1]!
    const expirations = tokens.flatMap((token) => (token.expiresAt ? [token.expiresAt] : []))
    const isLive = tokens.some(
        (token) => token.revokedAt === null && (!token.expiresAt || token.expiresAt > now),
    )

    return {
        channel: newest.channel,
        deviceLabel: newest.deviceLabel,
        origin: newest.origin,
        createdAt: first.createdAt,
        expiresAt: expirations.length > 0 ? expirations.reduce(latest) : null,
        revokedAt: isLive ? null : newest.revokedAt,
    }
}

/**
 * Reduz os tokens guardados a uma linha por sessão. A rotação do refresh token
 * gera um token por renovação, e listar cada um descreveria renovações como
 * sessões abertas e encerradas. A sessão começa no primeiro token, mostra o
 * dispositivo e a origem do mais recente e só consta como encerrada quando
 * nenhum token seu segue vigente e o último foi revogado.
 *
 * @param tokens - Tokens do titular, vigentes ou não.
 * @param now - Instante de referência para a expiração.
 * @returns Uma entrada por sessão, da mais recente para a mais antiga.
 */
export const groupSessionsForExport = (
    tokens: StoredSessionToken[],
    now: Date,
): ExportedSession[] => {
    const bySession = new Map<string, StoredSessionToken[]>()
    for (const token of tokens) {
        bySession.set(token.sessionId, [...(bySession.get(token.sessionId) ?? []), token])
    }

    return [...bySession.values()]
        .map((group) => summarize(group, now))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}
