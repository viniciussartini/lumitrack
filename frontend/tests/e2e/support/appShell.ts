import type { Page } from "@playwright/test"

import { fulfillJson, fulfillPaginated } from "./api"
import { FAKE_USER } from "./fixtures"
import type { User } from "../../../src/types/auth.types"

/**
 * Mocks das chamadas que QUALQUER rota autenticada dispara sozinha, só por
 * montar o `AppShell` — independentemente da página sendo testada.
 *
 * Por que isso é obrigatório: sem mock, essas chamadas caem no backend real
 * (via proxy do Vite) e respondem 401 → o interceptor do `api` dispara o
 * evento `lumitrack:unauthorized` → o app redireciona pra /login no meio do
 * teste. O sintoma é sempre o mesmo e não parece um erro de rede: o Playwright
 * falha com "element was detached from the DOM" ao clicar em algo, porque a
 * árvore inteira foi desmontada sob seus pés.
 *
 * As quatro chamadas, e de onde vêm:
 *   - `GET /api/alerts/firing` — Header → WarningBadge → useFiringAlerts
 *   - `GET /api/notifications` — Header → NotificationDropdown → useNotifications
 *   - `GET /api/iot/stream`    — AppShell → RealtimeProvider → appStream (SSE)
 *   - `GET /api/alerts`        — a listagem em si; mockada aqui porque o cache
 *     de alertas é invalidado pelo RealtimeContext a cada evento `alert-firing`
 *
 * Chame no `beforeEach`, ANTES dos mocks específicos do spec: quando dois
 * handlers casam a mesma URL, o Playwright usa o registrado por ÚLTIMO — então
 * registrar isto primeiro deixa o spec livre para sobrescrever qualquer rota.
 */
export const mockAppShellBackground = async (page: Page) => {
    // Regex, não glob: `**/api/alerts` capturaria também `/api/alerts/:id` e
    // `/api/alerts/firing`, sequestrando as rotas de detalhe/badge. O `$` após
    // a query string opcional prende o match em `/api/alerts` e
    // `/api/alerts?page=1` — e em mais nada.
    //
    // Só GET: `POST /api/alerts` (criar alerta) casa a mesma URL, e respondê-lo
    // com uma lista vazia paginada seria uma falha silenciosa e difícil de ler.
    // `fallback()` devolve o controle para os demais handlers — se o spec não
    // mockou o POST, ele vaza para o backend e falha alto, que é o certo.
    await page.route(/\/api\/alerts(\?.*)?$/, (route) =>
        route.request().method() === "GET" ? fulfillPaginated(route, []) : route.fallback(),
    )

    // Array cru, NÃO paginado — `GET /alerts/firing` devolve
    // `{ status: "success", data: [...] }` direto (ver alert.service.test.ts).
    // Envelopar em `Paginated` aqui faria o WarningBadge ler `.length` de um
    // objeto e nunca aparecer.
    await page.route(/\/api\/alerts\/firing(\?.*)?$/, (route) => fulfillJson(route, []))

    // Idem: notificações efêmeras são um array cru, sem paginação. Mesma
    // ressalva de método: `DELETE /api/notifications` (limpar todas) casa esta
    // URL e não pode ser confundido com a listagem.
    await page.route(/\/api\/notifications(\?.*)?$/, (route) =>
        route.request().method() === "GET" ? fulfillJson(route, []) : route.fallback(),
    )

    // O `appStream` usa @microsoft/fetch-event-source, cujo `onopen` exige
    // response.ok E content-type começando com `text/event-stream` — senão
    // lança FatalStreamError e não retenta. Body vazio = conexão aberta que
    // nunca emite evento, que é o que a maioria dos specs quer.
    await page.route("**/api/iot/stream", (route) =>
        route.fulfill({ status: 200, contentType: "text/event-stream", body: "" }),
    )
}

/**
 * Simula "usuário autenticado". Como a sessão WEB usa cookie httpOnly +
 * CSRF, não há token em localStorage para pré-semear: o app descobre quem
 * está logado exclusivamente por `GET /api/auth/me`, tanto no bootstrap quanto
 * logo após o login. Mockar essa rota é o suficiente — e é o único caminho.
 */
export const setupAuth = async (page: Page, user: User = FAKE_USER) => {
    await page.route("**/api/auth/me", (route) => fulfillJson(route, user))
}
