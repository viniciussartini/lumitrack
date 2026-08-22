import { test, expect, type Page } from "@playwright/test"

import { fulfillError, fulfillJson, fulfillPaginated } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { hideDevTools } from "./support/devtools"
import { AREA_1, DEVICE_1, DIST_CEMIG, PROP_1 } from "./support/fixtures"
import type { Device } from "../../src/types/device.types"

/**
 * E2E focado em UI: mocka as respostas do backend via page.route().
 * Vantagem: não depende do backend rodando — roda no CI sem coordenação.
 *
 * Este spec cobre o fluxo completo de Device:
 *   1. Listar (vazio inicial — EmptyState dentro de AreaDetailsPage)
 *   2. Criar (via botão "Adicionar dispositivo" no header da seção, abre
 *      DeviceFormDialog — sem navegação, desde #97)
 *   3. Ver detalhes (click no card → DeviceDetailsPage com header + tags
 *      área/propriedade + seções Medidor/Consumo)
 *   4. Editar (via botão "Editar dispositivo" no header da
 *      DeviceDetailsPage, mesmo modal, sem navegar pra fora dela)
 *   5. Excluir (via menu ⋯ na DeviceDetailsPage)
 *
 * Um teste paralelo cobre o fluxo via menu ⋯ no card da lista (editar e
 * excluir) — como DeviceCard nunca navega pro editar/excluir (é tudo modal
 * local, sem onAfterDelete), esse teste não sai de AreaDetailsPage.
 *
 * Um terceiro teste cobre validação client-side (potência inválida).
 *
 * O spec parte com 1 propriedade e 1 área já cadastradas e 0 devices.
 * Não testamos o fluxo de criar a propriedade/área aqui (já coberto
 * em properties.spec.ts e area.spec.ts).
 *
 * Reescrito na sub-issue #102 — a versão anterior assumia rotas
 * /devices/novo e /devices/:id/editar que não existem mais desde #97, o
 * label "Salvar alterações" que na verdade é "Salvar dispositivo" pro
 * DeviceFormDialog, e os testids device-property-chip/device-area-chip
 * que não existem mais: DeviceDetailsPage (reescrita em #101) mostra a
 * hierarquia via Tag simples, sem testid — vira locator de texto, mesma
 * convenção já usada pro chip de propriedade em AreaDetailsPage.
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

    // `DevicesSection` (AreaDetailsPage) dispara `GET /api/consumption` por
    // dispositivo da lista pra montar a "Comparação de dispositivos" —
    // incondicional, não depende de o dispositivo ter medidor. Mesmo motivo
    // do mock análogo em `area.spec.ts`: sem isso, assim que um dispositivo
    // é criado a chamada vaza pro backend real em CI (401 sem sessão real →
    // interceptor global de "unauthorized" → redirect pra /login no meio do
    // teste → "element was detached from the DOM" em qualquer click
    // seguinte; ver `support/appShell.ts`).
    await page.route(/\/api\/consumption(\?.*)?$/, (route) => fulfillPaginated(route, []))
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

        await expect(page.getByRole("heading", { level: 1, name: /^cozinha$/i })).toBeVisible()
        await expect(page.getByText(/nenhum dispositivo cadastrado/i)).toBeVisible()

        // ─── 2. Criar novo dispositivo (via modal, sem navegação) ────────────
        await page.getByRole("button", { name: /adicionar dispositivo/i }).click()
        const createDialog = page.getByRole("dialog", {
            name: /adicionar dispositivo/i,
        })
        await expect(createDialog).toBeVisible()

        // Helper text de potência típica visível dentro do modal
        await expect(page.getByText(/geladeira/i)).toBeVisible()

        await page.getByLabel(/nome do dispositivo/i).fill("Ar-condicionado")
        await page.getByLabel(/marca/i).fill("Daikin")
        await page.getByLabel(/modelo/i).fill("Split 12000 BTU")
        await page.getByLabel(/potência/i).fill("1200")

        await page.getByRole("button", { name: /criar dispositivo/i }).click()

        // Modal fecha, sem navegação — o card aparece na mesma AreaDetailsPage
        await expect(createDialog).not.toBeVisible()
        await expect(page).toHaveURL(/\/propriedades\/prop-1\/areas\/area-1$/)
        await expect(page.getByTestId("device-card-device-1")).toBeVisible()
        await expect(
            page.getByRole("heading", { level: 3, name: /ar-condicionado/i }),
        ).toBeVisible()
        // Chip de potência aparece no card
        await expect(page.getByText(/1200W/i).first()).toBeVisible()
        // EmptyState não aparece mais
        await expect(page.getByText(/nenhum dispositivo cadastrado/i)).not.toBeVisible()

        // ─── 3. Click no card → DeviceDetailsPage ────────────────────────────
        await page.getByTestId("device-card-device-1").click()
        await expect(page).toHaveURL(/\/propriedades\/prop-1\/areas\/area-1\/devices\/device-1$/)

        // Header tem nome + chips
        await expect(
            page.getByRole("heading", { level: 1, name: /ar-condicionado/i }),
        ).toBeVisible()
        // Tags da hierarquia (sem testid — DeviceDetailsPage usa Tag simples,
        // mesma convenção do chip de propriedade em AreaDetailsPage)
        await expect(page.getByText(/casa principal/i)).toBeVisible()
        await expect(page.getByText(/^cozinha$/i)).toBeVisible()
        // Tag de metadados (marca + modelo)
        await expect(page.getByText(/daikin · split 12000 btu/i)).toBeVisible()

        // Seções reais (Medidor + Consumo) — não há mais placeholders de
        // Alertas/Integração IoT: viraram /alertas e MeterSection de verdade.
        await expect(page.getByRole("heading", { level: 2, name: /^medidor$/i })).toBeVisible()
        await expect(
            page.getByRole("heading", { level: 2, name: /^histórico de consumo$/i }),
        ).toBeVisible()

        // ─── 4. Editar via botão do header (modal, sem navegar) ──────────────
        await page.getByRole("button", { name: /editar dispositivo/i }).click()
        const editDialog = page.getByRole("dialog", {
            name: /editar dispositivo/i,
        })
        await expect(editDialog).toBeVisible()

        // Form pré-preenchido
        await expect(page.getByLabel(/nome do dispositivo/i)).toHaveValue("Ar-condicionado")
        await expect(page.getByLabel(/marca/i)).toHaveValue("Daikin")
        await expect(page.getByLabel(/potência/i)).toHaveValue("1200")

        // Atualiza nome e potência
        const nameInput = page.getByLabel(/nome do dispositivo/i)
        await nameInput.fill("Ar-condicionado renovado")
        await page.getByLabel(/potência/i).fill("1500")

        await page.getByRole("button", { name: /salvar dispositivo/i }).click()

        // Modal fecha, permanece na mesma DeviceDetailsPage com as mudanças
        await expect(editDialog).not.toBeVisible()
        await expect(page).toHaveURL(/\/propriedades\/prop-1\/areas\/area-1\/devices\/device-1$/)
        await expect(
            page.getByRole("heading", {
                level: 1,
                name: /ar-condicionado renovado/i,
            }),
        ).toBeVisible()
        await expect(page.getByText(/1500W/i)).toBeVisible()

        // ─── 5. Excluir via menu ⋯ no header da details ──────────────────────
        await page
            .getByRole("button", {
                name: /opções de Ar-condicionado renovado/i,
            })
            .click()
        await page.getByRole("menuitem", { name: /excluir/i }).click()

        // ConfirmDialog abre com aviso de cascade explícito
        await expect(page.getByRole("heading", { name: /excluir dispositivo/i })).toBeVisible()

        // Os 3 elementos do cascade aparecem no aviso — escopo ao dialog
        // pra evitar strict mode violation (a página tem headings "Medidor"
        // e "Histórico de consumo" fora do dialog)
        const confirmDialog = page.getByRole("dialog")
        await expect(confirmDialog.getByText(/registros de consumo/i)).toBeVisible()
        await expect(confirmDialog.getByText(/alertas/i)).toBeVisible()
        await expect(confirmDialog.getByText(/integração iot/i)).toBeVisible()

        await page.getByRole("button", { name: "Excluir" }).click()

        // Volta pra AreaDetailsPage com EmptyState restaurado
        await expect(page).toHaveURL(/\/propriedades\/prop-1\/areas\/area-1$/)
        await expect(page.getByText(/nenhum dispositivo cadastrado/i)).toBeVisible()
        await expect(page.getByTestId("device-card-device-1")).not.toBeVisible()
    })

    test("edita e exclui um dispositivo via menu ⋯ do card, sem sair da AreaDetailsPage", async ({
        page,
    }) => {
        await setupAuthPropertyAndArea(page)
        // Pré-popula com 1 device
        const state: { devices: DeviceSeed[]; nextId: number } = {
            devices: [{ ...DEVICE_1 }],
            nextId: 2,
        }
        await setupDevicesRoutes(page, state)

        await page.goto("/propriedades/prop-1/areas/area-1")
        await hideDevTools(page)

        // Confirma o card visível
        await expect(page.getByTestId("device-card-device-1")).toBeVisible()
        await expect(page.getByRole("heading", { level: 3, name: /geladeira/i })).toBeVisible()

        // ─── 1. Editar via menu ⋯ do card — modal local, nunca navega ────────
        await page.getByRole("button", { name: /opções de Geladeira/i }).click()
        await page.getByRole("menuitem", { name: /editar/i }).click()

        const editDialog = page.getByRole("dialog", {
            name: /editar dispositivo/i,
        })
        await expect(editDialog).toBeVisible()
        await page.getByLabel(/nome do dispositivo/i).fill("Geladeira gourmet")
        await page.getByRole("button", { name: /salvar dispositivo/i }).click()

        // Modal fecha, card atualizado na mesma grid — sem navegação
        // (DeviceCard nunca sai de AreaDetailsPage pra editar)
        await expect(editDialog).not.toBeVisible()
        await expect(page).toHaveURL(/\/propriedades\/prop-1\/areas\/area-1$/)
        await expect(
            page.getByRole("heading", {
                level: 3,
                name: /geladeira gourmet/i,
            }),
        ).toBeVisible()

        // ─── 2. Excluir via menu ⋯ do card ───────────────────────────────────
        await page.getByRole("button", { name: /opções de Geladeira gourmet/i }).click()
        await page.getByRole("menuitem", { name: /excluir/i }).click()

        // ConfirmDialog abre na própria AreaDetailsPage (não navegamos)
        await expect(page.getByRole("heading", { name: /excluir dispositivo/i })).toBeVisible()

        await page.getByRole("button", { name: "Excluir" }).click()

        // Permanece na AreaDetailsPage, EmptyState restaurado
        await expect(page).toHaveURL(/\/propriedades\/prop-1\/areas\/area-1$/)
        await expect(page.getByText(/nenhum dispositivo cadastrado/i)).toBeVisible()
        await expect(page.getByTestId("device-card-device-1")).not.toBeVisible()
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

        await page.goto("/propriedades/prop-1/areas/area-1")
        await hideDevTools(page)

        await page.getByRole("button", { name: /adicionar dispositivo/i }).click()
        const createDialog = page.getByRole("dialog", {
            name: /adicionar dispositivo/i,
        })
        await expect(createDialog).toBeVisible()

        // Click direto no submit sem preencher
        await page.getByRole("button", { name: /criar dispositivo/i }).click()

        // Mensagem de erro do schema aparece
        await expect(page.getByText(/nome é obrigatório/i)).toBeVisible()

        // Continua no modal — não foi possível submeter
        await expect(createDialog).toBeVisible()

        // Interage com "potência" (não com "nome") e clica direto no submit
        // sem blur manual — regressão do bug #111: sem esse fluxo, o clique
        // só validava o campo com autoFocus, escondendo o erro de "nome".
        await page.getByLabel(/potência/i).fill("0")
        await page.getByRole("button", { name: /criar dispositivo/i }).click()

        await expect(page.getByText(/nome é obrigatório/i)).toBeVisible()
        await expect(page.getByText(/maior que zero/i)).toBeVisible()
    })
})
