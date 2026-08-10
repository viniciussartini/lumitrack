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
    // Cria no boot a rede "Demo" com os devices que casam com os tópicos
    // do seed de demonstração do backend (ver simulation/demoBootstrap.ts).
    // Existe para a demo pública da ADR-0010: o host gratuito hiberna, e o
    // store é em memória — sem isso, todo despertar deixaria o painel sem
    // dado ao vivo. Default `false`: em desenvolvimento o operador cria as
    // redes pela UI, e ninguém ganha devices fantasma sem pedir.
    // `z.stringbool()` (não `z.coerce.boolean()`) pelo mesmo motivo do
    // backend: coerce faz `Boolean("false") === true`, impossibilitando
    // desligar a flag via env.
    DEMO_BOOTSTRAP_ENABLED: z.stringbool().default(false),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
    console.error("Variáveis de ambiente inválidas:")
    console.error(z.flattenError(parsed.error).fieldErrors)
    process.exit(1)
}

export const env = parsed.data
