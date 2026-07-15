import { z } from "zod"
import "dotenv/config"

// Schema de validação das variáveis de ambiente.
// Exportado (além de `env`) para permitir teste unitário do schema em
// isolamento, sem depender do `process.exit` disparado abaixo.
export const envSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    BROKER_PORT: z.coerce.number().default(1883),
    API_PORT: z.coerce.number().default(4100),
    CORS_ORIGIN: z.string().default("http://localhost:5180"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
    console.error("Variáveis de ambiente inválidas:")
    console.error(z.flattenError(parsed.error).fieldErrors)
    process.exit(1)
}

export const env = parsed.data
