import { z } from "zod"
import "dotenv/config"

// Schema de validação das variáveis de ambiente.
// Exportado (além de `env`) para permitir teste unitário do schema em
// isolamento, sem depender do `process.exit` disparado abaixo.
export const envSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().default(3333),

    DATABASE_URL: z.url({ message: "DATABASE_URL deve ser uma URL válida" }),

    JWT_SECRET: z.string().min(32, { message: "JWT_SECRET deve ter ao menos 32 caracteres" }),
    JWT_WEB_EXPIRES_IN: z.string().default("15m"),
    // Tokens MOBILE não tinham expiração por tempo (apenas revogação manual
    // via logout) — um token vazado tinha validade indefinida. Agora expiram
    // após um período mais longo que o WEB, adequado a sessões mobile.
    MOBILE_TOKEN_EXPIRES_IN: z.string().default("90d"),

    SMTP_HOST: z.string(),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_SECURE: z.coerce.boolean().default(false),
    SMTP_USER: z.string(),
    SMTP_PASS: z.string(),
    SMTP_FROM: z.string(),

    CORS_ORIGIN: z.string().default("http://localhost:3000"),

    FRONTEND_URL: z.string().default("http://localhost:3000"),

    // Rate limiting — rede de segurança global por IP.
    RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
    RATE_LIMIT_MAX: z.coerce.number().default(1000),

    // Rate limiting estrito para endpoints públicos de autenticação (brute force).
    AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().default(10),

    // Cookies de sessão (canal WEB) — ver #06 da remediação OWASP/LGPD.
    AUTH_COOKIE_NAME: z.string().default("lumitrack_session"),
    CSRF_COOKIE_NAME: z.string().default("lumitrack_csrf"),
    CSRF_HEADER_NAME: z.string().default("x-csrf-token"),

    // Criptografia de CPF/CNPJ em repouso (#07 da remediação OWASP/LGPD).
    // Duas chaves separadas — nunca reutilizar a mesma chave para cifra e MAC.
    // Formato: 64 caracteres hex (32 bytes / 256 bits). Gerar com:
    //   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    CPF_CNPJ_ENCRYPTION_KEY: z
        .string()
        .regex(/^[0-9a-f]{64}$/i, {
            message: "CPF_CNPJ_ENCRYPTION_KEY deve ter 64 caracteres hexadecimais (32 bytes)",
        }),
    CPF_CNPJ_BLIND_INDEX_KEY: z
        .string()
        .regex(/^[0-9a-f]{64}$/i, {
            message: "CPF_CNPJ_BLIND_INDEX_KEY deve ter 64 caracteres hexadecimais (32 bytes)",
        }),
}).refine(
    (data) => !(data.NODE_ENV === "production" && data.CORS_ORIGIN === "*"),
    {
        message: "CORS_ORIGIN não pode ser '*' em produção (combinado com credentials: true, isso expõe a API a qualquer origem)",
        path: ["CORS_ORIGIN"],
    },
)

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
    console.error("Variáveis de ambiente inválidas:")
    const flattened = z.flattenError(parsed.error)
    console.error(flattened.fieldErrors)
    process.exit(1)
}

export const env = parsed.data