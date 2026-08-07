import pino from "pino"
import { env } from "@/config/env.js"

// Funções puras (recebem `nodeEnv`/`logLevel` por parâmetro) para serem
// testáveis em isolamento — mesmo padrão de `csrf.ts`: evita depender
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

// Redação de dado sensível (A09 / LGPD Art. 6º III). `pino-http`
// anexa `req`/`res` inteiros (headers incluídos) a toda linha de log da
// requisição — sem isso, cookie de sessão, refresh token e Bearer viajam
// em texto claro para qualquer destino do logger. Os caminhos `audit.*`/
// `entry.*` cobrem chamadas que logam uma entrada de auditoria como
// binding (`logger.info({ audit: entry }, ...)`); os wildcards `*.campo`
// cobrem qualquer objeto logado com esses campos, independente da chave
// raiz usada.
export const logRedactPaths = [
    "req.headers.cookie",
    "req.headers.authorization",
    'res.headers["set-cookie"]',
    'req.headers["x-csrf-token"]',
    'req.headers["x-refresh-csrf-token"]',
    "audit.metadata.attemptedEmail",
    "entry.metadata.attemptedEmail",
    "*.password",
    "*.newPassword",
    "*.token",
    "*.mfaToken",
    "*.secret",
    "*.cpf",
    "*.cnpj",
]

export const logger = pino({
    level: resolveLogLevel(env.NODE_ENV, env.LOG_LEVEL),
    redact: { paths: logRedactPaths, censor: "[REDACTED]" },
    ...(transport && { transport }),
})
