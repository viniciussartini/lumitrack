import { randomBytes } from "crypto"
import type { Role } from "@/generated/prisma/client.js"

export interface StreamTicketPayload {
    userId: string
    email: string
    userType: string
    role: Role
    isDemo: boolean
    authToken: string
}

const TICKET_TTL_MS = 30_000

interface TicketEntry extends StreamTicketPayload {
    expiresAt: number
}

/**
 * Ticket de vida curta e uso único para autenticar o stream SSE quando ele
 * precisa ser aberto cross-origin (demo pública): o cookie de sessão nunca
 * chega nesse cenário, porque foi definido pelo navegador para o domínio do
 * site estático (lumitrack.onrender.com), não para o da API
 * (lumitrack-api.onrender.com) — `SameSite:"none"` não muda isso, é um
 * problema de domínio do cookie, não de política cross-site.
 * `Domain=.onrender.com` também não resolve: onrender.com está na lista de
 * sufixos públicos, o navegador rejeita esse cookie.
 *
 * O cliente busca um ticket autenticado normalmente (cookie same-origin,
 * via POST /api/iot/stream-ticket, atravessando o rewrite) e troca
 * imediatamente pela conexão SSE, cross-origin, sem depender de cookie
 * nenhum nesse segundo passo.
 */
export class SseTicketService {
    private readonly tickets = new Map<string, TicketEntry>()

    /**
     * Emite um ticket de vida curta e uso único, vinculado ao payload de
     * identidade informado.
     *
     * @param payload - Identidade e credenciais a associar ao ticket.
     * @returns Ticket opaco a ser trocado pela conexão SSE.
     */
    issue(payload: StreamTicketPayload): string {
        this.sweepExpired()
        const ticket = randomBytes(32).toString("hex")
        this.tickets.set(ticket, { ...payload, expiresAt: Date.now() + TICKET_TTL_MS })
        return ticket
    }

    /**
     * Consome um ticket — uso único: removido no mesmo passo em que é lido,
     * mesmo se inválido — nunca reutilizável, nem repetindo o mesmo valor
     * por engano.
     *
     * @param ticket - Ticket emitido por {@link issue}.
     * @returns Payload de identidade associado, ou `null` se o ticket for inválido, expirado ou já consumido.
     */
    consume(ticket: string): StreamTicketPayload | null {
        const entry = this.tickets.get(ticket)
        this.tickets.delete(ticket)
        if (!entry) return null
        if (entry.expiresAt < Date.now()) return null

        const { expiresAt: _expiresAt, ...payload } = entry
        return payload
    }

    private sweepExpired(): void {
        const now = Date.now()
        for (const [key, entry] of this.tickets) {
            if (entry.expiresAt < now) this.tickets.delete(key)
        }
    }
}
