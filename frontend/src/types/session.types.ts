import type { TokenChannel } from "@/types/auth.types"

/** Uma sessão ativa da conta, em `GET /api/sessions`. Nunca traz token nem hash. */
export interface Session {
    /** Id da sessão (não é o de nenhum token). */
    id: string
    channel: TokenChannel
    /** Navegador e sistema ("Chrome · Windows"); nulo em sessão aberta antes do registro. */
    deviceLabel: string | null
    /** IP mascarado ("189.45.xx.xx"); nulo em sessão aberta antes do registro. */
    origin: string | null
    /** Último acesso (ISO): o último refresh na web, o login no mobile. */
    lastAccessAt: string
    /** A sessão de quem está vendo a lista. */
    isCurrent: boolean
}
