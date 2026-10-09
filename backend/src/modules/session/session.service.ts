import type { ActiveSessionToken, SessionRepository } from "@/modules/session/session.repository.js"
import { buildDemoSessions } from "@/modules/session/session-demo.js"
import type { SessionItem } from "@/modules/session/session.types.js"

/** Quem pede a lista: o usuário, a sessão do token dele e se a conta é de demonstração. */
export interface SessionViewer {
    userId: string
    sessionId: string
    isDemo: boolean
}

/** Lista as sessões ativas do próprio usuário (web e mobile). */
export class SessionService {
    /**
     * @param repository - Acesso aos tokens vigentes.
     * @param now - Relógio, injetável nos testes.
     */
    constructor(
        private readonly repository: SessionRepository,
        private readonly now: () => Date = () => new Date(),
    ) {}

    /**
     * Sessões vigentes do usuário: web (refresh token vigente) e mobile (token
     * vigente), uma por `sessionId`. A atual vem primeiro e as outras da mais
     * recente para a mais antiga. A conta de demonstração é compartilhada entre
     * visitantes, então recebe uma lista fixa em vez das sessões reais.
     *
     * @param viewer - O usuário autenticado e a sessão do token dele.
     * @returns As sessões, sem token nem hash.
     */
    async list(viewer: SessionViewer): Promise<SessionItem[]> {
        const now = this.now()
        if (viewer.isDemo) return buildDemoSessions(now)

        const [web, mobile] = await Promise.all([
            this.repository.findActiveWeb(viewer.userId, now),
            this.repository.findActiveMobile(viewer.userId, now),
        ])

        return latestPerSession([...web, ...mobile])
            .map((token) => toItem(token, viewer.sessionId))
            .sort(byCurrentThenRecent)
    }
}

// Um refresh paralelo (janela de graça) e a rotação deixam mais de um token
// vigente na mesma sessão: vale o mais recente.
const latestPerSession = (tokens: ActiveSessionToken[]): ActiveSessionToken[] => {
    const bySession = new Map<string, ActiveSessionToken>()
    for (const token of tokens) {
        const kept = bySession.get(token.sessionId)
        if (!kept || token.issuedAt > kept.issuedAt) bySession.set(token.sessionId, token)
    }
    return [...bySession.values()]
}

const toItem = (token: ActiveSessionToken, currentSessionId: string): SessionItem => ({
    id: token.sessionId,
    channel: token.channel,
    deviceLabel: token.deviceLabel,
    origin: token.origin,
    lastAccessAt: token.issuedAt.toISOString(),
    isCurrent: token.sessionId === currentSessionId,
})

const byCurrentThenRecent = (a: SessionItem, b: SessionItem): number => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1
    return Date.parse(b.lastAccessAt) - Date.parse(a.lastAccessAt)
}
