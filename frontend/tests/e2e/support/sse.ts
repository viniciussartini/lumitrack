import type { Page } from "@playwright/test"

/** Monta um evento SSE no formato de wire (`event: X\ndata: {...}\n\n`). */
export const sseEvent = (event: string, data: unknown): string =>
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

/**
 * Janela de tolerância para tratar duas conexões quase simultâneas como o
 * mesmo "boot" da página (ver `mockSseStream` abaixo) — folgada o bastante
 * acima do intervalo real entre as duas (~1-2ms, StrictMode) e bem abaixo do
 * retry padrão de `@microsoft/fetch-event-source` (1000ms, `fetch.js`), que é
 * o cenário que a janela precisa continuar recusando.
 */
const CONNECT_GRACE_MS = 200

/**
 * Registra `GET /api/iot/stream` com um corpo SSE fixo — sobrescreve o
 * stream vazio de `mockAppShellBackground` (registrado depois, então vence).
 *
 * `route.fulfill()` entrega o corpo inteiro e fecha a conexão — a lib
 * `fetch-event-source` trata isso como uma desconexão e reconecta sozinha
 * (backoff de 1s, `DefaultRetryInterval`). Sem alguma proteção contra
 * reentrega, cada reconexão real repetiria os mesmos eventos (ex.: um
 * segundo toast de `notification`, uma segunda leitura).
 *
 * A proteção não pode ser "só a primeira conexão ganha o corpo cheio": o
 * `RealtimeProvider` roda sob `React.StrictMode` (`main.tsx`) — em dev, todo
 * efeito monta duas vezes (monta → limpa → monta de novo), então a página
 * sempre dispara DUAS requisições a este endpoint com poucos milissegundos
 * de distância. A primeira quase sempre é abortada pela limpeza do
 * StrictMode antes de processar qualquer coisa; só a segunda sobrevive e
 * fica de fato conectada. Um flag "já conectou" que vira `true` na PRIMEIRA
 * requisição entrega o corpo cheio pra conexão errada (a que vai ser
 * descartada) e deixa a sobrevivente só com o fallback `connected` — os
 * eventos que o teste espera (`reading`, `alert-firing`, `notification`)
 * nunca chegam, mesmo a conexão em si tendo "aberto" normalmente.
 *
 * A janela de graça resolve isso sem apostar em qual das duas sobrevive:
 * toda requisição dentro de `CONNECT_GRACE_MS` da primeira recebe o corpo
 * cheio (a que for abortada simplesmente descarta o que recebeu — não há
 * ninguém do lado do app pra processar); só requisições fora da janela (um
 * reconnect de verdade, após a conexão sobrevivente ter fechado e a lib
 * retentado) caem no fallback.
 */
export const mockSseStream = async (page: Page, initialBody: string): Promise<void> => {
    let firstRequestAt: number | null = null

    await page.route("**/api/iot/stream", (route) => {
        const now = Date.now()
        if (firstRequestAt === null) firstRequestAt = now

        const withinConnectGrace = now - firstRequestAt < CONNECT_GRACE_MS
        const body = withinConnectGrace ? initialBody : sseEvent("connected", { meterCount: 1 })

        return route.fulfill({ status: 200, contentType: "text/event-stream", body })
    })
}
