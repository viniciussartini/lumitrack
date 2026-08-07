import { z } from "zod"
import "dotenv/config"

// Schema de validação das variáveis de ambiente.
// Exportado (além de `env`) para permitir teste unitário do schema em
// isolamento, sem depender do `process.exit` disparado abaixo.
export const envSchema = z
    .object({
        NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
        PORT: z.coerce.number().default(3333),

        DATABASE_URL: z.url({ message: "DATABASE_URL deve ser uma URL válida" }),

        // Bancos usados só pela suíte de testes (shared/test/prisma-test.ts,
        // prisma-http-test.ts) — a suíte APAGA os dados desses bancos a cada
        // execução (ver .env.example). Opcionais aqui porque só fazem
        // sentido em NODE_ENV=test; obrigatórias nesse caso pelo `.refine`
        // abaixo, junto da checagem que impede apontarem para DATABASE_URL
        // (#165 — o modo de falha de deixar isso passar batido é apagar o
        // banco de desenvolvimento).
        DATABASE_TEST_URL: z
            .url({ message: "DATABASE_TEST_URL deve ser uma URL válida" })
            .optional(),
        DATABASE_HTTP_TEST_URL: z
            .url({ message: "DATABASE_HTTP_TEST_URL deve ser uma URL válida" })
            .optional(),

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
        CPF_CNPJ_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, {
            message: "CPF_CNPJ_ENCRYPTION_KEY deve ter 64 caracteres hexadecimais (32 bytes)",
        }),
        CPF_CNPJ_BLIND_INDEX_KEY: z.string().regex(/^[0-9a-f]{64}$/i, {
            message: "CPF_CNPJ_BLIND_INDEX_KEY deve ter 64 caracteres hexadecimais (32 bytes)",
        }),

        // Logger estruturado (#08 da remediação OWASP/LGPD — A09).
        LOG_LEVEL: z
            .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
            .default("info"),

        // Retenção e expurgo de dados (#10 da remediação OWASP/LGPD — Art. 15/16).
        // Tokens/resets já inativos (expirados/revogados/usados) e audit logs
        // antigos são removidos pelo RetentionPurgeScheduler após esses prazos.
        // AuditLog usa um prazo mais longo de propósito — equilíbrio entre o
        // Art. 48 (capacidade de reconstruir incidentes) e o Art. 15/16
        // (minimização: não guardar dados além do necessário).
        DATA_RETENTION_AUTH_TOKEN_DAYS: z.coerce.number().default(30),
        DATA_RETENTION_PASSWORD_RESET_DAYS: z.coerce.number().default(30),
        DATA_RETENTION_AUDIT_LOG_DAYS: z.coerce.number().default(730), // ~2 anos

        // MFA opcional via TOTP (#12 da remediação OWASP/LGPD — A06/A07).
        // Chave própria (separada de CPF_CNPJ_ENCRYPTION_KEY) para cifrar o
        // segredo TOTP em repouso — compartimentaliza o risco: o
        // comprometimento de uma chave não expõe a outra categoria de dado.
        // Mesmo formato (64 caracteres hex / 32 bytes). Gerar com:
        //   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
        MFA_SECRET_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, {
            message: "MFA_SECRET_ENCRYPTION_KEY deve ter 64 caracteres hexadecimais (32 bytes)",
        }),

        // Criptografia do endereço da propriedade em repouso (#15 da remediação
        // OWASP/LGPD — A04/Art. 46). Chave própria (separada de
        // CPF_CNPJ_ENCRYPTION_KEY e MFA_SECRET_ENCRYPTION_KEY) — endereço
        // geográfico é categoria de dado pessoal distinta dos outros campos
        // sensíveis; o comprometimento de uma chave não deve expor as demais.
        // Não há blind index: ao contrário de CPF/CNPJ, endereço não tem
        // constraint @unique e nunca é usado como filtro de query.
        // Mesmo formato (64 caracteres hex / 32 bytes). Gerar com:
        //   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
        ADDRESS_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, {
            message: "ADDRESS_ENCRYPTION_KEY deve ter 64 caracteres hexadecimais (32 bytes)",
        }),

        // Refresh token da sessão WEB (#14 da remediação OWASP/LGPD — A06).
        // Canal MOBILE não usa refresh (token de 90 dias já cobre a UX).
        JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
        // Janela de graça após rotação — tolera corrida entre abas do mesmo browser.
        REFRESH_TOKEN_GRACE_PERIOD_MS: z.coerce.number().default(5000),
        REFRESH_COOKIE_NAME: z.string().default("lumitrack_refresh"),
        REFRESH_CSRF_COOKIE_NAME: z.string().default("lumitrack_refresh_csrf"),
        REFRESH_CSRF_HEADER_NAME: z.string().default("x-refresh-csrf-token"),
        DATA_RETENTION_REFRESH_TOKEN_DAYS: z.coerce.number().default(30),

        // Proteção SSRF nas conexões de saída do medidor (#10 da remediação
        // OWASP/LGPD — A01). Loopback, link-local, RFC1918/ULA e multicast são
        // negados por padrão (ver shared/security/outboundHost.ts) — esta lista
        // é o único jeito de liberar o caso legítimo de medidor em rede local.
        // Formato: hosts e/ou CIDRs separados por vírgula
        // (ex.: "broker.local,192.168.0.0/16,10.0.5.20/32"). Vazio = nenhuma
        // exceção liberada, só destino público de fato alcançável na internet.
        IOT_ALLOWED_HOSTS: z.string().optional(),
    })
    .refine((data) => !(data.NODE_ENV === "production" && data.CORS_ORIGIN === "*"), {
        message:
            "CORS_ORIGIN não pode ser '*' em produção (combinado com credentials: true, isso expõe a API a qualquer origem)",
        path: ["CORS_ORIGIN"],
    })
    .refine((data) => data.NODE_ENV !== "test" || data.DATABASE_TEST_URL !== undefined, {
        message: "DATABASE_TEST_URL é obrigatória quando NODE_ENV=test",
        path: ["DATABASE_TEST_URL"],
    })
    .refine((data) => data.NODE_ENV !== "test" || data.DATABASE_HTTP_TEST_URL !== undefined, {
        message: "DATABASE_HTTP_TEST_URL é obrigatória quando NODE_ENV=test",
        path: ["DATABASE_HTTP_TEST_URL"],
    })
    .refine((data) => !data.DATABASE_TEST_URL || data.DATABASE_TEST_URL !== data.DATABASE_URL, {
        message:
            "DATABASE_TEST_URL não pode ser igual a DATABASE_URL — a suíte de testes apaga os dados desse banco",
        path: ["DATABASE_TEST_URL"],
    })
    .refine(
        (data) => !data.DATABASE_HTTP_TEST_URL || data.DATABASE_HTTP_TEST_URL !== data.DATABASE_URL,
        {
            message:
                "DATABASE_HTTP_TEST_URL não pode ser igual a DATABASE_URL — a suíte de testes apaga os dados desse banco",
            path: ["DATABASE_HTTP_TEST_URL"],
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
