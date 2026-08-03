import { test, expect, type Page } from "@playwright/test"

import { fulfillError, fulfillJson, fulfillPaginated } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { hideDevTools } from "./support/devtools"
import { AREA_1, DIST_CEMIG, PROP_1 } from "./support/fixtures"
import type { Area } from "../../src/types/area.types"

/**
 * E2E focado em UI: mocka as respostas do backend via page.route().
 * Vantagem: não depende do backend rodando — roda no CI sem coordenação.
 *
 * Este spec cobre o fluxo completo de Area:
 *   1. Listar (vazio inicial — EmptyState dentro de PropertyDetailsPage)
 *   2. Criar (via botão "Adicionar área" no header da seção, abre
 *      AreaFormDialog — sem navegação, desde #97)
 *   3. Ver detalhes (click no card)
 *   4. Editar (via botão "Editar área" no header da AreaDetailsPage, mesmo
 *      modal, sem navegar pra fora da AreaDetailsPage)
 *   5. Excluir (via menu ⋯ na AreaDetailsPage)
 *
 * Um teste paralelo cobre o fluxo via menu ⋯ no card da lista (editar e
 * excluir) — como AreaCard nunca navega pro editar/excluir (é tudo modal
 * local, sem onAfterDelete), esse teste não sai de PropertyDetailsPage.
 *
 * O spec parte com 1 propriedade já cadastrada e 0 áreas. Não testamos
 * o fluxo de criar a propriedade aqui (já coberto em properties.spec.ts).
 *
 * Reescrito na sub-issue #102 — a versão anterior assumia rotas
 * /areas/nova e /areas/:id/editar que não existem mais desde #97, e o
 * label de submit "Salvar alterações" que na verdade é "Salvar área"
 * pro AreaFormDialog (cada entidade tem seu próprio texto).
 */

type AreaSeed = Area

/**
 * Configura mocks compartilhados (auth + AppShell + distribuidora + 1
 * propriedade fixa). As ÁREAS são geridas dentro de cada teste via closure
 * mutável, porque o estado da DB simulada evolui ao longo do fluxo.
 */
const setupAuthAndProperty = async (page: Page) => {
    await mockAppShellBackground(page)
    await setupAuth(page)

    // Distribuidora — usada apenas nos chips da PropertyDetailsPage.
    await page.route(/\/api\/distributors(\?.*)?$/, (route) =>
        fulfillPaginated(route, [DIST_CEMIG]),
    )
    await page.route("**/api/distributors/dist-cemig", (route) =>
        fulfillJson(route, DIST_CEMIG),
    )
    // Propriedade fixa — não editamos nem deletamos nesta spec.
    await page.route(/\/api\/properties(\?.*)?$/, (route) => {
        if (route.request().method() === "GET") {
            return fulfillPaginated(route, [PROP_1])
        }
        return route.continue()
    })
    await page.route("**/api/properties/prop-1", (route) => {
        if (route.request().method() === "GET") {
            return fulfillJson(route, PROP_1)
        }
        return route.continue()
    })

    // MeterSection é renderizada em toda Property/AreaDetailsPage — sem
    // medidor vinculado, 404 é o estado normal em qualquer targetType.
    await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) =>
        fulfillError(route, "Alvo sem medidor vinculado", 404),
    )

    // `AreasSection` (PropertyDetailsPage) dispara `GET /api/consumption`
    // por área da lista pra montar a "Comparação de áreas" — incondicional,
    // não depende de a área ter medidor (o 404 correspondente é tratado
    // como "sem dado" dentro do próprio hook). Sem esse mock, assim que uma
    // área é criada essa chamada vaza pro proxy do Vite: localmente falha
    // como erro de rede (inofensivo, mascara o problema); em CI, com o
    // backend real de pé, o 401 (sem sessão real — a auth aqui é só
    // `page.route` em `/api/auth/me`) dispara o interceptor global de
    // "unauthorized" e redireciona pra /login no meio do teste — sintoma:
    // "element was detached from the DOM" ao clicar em qualquer coisa
    // depois (ver comentário em `support/appShell.ts`).
    await page.route(/\/api\/consumption(\?.*)?$/, (route) =>
        fulfillPaginated(route, []),
    )
}

/**
 * Registra os mocks dos endpoints de Area apontando pro estado mutável
 * passado como argumento. Encapsula o "DB simulada" pra cada teste.
 *
 * Cobertura de rotas:
 *   - GET    /api/properties/prop-1/areas         → lista (paginada)
 *   - POST   /api/properties/prop-1/areas         → cria (gera id sequencial)
 *   - GET    /api/properties/prop-1/areas/:id     → detalhe
 *   - PUT    /api/properties/prop-1/areas/:id     → atualiza
 *   - DELETE /api/properties/prop-1/areas/:id     → remove (204 sem body)
 *   - GET    .../areas/:id/devices                → lista vazia (DevicesSection
 *     da AreaDetailsPage renderiza pra toda área, mesmo as recém-criadas)
 *
 * Nota sobre o glob: `**\/api/properties/prop-1/areas/*` casa
 * `/areas/area-1` mas NÃO `/areas` (o `*` exige ao menos um segmento).
 * Por isso registramos os dois separadamente.
 */
const setupAreasRoutes = async (
    page: Page,
    state: { areas: AreaSeed[]; nextId: number },
) => {
    // Lista e criação. Regex (não glob): useAreas sempre envia
    // ?page=&pageSize= mesmo nos defaults — um glob sem tratar a query
    // string não casa a URL real e a requisição vaza pro backend (502).
    await page.route(/\/api\/properties\/prop-1\/areas(\?.*)?$/, async (route) => {
        const method = route.request().method()

        if (method === "GET") {
            return fulfillPaginated(route, state.areas)
        }

        if (method === "POST") {
            const body = JSON.parse(route.request().postData() ?? "{}")
            const created: AreaSeed = {
                id: `area-${state.nextId++}`,
                propertyId: "prop-1",
                name: body.name,
                description: body.description ?? null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            }
            state.areas.push(created)
            return fulfillJson(route, created, 201)
        }

        return route.continue()
    })

    // Detalhe, atualização e remoção (qualquer :areaId)
    await page.route(
        "**/api/properties/prop-1/areas/*",
        async (route) => {
            const method = route.request().method()
            const url = new URL(route.request().url())
            const areaId = url.pathname.split("/").pop()!

            const index = state.areas.findIndex((a) => a.id === areaId)

            if (method === "GET") {
                if (index === -1) {
                    return fulfillError(route, "Área não encontrada", 404)
                }
                return fulfillJson(route, state.areas[index])
            }

            if (method === "PUT") {
                if (index === -1) {
                    return route.fulfill({ status: 404 })
                }
                const body = JSON.parse(route.request().postData() ?? "{}")
                state.areas[index] = {
                    ...state.areas[index]!,
                    ...body,
                    updatedAt: new Date().toISOString(),
                }
                return fulfillJson(route, state.areas[index])
            }

            if (method === "DELETE") {
                if (index !== -1) {
                    state.areas.splice(index, 1)
                }
                return route.fulfill({ status: 204 })
            }

            return route.continue()
        },
    )

    // Idem: regex pra tolerar ?page=&pageSize= no GET de useDevices.
    await page.route(
        /\/api\/properties\/[^/]+\/areas\/[^/]+\/devices(\?.*)?$/,
        (route) => {
            if (route.request().method() === "GET") {
                return fulfillPaginated(route, [])
            }
            return route.continue()
        },
    )
}

test.describe("Fluxo CRUD de áreas", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("cria, vê detalhes, edita e exclui uma área (fluxo via header da details)", async ({
        page,
    }) => {
        await setupAuthAndProperty(page)
        const state: { areas: AreaSeed[]; nextId: number } = {
            areas: [],
            nextId: 1,
        }
        await setupAreasRoutes(page, state)

        // ─── 1. Propriedade carrega com EmptyState de áreas ──────────────────
        await page.goto("/propriedades/prop-1")
        await hideDevTools(page)

        await expect(
            page.getByRole("heading", { level: 1, name: /casa principal/i }),
        ).toBeVisible()
        await expect(
            page.getByText(/nenhuma área cadastrada/i),
        ).toBeVisible()

        // ─── 2. Criar nova área (via modal, sem navegação) ───────────────────
        await page.getByRole("button", { name: /adicionar área/i }).click()
        const createDialog = page.getByRole("dialog", {
            name: /adicionar área/i,
        })
        await expect(createDialog).toBeVisible()

        await page.getByLabel(/nome da área/i).fill("Sala")
        await page
            .getByLabel(/descrição/i)
            .fill("Área principal de convivência")

        await page.getByRole("button", { name: /criar área/i }).click()

        // Modal fecha, sem navegação — o card aparece na mesma
        // PropertyDetailsPage
        await expect(createDialog).not.toBeVisible()
        await expect(page).toHaveURL(/\/propriedades\/prop-1$/)
        await expect(page.getByTestId("area-card-area-1")).toBeVisible()
        await expect(
            page.getByRole("heading", { level: 3, name: /sala/i }),
        ).toBeVisible()
        // EmptyState não aparece mais
        await expect(
            page.getByText(/nenhuma área cadastrada/i),
        ).not.toBeVisible()

        // ─── 3. Click no card → AreaDetailsPage ──────────────────────────────
        await page.getByTestId("area-card-area-1").click()
        await expect(page).toHaveURL(
            /\/propriedades\/prop-1\/areas\/area-1$/,
        )

        // Header tem nome + descrição + chip da propriedade pai
        await expect(
            page.getByRole("heading", { level: 1, name: /sala/i }),
        ).toBeVisible()
        await expect(
            page.getByText(/área principal de convivência/i),
        ).toBeVisible()
        await expect(page.getByText(/casa principal/i)).toBeVisible()
        // Seção de devices — EmptyState
        await expect(
            page.getByText(/nenhum dispositivo cadastrado/i),
        ).toBeVisible()

        // ─── 4. Editar via botão do header (modal, sem navegar) ──────────────
        await page.getByRole("button", { name: /editar área/i }).click()
        const editDialog = page.getByRole("dialog", { name: /editar área/i })
        await expect(editDialog).toBeVisible()

        // Form pré-preenchido
        await expect(page.getByLabel(/nome da área/i)).toHaveValue("Sala")

        const nameInput = page.getByLabel(/nome da área/i)
        await nameInput.fill("Sala renovada")

        await page.getByRole("button", { name: /salvar área/i }).click()

        // Modal fecha, permanece na mesma AreaDetailsPage com o nome novo
        await expect(editDialog).not.toBeVisible()
        await expect(page).toHaveURL(
            /\/propriedades\/prop-1\/areas\/area-1$/,
        )
        await expect(
            page.getByRole("heading", { level: 1, name: /sala renovada/i }),
        ).toBeVisible()

        // ─── 5. Excluir via menu ⋯ no header da details ──────────────────────
        await page
            .getByRole("button", { name: /opções de Sala renovada/i })
            .click()
        await page.getByRole("menuitem", { name: /excluir/i }).click()

        // ConfirmDialog abre com aviso de cascade explícito
        await expect(
            page.getByRole("heading", { name: /excluir área/i }),
        ).toBeVisible()
        // Os 3 elementos do cascade aparecem no aviso — escopo ao dialog
        // para evitar strict mode violation (a página tem "Dispositivos"
        // em outros elementos fora do dialog)
        const confirmDialog = page.getByRole("dialog")
        await expect(confirmDialog.getByText(/dispositivos/i)).toBeVisible()
        await expect(
            confirmDialog.getByText(/registros de consumo/i),
        ).toBeVisible()
        await expect(confirmDialog.getByText(/alertas/i)).toBeVisible()

        await page.getByRole("button", { name: "Excluir" }).click()

        // Volta pra PropertyDetailsPage com EmptyState restaurado
        await expect(page).toHaveURL(/\/propriedades\/prop-1$/)
        await expect(
            page.getByText(/nenhuma área cadastrada/i),
        ).toBeVisible()
        await expect(
            page.getByTestId("area-card-area-1"),
        ).not.toBeVisible()
    })

    test("edita e exclui uma área via menu ⋯ do card, sem sair da PropertyDetailsPage", async ({
        page,
    }) => {
        await setupAuthAndProperty(page)
        // Pré-popula com 1 área
        const state: { areas: AreaSeed[]; nextId: number } = {
            areas: [{ ...AREA_1, name: "Cozinha", description: null }],
            nextId: 2,
        }
        await setupAreasRoutes(page, state)

        await page.goto("/propriedades/prop-1")
        await hideDevTools(page)

        // Confirma o card visível
        await expect(page.getByTestId("area-card-area-1")).toBeVisible()
        await expect(
            page.getByRole("heading", { level: 3, name: /cozinha/i }),
        ).toBeVisible()

        // ─── 1. Editar via menu ⋯ do card — modal local, nunca navega ────────
        await page
            .getByRole("button", { name: /opções de Cozinha/i })
            .click()
        await page.getByRole("menuitem", { name: /editar/i }).click()

        const editDialog = page.getByRole("dialog", { name: /editar área/i })
        await expect(editDialog).toBeVisible()
        await page.getByLabel(/nome da área/i).fill("Cozinha gourmet")
        await page.getByRole("button", { name: /salvar área/i }).click()

        // Modal fecha, card atualizado na mesma grid — sem navegação
        // (AreaCard nunca sai de PropertyDetailsPage pra editar)
        await expect(editDialog).not.toBeVisible()
        await expect(page).toHaveURL(/\/propriedades\/prop-1$/)
        await expect(
            page.getByRole("heading", { level: 3, name: /cozinha gourmet/i }),
        ).toBeVisible()

        // ─── 2. Excluir via menu ⋯ do card ───────────────────────────────────
        await page
            .getByRole("button", { name: /opções de Cozinha gourmet/i })
            .click()
        await page.getByRole("menuitem", { name: /excluir/i }).click()

        // ConfirmDialog abre na própria PropertyDetailsPage (não navegamos)
        await expect(
            page.getByRole("heading", { name: /excluir área/i }),
        ).toBeVisible()

        await page.getByRole("button", { name: "Excluir" }).click()

        // Permanece na PropertyDetailsPage, EmptyState restaurado
        await expect(page).toHaveURL(/\/propriedades\/prop-1$/)
        await expect(
            page.getByText(/nenhuma área cadastrada/i),
        ).toBeVisible()
        await expect(
            page.getByTestId("area-card-area-1"),
        ).not.toBeVisible()
    })

    test("validação client-side bloqueia submit com nome vazio", async ({
        page,
    }) => {
        await setupAuthAndProperty(page)
        const state: { areas: AreaSeed[]; nextId: number } = {
            areas: [],
            nextId: 1,
        }
        await setupAreasRoutes(page, state)

        await page.goto("/propriedades/prop-1")
        await hideDevTools(page)

        await page.getByRole("button", { name: /adicionar área/i }).click()
        const createDialog = page.getByRole("dialog", {
            name: /adicionar área/i,
        })
        await expect(createDialog).toBeVisible()

        // Click direto no submit sem preencher
        await page.getByRole("button", { name: /criar área/i }).click()

        // Mensagem de erro do schema aparece
        await expect(page.getByText(/nome é obrigatório/i)).toBeVisible()

        // Continua no modal — não foi possível submeter
        await expect(createDialog).toBeVisible()
    })
})
