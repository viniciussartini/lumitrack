import { test, expect, type Page, type Route } from "@playwright/test"

/**
 * E2E focado em UI: mocka as respostas do backend via page.route().
 * Vantagem: não depende do backend rodando — roda no CI sem coordenação.
 *
 * Este spec cobre o fluxo completo de Device:
 *   1. Listar (vazio inicial — EmptyState dentro de AreaDetailsPage)
 *   2. Criar (via botão "Adicionar dispositivo" no header da seção)
 *   3. Ver detalhes (click no card → DeviceDetailsPage com header
 *      + chips área/propriedade + 3 placeholders)
 *   4. Editar (via botão "Editar dispositivo" no header da DeviceDetailsPage)
 *   5. Excluir (via menu ⋯ na DeviceDetailsPage)
 *
 * Um teste paralelo cobre o fluxo via menu ⋯ no card da lista (editar e
 * excluir) — caminhos que não passam pela DeviceDetailsPage.
 *
 * Um terceiro teste cobre validação client-side (potência inválida).
 *
 * O spec parte com 1 propriedade e 1 área já cadastradas e 0 devices.
 * Não testamos o fluxo de criar a propriedade/área aqui (já coberto
 * em properties.spec.ts e areas.spec.ts).
 */

// ─── Constantes de teste ─────────────────────────────────────────────────────

const FAKE_USER = {
    id: "user-123",
    email: "test@example.com",
    userType: "INDIVIDUAL",
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
    role: "USER",
    mfaEnabled: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const DIST_CEMIG = {
    id: "dist-cemig",
    userId: "user-123",
    name: "CEMIG Distribuição S.A.",
    cnpj: "06.981.180/0001-16",
    electricalSystem: "TRIPHASIC",
    workingVoltage: 220,
    kwhPrice: 0.75,
    taxRate: 0.12,
    publicLightingFee: 45.9,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const PROP_1 = {
    id: "prop-1",
    userId: "user-123",
    distributorId: "dist-cemig",
    name: "Casa Principal",
    address: "Rua das Flores, 100",
    city: "Belo Horizonte",
    state: "MG",
    zipCode: "30000-000",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const AREA_1 = {
    id: "area-1",
    propertyId: "prop-1",
    name: "Sala",
    description: "Área principal de convivência",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

interface DeviceSeed {
    id: string
    areaId: string
    name: string
    brand: string | null
    model: string | null
    powerWatts: number | null
    createdAt: string
    updatedAt: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Helper pra responder JSON com envelope { status: "success", data } —
 * formato padrão do backend.
 */
const fulfillJson = (route: Route, data: unknown, status = 200) =>
    route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ status: "success", data }),
    })

/**
 * Oculta permanentemente o TanStack Query DevTools via CSS injetado — o
 * botão flutuante remonta após cada invalidação de query e volta a
 * interceptar pointer events sobre outros controles da página (ver mesmo
 * helper em consumption.spec.ts, onde o problema foi originalmente
 * diagnosticado).
 */
const hideDevTools = (page: Page) =>
    page.addStyleTag({
        content: ".tsqd-parent-container { display: none !important; }",
    })

/**
 * Configura mocks compartilhados (auth + perfil + distribuidoras + 1
 * propriedade + 1 área). Os DEVICES são geridos dentro de cada teste via
 * closure mutável, porque o estado da DB simulada evolui ao longo do fluxo.
 */
const setupAuthPropertyAndArea = async (page: Page) => {
    // Desde a #06 (sessão WEB via cookie httpOnly), a única rota que precisa
    // ser mockada para simular "usuário autenticado" é GET /auth/me.
    await page.route("**/api/auth/me", (route) =>
        fulfillJson(route, FAKE_USER),
    )
    // O AppShell monta useAlertStream → fetchEventSource("/api/iot/stream").
    // Sem este mock, a requisição SSE cai no backend real (via proxy do Vite)
    // e a lib reconecta em loop, re-renderizando o AppShell continuamente —
    // o que faz o Playwright ver os elementos "detached from DOM" no clique.
    await page.route("**/api/iot/stream", (route) =>
        route.fulfill({ status: 200, contentType: "text/event-stream", body: "" }),
    )
    // AlertBellBadge (no Header do AppShell) chama GET /api/alerts, e as
    // páginas de detalhe consultam alertas aninhados. Sem estes mocks a
    // chamada cai no backend real → 401 → o interceptor dispara
    // "lumitrack:unauthorized" e o app redireciona pra /login no meio do
    // teste (elementos "detached from DOM").
    await page.route(/\/api\/alerts(\?.*)?$/, (route) => fulfillJson(route, []))
    await page.route(/\/api\/properties\/.*\/alerts(\?.*)?$/, (route) =>
        fulfillJson(route, []),
    )
    await page.route("**/api/distributors", (route) =>
        fulfillJson(route, [DIST_CEMIG]),
    )
    await page.route("**/api/distributors/dist-cemig", (route) =>
        fulfillJson(route, DIST_CEMIG),
    )
    // Propriedade fixa — não vamos editar nem deletar nesta spec
    await page.route("**/api/properties", (route) => {
        if (route.request().method() === "GET") {
            return fulfillJson(route, [PROP_1])
        }
        return route.continue()
    })
    await page.route("**/api/properties/prop-1", (route) => {
        if (route.request().method() === "GET") {
            return fulfillJson(route, PROP_1)
        }
        return route.continue()
    })
    // Lista de áreas + detalhe da única área que usamos
    await page.route("**/api/properties/prop-1/areas", (route) => {
        if (route.request().method() === "GET") {
            return fulfillJson(route, [AREA_1])
        }
        return route.continue()
    })
    await page.route("**/api/properties/prop-1/areas/area-1", (route) => {
        if (route.request().method() === "GET") {
            return fulfillJson(route, AREA_1)
        }
        return route.continue()
    })

    // Mock de consumo — sem isso, requests sem mock caem no backend real,
    // o interceptor do axios trata network error como 401 → redirect login
    await page.route("**/api/properties/*/consumption", (route) => {
        if (route.request().method() === "GET") {
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ status: "success", data: [] }),
            })
        }
        return route.continue()
    })
    await page.route("**/api/properties/*/areas/*/consumption", (route) => {
        if (route.request().method() === "GET") {
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ status: "success", data: [] }),
            })
        }
        return route.continue()
    })
    await page.route(
        "**/api/properties/*/areas/*/devices/*/consumption",
        (route) => {
            if (route.request().method() === "GET") {
                return route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({ status: "success", data: [] }),
                })
            }
            return route.continue()
        },
    )

}

/**
 * Registra os mocks dos endpoints de Device apontando pro estado mutável
 * passado como argumento. Encapsula o "DB simulada" pra cada teste.
 *
 * Cobertura de rotas:
 *   - GET    .../areas/:areaId/devices             → lista
 *   - POST   .../areas/:areaId/devices             → cria
 *   - GET    .../areas/:areaId/devices/:id         → detalhe
 *   - PUT    .../areas/:areaId/devices/:id         → atualiza
 *   - DELETE .../areas/:areaId/devices/:id         → remove (204)
 *
 * Glob importante:
 *   `.../areas/area-1/devices` casa a lista (sem segmento depois).
 *   `.../areas/area-1/devices/*` casa qualquer :deviceId (com 1 segmento
 *   depois). Os dois NÃO conflitam — Playwright tenta o mais específico
 *   primeiro, mas pra evitar surpresa registramos a lista primeiro.
 */
const setupDevicesRoutes = async (
    page: Page,
    state: { devices: DeviceSeed[]; nextId: number },
) => {
    // Lista e criação
    await page.route(
        "**/api/properties/prop-1/areas/area-1/devices",
        async (route) => {
            const method = route.request().method()

            if (method === "GET") {
                return fulfillJson(route, state.devices)
            }

            if (method === "POST") {
                const body = JSON.parse(route.request().postData() ?? "{}")
                const created: DeviceSeed = {
                    id: `device-${state.nextId++}`,
                    areaId: "area-1",
                    name: body.name,
                    brand: body.brand ?? null,
                    model: body.model ?? null,
                    powerWatts: body.powerWatts ?? null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                }
                state.devices.push(created)
                return fulfillJson(route, created, 201)
            }

            return route.continue()
        },
    )

    // Detalhe, atualização e remoção (qualquer :deviceId)
    await page.route(
        "**/api/properties/prop-1/areas/area-1/devices/*",
        async (route) => {
            const method = route.request().method()
            const url = new URL(route.request().url())
            const deviceId = url.pathname.split("/").pop()!

            const index = state.devices.findIndex((d) => d.id === deviceId)

            if (method === "GET") {
                if (index === -1) {
                    return route.fulfill({
                        status: 404,
                        contentType: "application/json",
                        body: JSON.stringify({
                            status: "error",
                            message: "Dispositivo não encontrado",
                        }),
                    })
                }
                return fulfillJson(route, state.devices[index])
            }

            if (method === "PUT") {
                if (index === -1) {
                    return route.fulfill({ status: 404 })
                }
                const body = JSON.parse(route.request().postData() ?? "{}")
                state.devices[index] = {
                    ...state.devices[index]!,
                    ...body,
                    updatedAt: new Date().toISOString(),
                }
                return fulfillJson(route, state.devices[index])
            }

            if (method === "DELETE") {
                if (index !== -1) {
                    state.devices.splice(index, 1)
                }
                return route.fulfill({ status: 204 })
            }

            return route.continue()
        },
    )
}

// ─── Testes ──────────────────────────────────────────────────────────────────

test.describe("Fluxo CRUD de dispositivos", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("cria, vê detalhes, edita e exclui um dispositivo (fluxo via header da details)", async ({
        page,
    }) => {
        await setupAuthPropertyAndArea(page)
        const state: { devices: DeviceSeed[]; nextId: number } = {
            devices: [],
            nextId: 1,
        }
        await setupDevicesRoutes(page, state)

        // ─── 1. Área carrega com EmptyState de devices ───────────────────────
        await page.goto("/propriedades/prop-1/areas/area-1")
        await hideDevTools(page)

        await expect(
            page.getByRole("heading", { level: 1, name: /^sala$/i }),
        ).toBeVisible()
        await expect(
            page.getByText(/nenhum dispositivo cadastrado/i),
        ).toBeVisible()

        // ─── 2. Criar novo dispositivo ───────────────────────────────────────
        // Botão "Adicionar dispositivo" agora é um Link (PR 2 — Button asChild)
        await page
            .getByRole("link", { name: /adicionar dispositivo/i })
            .click()
        await expect(page).toHaveURL(
            /\/propriedades\/prop-1\/areas\/area-1\/devices\/novo$/,
        )

        await expect(
            page.getByRole("heading", { level: 1, name: /novo dispositivo/i }),
        ).toBeVisible()
        // Subtítulo menciona o nome da área pai
        await expect(page.getByText(/sala/i).first()).toBeVisible()

        // Helper text de potência típica visível
        await expect(page.getByText(/geladeira/i)).toBeVisible()

        await page
            .getByLabel(/nome do dispositivo/i)
            .fill("Ar-condicionado")
        await page.getByLabel(/marca/i).fill("Daikin")
        await page.getByLabel(/modelo/i).fill("Split 12000 BTU")
        await page.getByLabel(/potência/i).fill("1200")

        await page
            .getByRole("button", { name: /cadastrar dispositivo/i })
            .click()

        // Volta pra área pai com 1 card de device
        await expect(page).toHaveURL(
            /\/propriedades\/prop-1\/areas\/area-1$/,
        )
        await expect(page.getByTestId("device-card-device-1")).toBeVisible()
        await expect(
            page.getByRole("heading", { level: 3, name: /ar-condicionado/i }),
        ).toBeVisible()
        // Chip de potência aparece no card
        await expect(page.getByText(/1200W/i).first()).toBeVisible()
        // EmptyState não aparece mais
        await expect(
            page.getByText(/nenhum dispositivo cadastrado/i),
        ).not.toBeVisible()

        // ─── 3. Click no card → DeviceDetailsPage ────────────────────────────
        await page.getByTestId("device-card-device-1").click()
        await expect(page).toHaveURL(
            /\/propriedades\/prop-1\/areas\/area-1\/devices\/device-1$/,
        )

        // Header tem nome + chips
        await expect(
            page.getByRole("heading", { level: 1, name: /ar-condicionado/i }),
        ).toBeVisible()
        // Chips da hierarquia
        await expect(
            page.getByTestId("device-property-chip"),
        ).toContainText(/casa principal/i)
        await expect(
            page.getByTestId("device-area-chip"),
        ).toContainText(/^sala$/i)
        // Chips de metadados
        await expect(
            page.getByText(/daikin · split 12000 btu/i),
        ).toBeVisible()

        // 3 seções placeholder presentes
        await expect(
            page.getByRole("heading", { level: 2, name: /^consumo$/i }),
        ).toBeVisible()
        await expect(
            page.getByRole("heading", { level: 2, name: /^alertas$/i }),
        ).toBeVisible()
        await expect(
            page.getByRole("heading", { level: 2, name: /integração iot/i }),
        ).toBeVisible()

        // ─── 4. Editar via botão do header ───────────────────────────────────
        await page
            .getByRole("link", { name: /editar dispositivo/i })
            .click()
        await expect(page).toHaveURL(
            /\/propriedades\/prop-1\/areas\/area-1\/devices\/device-1\/editar$/,
        )

        // Form pré-preenchido
        await expect(page.getByLabel(/nome do dispositivo/i)).toHaveValue(
            "Ar-condicionado",
        )
        await expect(page.getByLabel(/marca/i)).toHaveValue("Daikin")
        await expect(page.getByLabel(/potência/i)).toHaveValue("1200")

        // Atualiza nome e potência
        const nameInput = page.getByLabel(/nome do dispositivo/i)
        await nameInput.fill("Ar-condicionado renovado")
        await page.getByLabel(/potência/i).fill("1500")

        await page
            .getByRole("button", { name: /salvar alterações/i })
            .click()

        // Volta pra detalhes do device com mudanças
        await expect(page).toHaveURL(
            /\/propriedades\/prop-1\/areas\/area-1\/devices\/device-1$/,
        )
        await expect(
            page.getByRole("heading", {
                level: 1,
                name: /ar-condicionado renovado/i,
            }),
        ).toBeVisible()
        await expect(page.getByText(/1500W/i)).toBeVisible()

        // ─── 5. Excluir via menu ⋯ no header da details ──────────────────────
        // O aria-label é dinâmico — espelha PropertyMenu/AreaMenu
        await page
            .getByRole("button", {
                name: /opções de Ar-condicionado renovado/i,
            })
            .click()
        await page.getByRole("menuitem", { name: /excluir/i }).click()

        // ConfirmDialog abre com aviso de cascade explícito
        await expect(
            page.getByRole("heading", { name: /excluir dispositivo/i }),
        ).toBeVisible()

        // Os 3 elementos do cascade aparecem no aviso — escopo ao dialog
        // pra evitar strict mode violation (a página tem "alertas" e
        // "consumo" como headings de seções placeholder)
        const confirmDialog = page.getByRole("dialog")
        await expect(
            confirmDialog.getByText(/registros de consumo/i),
        ).toBeVisible()
        await expect(
            confirmDialog.getByText(/alertas/i),
        ).toBeVisible()
        await expect(
            confirmDialog.getByText(/integração iot/i),
        ).toBeVisible()

        await page.getByRole("button", { name: "Excluir" }).click()

        // Volta pra AreaDetailsPage com EmptyState restaurado
        await expect(page).toHaveURL(
            /\/propriedades\/prop-1\/areas\/area-1$/,
        )
        await expect(
            page.getByText(/nenhum dispositivo cadastrado/i),
        ).toBeVisible()
        await expect(
            page.getByTestId("device-card-device-1"),
        ).not.toBeVisible()
    })

    test("edita e exclui um dispositivo via menu ⋯ do card (sem passar pela details)", async ({
        page,
    }) => {
        await setupAuthPropertyAndArea(page)
        // Pré-popula com 1 device
        const state: { devices: DeviceSeed[]; nextId: number } = {
            devices: [
                {
                    id: "device-1",
                    areaId: "area-1",
                    name: "Geladeira",
                    brand: null,
                    model: null,
                    powerWatts: 150,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            ],
            nextId: 2,
        }
        await setupDevicesRoutes(page, state)

        await page.goto("/propriedades/prop-1/areas/area-1")
        await hideDevTools(page)

        // Confirma o card visível
        await expect(page.getByTestId("device-card-device-1")).toBeVisible()
        await expect(
            page.getByRole("heading", { level: 3, name: /geladeira/i }),
        ).toBeVisible()

        // ─── 1. Editar via menu ⋯ do card ────────────────────────────────────
        await page
            .getByRole("button", { name: /opções de Geladeira/i })
            .click()
        await page.getByRole("menuitem", { name: /editar/i }).click()

        await expect(page).toHaveURL(
            /\/propriedades\/prop-1\/areas\/area-1\/devices\/device-1\/editar$/,
        )
        await page
            .getByLabel(/nome do dispositivo/i)
            .fill("Geladeira gourmet")
        await page
            .getByRole("button", { name: /salvar alterações/i })
            .click()

        // Volta pra detalhes do device (não pra lista — comportamento da EditDevicePage)
        await expect(page).toHaveURL(
            /\/propriedades\/prop-1\/areas\/area-1\/devices\/device-1$/,
        )
        await expect(
            page.getByRole("heading", {
                level: 1,
                name: /geladeira gourmet/i,
            }),
        ).toBeVisible()

        // Volta pra lista da área
        await page
            .getByRole("link", { name: /voltar para área/i })
            .click()
        await expect(page).toHaveURL(
            /\/propriedades\/prop-1\/areas\/area-1$/,
        )

        // ─── 2. Excluir via menu ⋯ do card ───────────────────────────────────
        await page
            .getByRole("button", { name: /opções de Geladeira gourmet/i })
            .click()
        await page.getByRole("menuitem", { name: /excluir/i }).click()

        // ConfirmDialog abre na própria AreaDetailsPage (não navegamos)
        await expect(
            page.getByRole("heading", { name: /excluir dispositivo/i }),
        ).toBeVisible()

        await page.getByRole("button", { name: "Excluir" }).click()

        // Permanece na AreaDetailsPage, EmptyState restaurado
        // (sem navegação — diferente do delete via DeviceDetailsPage)
        await expect(page).toHaveURL(
            /\/propriedades\/prop-1\/areas\/area-1$/,
        )
        await expect(
            page.getByText(/nenhum dispositivo cadastrado/i),
        ).toBeVisible()
        await expect(
            page.getByTestId("device-card-device-1"),
        ).not.toBeVisible()
    })

    test("validação client-side bloqueia submit com nome vazio e potência inválida", async ({
        page,
    }) => {
        await setupAuthPropertyAndArea(page)
        const state: { devices: DeviceSeed[]; nextId: number } = {
            devices: [],
            nextId: 1,
        }
        await setupDevicesRoutes(page, state)

        await page.goto("/propriedades/prop-1/areas/area-1/devices/novo")
        await hideDevTools(page)

        // Click direto no submit sem preencher
        await page
            .getByRole("button", { name: /cadastrar dispositivo/i })
            .click()

        // Mensagem de erro do schema aparece
        await expect(page.getByText(/nome é obrigatório/i)).toBeVisible()

        // Permanece na mesma URL — não navegou
        await expect(page).toHaveURL(
            /\/propriedades\/prop-1\/areas\/area-1\/devices\/novo$/,
        )

        // Agora preenche nome mas tenta potência zero
        await page.getByLabel(/nome do dispositivo/i).fill("Lâmpada")
        await page.getByLabel(/potência/i).fill("0")
        await page.getByLabel(/potência/i).blur()

        await expect(
            page.getByText(/maior que zero/i),
        ).toBeVisible()
    })
})