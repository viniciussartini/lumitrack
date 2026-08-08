import { z } from "zod"
import "dotenv/config"

// Schema de validação das variáveis de ambiente.
// Exportado (além de `env`) para permitir teste unitário do schema em
// isolamento, sem depender do `process.exit` disparado abaixo.
export const envSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    BROKER_PORT: z.coerce.number().default(1883),
    BROKER_HOST: z.string().default("127.0.0.1"),
    API_PORT: z.coerce.number().default(4100),
    API_HOST: z.string().default("127.0.0.1"),
    CORS_ORIGIN: z.string().default("http://localhost:5180"),
    LOG_LEVEL: z
        .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
        .default("info"),
    // Sem default — falha ao subir se ausente (fail-closed). Exigido no
    // header Authorization: Bearer das rotas de controle (/api/networks,
    // /api/devices) — ver src/api/middlewares/apiToken.ts.
    SIMULATOR_API_TOKEN: z.string().min(16, {
        message: "SIMULATOR_API_TOKEN é obrigatório (mínimo 16 caracteres)",
    }),
    // Credenciais do hook authenticate do broker Aedes — sem default,
    // mesmo motivo do token acima.
    BROKER_USERNAME: z.string().min(1, { message: "BROKER_USERNAME é obrigatório" }),
    BROKER_PASSWORD: z.string().min(1, { message: "BROKER_PASSWORD é obrigatório" }),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
    console.error("Variáveis de ambiente inválidas:")
    console.error(z.flattenError(parsed.error).fieldErrors)
    process.exit(1)
}

export const env = parsed.data
