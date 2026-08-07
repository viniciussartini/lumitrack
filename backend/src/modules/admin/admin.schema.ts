import { z } from "zod"

// Mesmos valores do enum AuditAction/AuditOutcome (literal unions em
// shared/audit/audit.types.ts) — repetidos aqui como z.enum porque o zod não
// deriva enums a partir de literal unions do TypeScript.
const auditActionValues = [
    "LOGIN",
    "LOGOUT",
    "ACCESS_DENIED",
    "USER_CREATE",
    "USER_UPDATE",
    "USER_DELETE",
    "PROPERTY_CREATE",
    "PROPERTY_UPDATE",
    "PROPERTY_DELETE",
    "DATA_EXPORT",
    "MFA_ENABLED",
    "MFA_DISABLED",
    "REFRESH_TOKEN_REUSE_DETECTED",
    "ADMIN_AUDIT_LOG_VIEW",
] as const

const auditOutcomeValues = ["SUCCESS", "FAILURE"] as const

// Mesmo padrão de data de consumption.schema.ts — aceita datetime com offset
// ou apenas a data (YYYY-MM-DD), sempre coagido para Date.
const isoDate = z.iso.datetime({ offset: true }).or(z.iso.date()).pipe(z.coerce.date())

// Query params do endpoint administrativo de consulta do audit log
// (A09/Art. 48). Todos os filtros são opcionais — sem nenhum, retorna
// tudo, paginado.
export const auditLogQuerySchema = z.object({
    userId: z.uuid({ message: "userId inválido" }).optional(),
    action: z.enum(auditActionValues).optional(),
    outcome: z.enum(auditOutcomeValues).optional(),
    resourceType: z.string().min(1).optional(),
    resourceId: z.string().min(1).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    // Teto de 200 — evita que uma página excessivamente grande vire uma
    // forma de exfiltração/abuso do endpoint administrativo.
    pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
})

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>
