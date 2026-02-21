import { z } from "zod"
import "dotenv/config"

// Schema de validação das variáveis de ambiente.
const envSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().default(3333),

    DATABASE_URL: z.url({ message: "DATABASE_URL deve ser uma URL válida" }),

    JWT_SECRET: z.string().min(32, { message: "JWT_SECRET deve ter ao menos 32 caracteres" }),
    JWT_WEB_EXPIRES_IN: z.string().default("15m"),

    SMTP_HOST: z.string(),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_SECURE: z.coerce.boolean().default(false),
    SMTP_USER: z.string(),
    SMTP_PASS: z.string(),
    SMTP_FROM: z.string(),

    CORS_ORIGIN: z.string().default("http://localhost:3000"),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
    console.error("Variáveis de ambiente inválidas:")
    const flattened = z.flattenError(parsed.error)
    console.error(flattened.fieldErrors)
    process.exit(1)
}

export const env = parsed.data