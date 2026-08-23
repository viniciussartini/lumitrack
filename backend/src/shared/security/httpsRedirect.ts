// Decide o que fazer com uma requisição antes de qualquer rota, em produção
// (issue #183). Função pura — recebe `nodeEnv` por parâmetro em vez de ler
// `env.NODE_ENV` direto, mesmo padrão já usado em csrf.ts/logger.ts para
// permanecer testável mesmo com NODE_ENV=test fixado globalmente pelo
// vitest.config.ts.
//
// Antes: o redirect HTTP→HTTPS usava `req.headers.host` (controlado pelo
// cliente) como destino — um Host forjado (`Host: evil.com`) fazia o 301
// apontar para fora do domínio real (open redirect via Host header). Agora
// o destino do redirect é SEMPRE o host canônico de uma env fixa
// (PUBLIC_API_ORIGIN), e qualquer requisição cujo Host não bata com ele é
// recusada com 400 antes de qualquer redirect — o header do cliente nunca é
// ecoado de volta.
export type HttpsRedirectDecision =
    { action: "next" } | { action: "reject" } | { action: "redirect"; location: string }

// Caminho isento das duas checagens abaixo. É alvo exclusivo de verificação
// interna — healthcheck do Docker e monitor de disponibilidade (ADR-0009) —
// que batem no nome do serviço da rede interna (`backend:3333`), nunca no
// domínio público: a checagem de host canônico rejeitaria (400) o próprio
// monitoramento, e o redirect HTTPS devolveria 301 a um cliente que não segue
// redirect. Só o `/health` exato é isento: comparação por igualdade, nunca
// prefixo, para que `/health/../algo` ou `/healthz` não herdem a isenção.
const HEALTH_PATH = "/health"

function isHealthCheck(requestPath: string): boolean {
    // O roteador do Express atende `/health` e `/health/` como a mesma rota;
    // a isenção precisa cobrir as duas, senão um monitor configurado com barra
    // final falha em produção por um motivo invisível.
    return requestPath === HEALTH_PATH || requestPath === `${HEALTH_PATH}/`
}

export function decideHttpsRedirect(params: {
    nodeEnv: string
    requestPath: string
    requestHost: string | undefined
    requestSecure: boolean
    originalUrl: string
    canonicalHost: string
    canonicalOrigin: string
}): HttpsRedirectDecision {
    const {
        nodeEnv,
        requestPath,
        requestHost,
        requestSecure,
        originalUrl,
        canonicalHost,
        canonicalOrigin,
    } = params

    if (nodeEnv !== "production") return { action: "next" }

    if (isHealthCheck(requestPath)) return { action: "next" }

    if (requestHost !== canonicalHost) return { action: "reject" }

    if (!requestSecure) return { action: "redirect", location: `${canonicalOrigin}${originalUrl}` }

    return { action: "next" }
}
