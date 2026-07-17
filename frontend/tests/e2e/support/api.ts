import type { Route } from "@playwright/test"

import { DEFAULT_PAGE_SIZE, type Paginated } from "../../../src/types/pagination.types"

/**
 * Helpers de resposta para `page.route()`.
 *
 * Todo endpoint do backend responde dentro de um envelope
 * `{ status: "success" | "error", data?, message? }` (ver `AppError` e o
 * middleware de erro do backend) — os helpers daqui montam esse envelope
 * para que nenhum spec precise repetir o `JSON.stringify` na mão.
 */

/** Resposta de sucesso: `{ status: "success", data }`. */
export const fulfillJson = (route: Route, data: unknown, status = 200) =>
    route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ status: "success", data }),
    })

/** Resposta de erro: `{ status: "error", message }` — espelha o AppError do backend. */
export const fulfillError = (route: Route, message: string, status: number) =>
    route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ status: "error", message }),
    })

/**
 * Resposta de uma listagem paginada — o envelope `Paginated<T>` que TODA
 * listagem passou a devolver na reformulação IoT (Fase 3, paginação
 * universal): `{ status: "success", data: { items, total, page, pageSize } }`.
 *
 * É o erro mais comum de mock pós-rework: devolver o array cru (`data: [...]`)
 * faz o hook receber `undefined` em `.items` e a tela quebrar sem erro de
 * rede. As exceções — que continuam devolvendo array cru — são
 * `GET /api/alerts/firing` e `GET /api/notifications`; para elas use
 * `fulfillJson`.
 *
 * `total` default = `items.length` (o caso comum: uma página só). Passe
 * `total` explícito para simular uma listagem com mais páginas do que os
 * itens devolvidos.
 */
export const fulfillPaginated = <T>(
    route: Route,
    items: T[],
    opts: Partial<Omit<Paginated<T>, "items">> = {},
) =>
    fulfillJson(route, {
        items,
        total: opts.total ?? items.length,
        page: opts.page ?? 1,
        pageSize: opts.pageSize ?? DEFAULT_PAGE_SIZE,
    })
