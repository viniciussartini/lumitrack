import { test, expect, type Page } from "@playwright/test"

import { fulfillError, fulfillJson, fulfillPaginated } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { mockPropertyTree } from "./support/propertyTree"
import { hideDevTools } from "./support/devtools"
import { AREA_1, DEVICE_1, DIST_CEMIG, PROP_1 } from "./support/fixtures"
import type { Device } from "../../src/types/device.types"

/**
 * E2E focado em UI: mocka as respostas do backend via page.route().
 * Vantagem: não depende do backend rodando — roda no CI sem coordenação.
 *
 * Este spec cobre o Dispositivo dentro da Análise:
 *   1. Chegar pela árvore de seleção (propriedade → área → dispositivo)
 *   2. Ver detalhes (header com tags área/propriedade + seções Medidor/Consumo)
 *   3. Editar (botão "Editar dispositivo" no header, mesmo modal, sem navegar)
 *   4. Excluir (via menu ⋯ na DeviceDetailsPage)
 *
 * Criar dispositivo vive em Configurações → Cadastro (settings.spec.ts): a
 * página da área não tem mais "Adicionar dispositivo" nem grade de cards.
 *
 * O spec parte com 1 propriedade, 1 área e 1 dispositivo já cadastrados.
 */

type DeviceSeed = Device

/**
 * Configura mocks compartilhados (auth + AppShell + distribuidora + 1
 * propriedade + 1 área). Os DEVICES são geridos dentro de cada teste via
 * closure mutável, porque o estado da DB simulada evolui ao longo do fluxo.
 */
const setupAuthPropertyAndArea = async (page: Page) => {
    await mockAppShellBackground(page)
    await setupAuth(page)

    await page.route(/\/api\/distributors(\?.*)?$/, (route) =>
        fulfillPaginated(route, [DIST_CEMIG]),
    )
    await page.route("**/api/distributors/dist-cemig", (route) => fulfillJson(route, DIST_CEMIG))
    // Propriedade e área fixas — não editamos nem deletamos nesta spec.
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
    // Regex (não glob): useAreas sempre envia ?page=&pageSize= mesmo nos
    // defaults — um glob sem tratar a query string não casa a URL real.
    await page.route(/\/api\/properties\/prop-1\/areas(\?.*)?$/, (route) => {
        if (route.request().method() === "GET") {
            return fulfillPaginated(route, [AREA_1])
        }
        return route.continue()
    })
    await page.route("**/api/properties/prop-1/areas/area-1", (route) => {
        if (route.request().method() === "GET") {
            return fulfillJson(route, AREA_1)
        }
        return route.continue()
    })

    // MeterSection é renderizada em Area/DeviceDetailsPage — sem medidor
    // vinculado, 404 é o estado normal em qualquer targetType.
    await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) =>
        fulfillError(route, "Alvo sem medidor vinculado", 404),
    )

    // Sem medidor, o fallback REST de potência (`useLatestMeterReading`) não
    // deveria nem disparar — mas a rota precisa de resposta de qualquer
    // forma (senão vaza pro proxy do Vite pro backend real).
    await page.route(/\/api\/meter-readings(\?.*)?$/, (route) =>
        fulfillJson(route, { items: [], granularity: "minute" }),
    )

    // `AreaConsumptionSection` (o gráfico principal da área) dispara
    // `GET /api/consumption` — sem isso, assim que um dispositivo é criado
    // a chamada vaza pro backend real em CI (401 sem sessão real →
    // interceptor global de "unauthorized" → redirect pra /login no meio do
    // teste → "element was detached from the DOM" em qualquer click
    // seguinte; ver `support/appShell.ts`).
    await page.route(/\/api\/consumption(\?.*)?$/, (route) => fulfillPaginated(route, []))

    // `DevicesSection` (AreaDetailsPage) dispara `GET /api/consumption/summary`
    // com os ids de todos os dispositivos da lista pra montar a "Comparação
    // de dispositivos" (endpoint batch — 1 requisição pra N dispositivos,
    // não 1 por dispositivo) — incondicional, não depende de o dispositivo
    // ter medidor. Mesmo sintoma do mock acima se ficar sem resposta.
    await page.route(/\/api\/consumption\/summary(\?.*)?$/, (route) =>
        fulfillJson(route, { items: [] }),
    )
}

/**
 * Registra os mocks dos endpoints de Device apontando pro estado mutável
 * passado como argumento. Encapsula o "DB simulada" pra cada teste.
 *
 * Cobertura de rotas:
 *   - GET    .../areas/:areaId/devices             → lista (paginada)
 *   - POST   .../areas/:areaId/devices             → cria
 *   - GET    .../areas/:areaId/devices/:id         → detalhe
 *   - PUT    .../areas/:areaId/devices/:id         → atualiza
 *   - DELETE .../areas/:areaId/devices/:id         → remove (204)
 *
 * Glob importante:
 *   `.../areas/area-1/devices` casa a lista (sem segmento depois).
 *   `.../areas/area-1/devices/*` casa qualquer :deviceId (com 1 segmento
 *   depois). Os dois NÃO conflitam — registramos a lista primeiro.
 */
const setupDevicesRoutes = async (page: Page, state: { devices: DeviceSeed[]; nextId: number }) => {
    // A árvore de Análise reflete o estado dos dispositivos — editar ou
    // excluir invalida a chave da árvore e ela é lida de novo.
    await mockPropertyTree(page, () => ({
        total: 1,
        items: [
            {
                id: PROP_1.id,
                name: PROP_1.name,
                areas: [
                    {
                        id: AREA_1.id,
                        name: AREA_1.name,
                        devices: state.devices.map((device) => ({
                            id: device.id,
                            name: device.name,
                            powerWatts: device.powerWatts,
                        })),
                    },
                ],
            },
        ],
    }))

    // Lista e criação. Regex (não glob): useDevices sempre envia
    // ?page=&pageSize= mesmo nos defaults — um glob sem tratar a query
    // string não casa a URL real e a requisição vaza pro backend (502).
    await page.route(/\/api\/properties\/prop-1\/areas\/area-1\/devices(\?.*)?$/, async (route) => {
        const method = route.request().method()

        if (method === "GET") {
            return fulfillPaginated(route, state.devices)
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
    })

    // Detalhe, atualização e remoção (qualquer :deviceId)
    await page.route("**/api/properties/prop-1/areas/area-1/devices/*", async (route) => {
        const method = route.request().method()
        const url = new URL(route.request().url())
        const deviceId = url.pathname.split("/").pop()!

        const index = state.devices.findIndex((d) => d.id === deviceId)

        if (method === "GET") {
            if (index === -1) {
                return fulfillError(route, "Dispositivo não encontrado", 404)
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
    })
}

test.describe("Dispositivo na Análise", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("chega pela árvore, vê detalhes, edita e exclui um dispositivo", async ({ page }) => {
        await setupAuthPropertyAndArea(page)
        const state: { devices: DeviceSeed[]; nextId: number } = {
            devices: [{ ...DEVICE_1 }],
            nextId: 2,
        }
        await setupDevicesRoutes(page, state)

        // ─── 1. Árvore: propriedade → área → dispositivo ─────────────────────
        await page.goto("/propriedades")
        await hideDevTools(page)
        await page.getByRole("treeitem", { name: "Casa Principal" }).click()
        await page.getByRole("treeitem", { name: "Cozinha" }).click()
        await expect(page).toHaveURL(/\/propriedades\/prop-1\/areas\/area-1$/)
        // Sem medidor no dispositivo, a comparação da área explica por quê.
        await expect(page.getByText("Nenhum dispositivo desta área tem medidor.")).toBeVisible()

        // ─── 2. Selecionar o dispositivo abre o detalhe ──────────────────────
        await page.getByRole("treeitem", { name: "Geladeira" }).click()
        await expect(page).toHaveURL(/\/propriedades\/prop-1\/areas\/area-1\/devices\/device-1$/)
        await expect(page.getByRole("treeitem", { name: "Geladeira" })).toHaveAttribute(
            "aria-selected",
            "true",
        )

        const main = page.getByRole("main")
        await expect(main.getByRole("heading", { level: 1, name: /geladeira/i })).toBeVisible()
        // A árvore também mostra esses nomes — os chips são o que se confere aqui.
        await expect(main.locator(".tag", { hasText: /casa principal/i })).toBeVisible()
        await expect(main.locator(".tag", { hasText: /^cozinha$/i })).toBeVisible()
        await expect(main.getByText(/brastemp · brm54/i)).toBeVisible()
        await expect(main.getByRole("heading", { level: 2, name: /^medidor$/i })).toBeVisible()
        await expect(
            main.getByRole("heading", { level: 2, name: /^histórico de consumo$/i }),
        ).toBeVisible()

        // ─── 3. Editar via botão do header (modal, sem navegar) ──────────────
        await page.getByRole("button", { name: /editar dispositivo/i }).click()
        const editDialog = page.getByRole("dialog", { name: /editar dispositivo/i })
        await expect(editDialog).toBeVisible()
        await expect(page.getByLabel(/nome do dispositivo/i)).toHaveValue("Geladeira")
        await expect(page.getByLabel(/marca/i)).toHaveValue("Brastemp")
        await expect(page.getByLabel(/potência/i)).toHaveValue("150")

        await page.getByLabel(/nome do dispositivo/i).fill("Geladeira renovada")
        await page.getByLabel(/potência/i).fill("180")
        await page.getByRole("button", { name: /salvar dispositivo/i }).click()

        await expect(editDialog).not.toBeVisible()
        await expect(page).toHaveURL(/\/propriedades\/prop-1\/areas\/area-1\/devices\/device-1$/)
        await expect(
            main.getByRole("heading", { level: 1, name: /geladeira renovada/i }),
        ).toBeVisible()
        await expect(main.getByText(/180W/i)).toBeVisible()
        await expect(page.getByRole("treeitem", { name: "Geladeira renovada" })).toBeVisible()

        // ─── 4. Excluir via menu ⋯ no header da details ──────────────────────
        await page.getByRole("button", { name: /opções de Geladeira renovada/i }).click()
        await page.getByRole("menuitem", { name: /excluir/i }).click()

        // ConfirmDialog abre com aviso de cascade explícito
        await expect(page.getByRole("heading", { name: /excluir dispositivo/i })).toBeVisible()
        const confirmDialog = page.getByRole("dialog")
        await expect(confirmDialog.getByText(/registros de consumo/i)).toBeVisible()
        await expect(confirmDialog.getByText(/alertas/i)).toBeVisible()
        await expect(confirmDialog.getByText(/integração iot/i)).toBeVisible()

        await page.getByRole("button", { name: "Excluir" }).click()

        // Volta pra área, agora sem dispositivos
        await expect(page).toHaveURL(/\/propriedades\/prop-1\/areas\/area-1$/)
        await expect(
            main.getByText("Cadastre dispositivos para comparar o consumo entre eles."),
        ).toBeVisible()
        await expect(page.getByRole("treeitem", { name: "Geladeira renovada" })).toHaveCount(0)
    })
})
