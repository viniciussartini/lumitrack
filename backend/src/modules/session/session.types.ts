/** Sessão como a API a devolve: sem token, hash nem id de usuário. */
export interface SessionItem {
    /** Id da sessão (não é o de nenhum token). */
    id: string
    channel: "WEB" | "MOBILE"
    /** Navegador e sistema (`Chrome · Windows`); `null` em sessão aberta antes do registro. */
    deviceLabel: string | null
    /** IP mascarado (`189.45.xx.xx`); `null` em sessão aberta antes do registro. */
    origin: string | null
    /** Emissão do token vigente: o último refresh na web, o login no mobile. */
    lastAccessAt: string
    isCurrent: boolean
}

/** Sessão na exportação do titular, vigente ou não, sem token, hash nem ids. */
export interface ExportedSession {
    channel: "WEB" | "MOBILE"
    deviceLabel: string | null
    origin: string | null
    createdAt: Date
    expiresAt: Date | null
    revokedAt: Date | null
}
