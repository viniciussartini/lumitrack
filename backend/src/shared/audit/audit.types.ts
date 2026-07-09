// Literal unions (não importadas do client Prisma gerado) — mesmo padrão já
// usado para `TokenChannel` ("WEB" | "MOBILE") no módulo de auth: mantém o
// código da aplicação desacoplado dos tipos internos gerados.
export type AuditAction =
    | "LOGIN"
    | "LOGOUT"
    | "ACCESS_DENIED"
    | "USER_CREATE"
    | "USER_UPDATE"
    | "USER_DELETE"
    | "PROPERTY_CREATE"
    | "PROPERTY_UPDATE"
    | "PROPERTY_DELETE"
    | "DATA_EXPORT"
    | "MFA_ENABLED"
    | "MFA_DISABLED"
    | "REFRESH_TOKEN_REUSE_DETECTED"
    | "ADMIN_AUDIT_LOG_VIEW"

export type AuditOutcome = "SUCCESS" | "FAILURE"

export interface AuditEntryInput {
    userId?: string | null
    action: AuditAction
    outcome: AuditOutcome
    resourceType?: string | null
    resourceId?: string | null
    ipAddress?: string | null
    userAgent?: string | null
    // Contexto adicional não-sensível (ex.: nomes de campos alterados,
    // e-mail tentado num login que falhou). Nunca valores sensíveis como
    // senha, CPF/CNPJ ou o conteúdo de um campo alterado.
    metadata?: Record<string, unknown> | null
}
