import pino from "pino"
import { env } from "@/config/env.js"

// Funções puras (recebem `nodeEnv`/`logLevel` por parâmetro) para serem
// testáveis em isolamento — mesmo padrão de `csrf.ts` (#06): evita depender
// do singleton `env` (e do `NODE_ENV=test` fixado globalmente pelo
// vitest.config.ts) dentro da lógica que decide o comportamento do logger.

// Em testes, silenciamos por padrão (ruído de centenas de testes) a menos
// que alguém esteja depurando algo e tenha setado LOG_LEVEL explicitamente.
export function resolveLogLevel(nodeEnv: string, logLevel: string): string {
    return nodeEnv === "test" ? "silent" : logLevel
}

// JSON puro em produção (consumido por agregadores de log); pretty-print
// legível em desenvolvimento. `pino-pretty` é dependência direta (não dev)
// porque o transport é carregado em runtime — uma instalação que prunar
// devDependencies e depois rodar com NODE_ENV=development quebraria.
export function resolveTransport(nodeEnv: string): pino.TransportSingleOptions | undefined {
    if (nodeEnv === "production" || nodeEnv === "test") {
        return undefined
    }

    return {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:standard" },
    }
}

const transport = resolveTransport(env.NODE_ENV)

export const logger = pino({
    level: resolveLogLevel(env.NODE_ENV, env.LOG_LEVEL),
    ...(transport && { transport }),
})
