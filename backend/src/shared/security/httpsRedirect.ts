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

export function decideHttpsRedirect(params: {
    nodeEnv: string
    requestHost: string | undefined
    requestSecure: boolean
    originalUrl: string
    canonicalHost: string
    canonicalOrigin: string
}): HttpsRedirectDecision {
    const { nodeEnv, requestHost, requestSecure, originalUrl, canonicalHost, canonicalOrigin } =
        params

    if (nodeEnv !== "production") return { action: "next" }

    if (requestHost !== canonicalHost) return { action: "reject" }

    if (!requestSecure) return { action: "redirect", location: `${canonicalOrigin}${originalUrl}` }

    return { action: "next" }
}
