import { test, expect, type Page } from "@playwright/test"

import { fulfillError, fulfillJson, fulfillPaginated } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { hideDevTools } from "./support/devtools"
import { AREA_1, DIST_CEMIG, PROP_1 } from "./support/fixtures"
import { mockPropertyTree } from "./support/propertyTree"
import type { Area } from "../../src/types/area.types"
import type { Property, PropertyTree } from "../../src/types/property.types"

/**
 * E2E focado em UI: mocka as respostas do backend via page.route().
 * Vantagem: não depende do backend rodando — roda no CI sem coordenação.
 *
 * Este spec cobre a Análise pelo lado da Propriedade:
 *   1. Árvore de seleção + convite quando nada está selecionado
 *   2. Detalhe da propriedade: dados, edição (nome e distribuidora)
 *   3. Sem criar/excluir — vivem em Configurações → Cadastro
 *   4. Busca na hierarquia, teto da árvore e usuário sem propriedades
 *   5. "Comparação de áreas": kWh/R$, e R$ desabilitado sem custo
 *
 * Criar e excluir propriedade é coberto em settings.spec.ts.
 */

const DIST_ENEL = {
    ...DIST_CEMIG,
    id: "dist-enel",
    name: "ENEL São Paulo",
    cnpj: "61.695.227/0001-93",
}

const PROP_2 = { ...PROP_1, id: "prop-2", name: "Loja Centro" }

const treeOf = (properties: Property[], areas: Area[] = []): PropertyTree => ({
    total: properties.length,
    items: properties.map((property) => ({
        id: property.id,
        name: property.name,
        areas: areas
            .filter((area) => area.propertyId === property.id)
            .map((area) => ({ id: area.id, name: area.name, devices: [] })),
    })),
})

interface SetupOptions {
    properties?: Property[]
    areas?: Area[]
    getTree?: () => PropertyTree
}

/**
 * Mocks compartilhados: auth + AppShell + distribuidoras + árvore + o que o
 * detalhe da propriedade dispara sozinho (áreas, medidor, consumo, resumo).
 * O estado da "DB" simulada é da própria lista `properties`, mutável.
 */
const setupAnalysis = async (page: Page, options: SetupOptions = {}) => {
    const { properties = [PROP_1], areas = [] } = options
    await mockAppShellBackground(page)
    await setupAuth(page)
    await mockPropertyTree(page, options.getTree ?? (() => treeOf(properties, areas)))

    await page.route(/\/api\/distributors(\?.*)?$/, (route) =>
        fulfillPaginated(route, [DIST_CEMIG, DIST_ENEL]),
    )
    await page.route("**/api/distributors/dist-cemig", (route) => fulfillJson(route, DIST_CEMIG))
    await page.route("**/api/distributors/dist-enel", (route) => fulfillJson(route, DIST_ENEL))

    await page.route(/\/api\/properties(\?.*)?$/, (route) =>
        route.request().method() === "GET" ? fulfillPaginated(route, properties) : route.fallback(),
    )
    await page.route(/\/api\/properties\/prop-\d+$/, (route) => {
        const id = new URL(route.request().url()).pathname.split("/").pop()
        const property = properties.find((candidate) => candidate.id === id)
        return property
            ? fulfillJson(route, property)
            : fulfillError(route, "Propriedade não encontrada", 404)
    })
    await page.route(/\/api\/properties\/prop-\d+\/areas(\?.*)?$/, (route) =>
        fulfillPaginated(
            route,
            areas.filter((area) => route.request().url().includes(`/${area.propertyId}/`)),
        ),
    )

    // Sem medidor vinculado, 404 é o estado normal (meterService.byTarget trata como null).
    await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) =>
        fulfillError(route, "Alvo sem medidor vinculado", 404),
    )
    await page.route(/\/api\/meter-readings(\?.*)?$/, (route) =>
        fulfillJson(route, { items: [], granularity: "minute" }),
    )
    await page.route(/\/api\/consumption(\?.*)?$/, (route) => fulfillPaginated(route, []))
    await page.route(/\/api\/consumption\/summary(\?.*)?$/, (route) =>
        fulfillJson(route, { items: [] }),
    )
    // PropertyFormDialog busca o contrato ACL corrente ao abrir em modo edição.
    await page.route(/\/api\/acl-contracts(\?.*)?$/, (route) => fulfillPaginated(route, []))
}

const routeProperty = async (page: Page, state: { property: Property }) => {
    await page.route(`**/api/properties/${state.property.id}`, async (route) => {
        if (route.request().method() === "PUT") {
            const body = JSON.parse(route.request().postData() ?? "{}")
            state.property = { ...state.property, ...body, updatedAt: new Date().toISOString() }
        }
        return fulfillJson(route, state.property)
    })
}

const summaryItem = (id: string, kwhConsumed: number, costBrl?: number) => ({
    id,
    targetType: "AREA",
    bucketStart: "2026-09-01T00:00:00.000Z",
    kwhConsumed,
    avgPowerW: 300,
    ...(costBrl !== undefined && { costBrl }),
})

test.describe("Análise — árvore e detalhe da propriedade", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("sem seleção, mostra a hierarquia e o convite para escolher o que analisar", async ({
        page,
    }) => {
        await setupAnalysis(page)

        await page.goto("/propriedades")
        await hideDevTools(page)

        await expect(
            page.getByRole("heading", { name: /análise de propriedades/i, level: 1 }),
        ).toBeVisible()
        await expect(page.getByRole("tree")).toBeVisible()
        await expect(page.getByRole("treeitem", { name: "Casa Principal" })).toBeVisible()
        await expect(
            page.getByRole("heading", { name: "Selecione o que deseja analisar" }),
        ).toBeVisible()
        // Criar propriedade saiu daqui — vive em Configurações → Cadastro.
        await expect(page.getByRole("button", { name: /nova propriedade/i })).toHaveCount(0)
        await expect(
            page.getByRole("button", { name: /cadastrar primeira propriedade/i }),
        ).toHaveCount(0)
    })

    test("seleciona a propriedade na árvore, edita nome e distribuidora e não oferece excluir", async ({
        page,
    }) => {
        const state = { property: { ...PROP_1 } }
        await setupAnalysis(page, { getTree: () => treeOf([state.property]) })
        await routeProperty(page, state)

        await page.goto("/propriedades")
        await hideDevTools(page)

        // ─── 1. Selecionar na árvore abre o detalhe ao lado dela ─────────────
        await page.getByRole("treeitem", { name: "Casa Principal" }).click()
        await expect(page).toHaveURL(/\/propriedades\/prop-1$/)
        await expect(page.getByRole("heading", { level: 2, name: /casa principal/i })).toBeVisible()
        await expect(page.getByRole("treeitem", { name: "Casa Principal" })).toHaveAttribute(
            "aria-selected",
            "true",
        )
        await expect(page.getByText(/cemig/i).first()).toBeVisible()
        await expect(page.getByText(/biphasic|bifásico/i)).toBeVisible()
        await expect(page.getByText(/b1 — residencial/i)).toBeVisible()
        await expect(page.getByRole("heading", { level: 2, name: /^medidor$/i })).toBeVisible()

        // ─── 2. Editar nome pelo modal, sem sair do detalhe ──────────────────
        await page.getByRole("button", { name: /^editar$/i }).click()
        const editDialog = page.getByRole("dialog", { name: /editar propriedade/i })
        await expect(editDialog).toBeVisible()
        await page.getByLabel(/nome da propriedade/i).fill("Casa Renovada")
        await page.getByRole("button", { name: /salvar alterações/i }).click()

        await expect(editDialog).not.toBeVisible()
        await expect(page).toHaveURL(/\/propriedades\/prop-1$/)
        await expect(page.getByRole("heading", { level: 2, name: /casa renovada/i })).toBeVisible()
        // A árvore acompanha a escrita.
        await expect(page.getByRole("treeitem", { name: "Casa Renovada" })).toBeVisible()

        // ─── 3. Trocar a distribuidora vinculada ─────────────────────────────
        await page.getByRole("button", { name: /^editar$/i }).click()
        await expect(editDialog).toBeVisible()
        await page.getByLabel(/distribuidora vinculada/i).selectOption("dist-enel")
        await page.getByRole("button", { name: /salvar alterações/i }).click()

        await expect(editDialog).not.toBeVisible()
        await expect(page.getByText(/enel são paulo/i)).toBeVisible()

        // ─── 4. Excluir não existe aqui ──────────────────────────────────────
        await expect(page.getByRole("button", { name: /opções de/i })).toHaveCount(0)
        await expect(page.getByRole("button", { name: /excluir/i })).toHaveCount(0)
    })

    test("busca na hierarquia filtra a árvore e avisa quando nada casa", async ({ page }) => {
        await setupAnalysis(page, { properties: [PROP_1, PROP_2] })

        await page.goto("/propriedades")
        await hideDevTools(page)
        await expect(page.getByRole("treeitem")).toHaveCount(2)

        await page.getByRole("searchbox", { name: "Buscar na hierarquia" }).fill("loja")
        await expect(page.getByRole("treeitem")).toHaveCount(1)
        await expect(page.getByRole("treeitem", { name: "Loja Centro" })).toBeVisible()

        await page.getByRole("searchbox", { name: "Buscar na hierarquia" }).fill("zzz")
        await expect(page.getByText("Nenhum resultado para a busca.")).toBeVisible()
    })

    test("avisa quando o teto da árvore corta propriedades", async ({ page }) => {
        await setupAnalysis(page, { getTree: () => ({ ...treeOf([PROP_1]), total: 130 }) })

        await page.goto("/propriedades")
        await hideDevTools(page)

        await expect(page.getByText("Mostrando 1 de 130 propriedades.")).toBeVisible()
    })

    test("sem propriedades, leva ao Cadastro", async ({ page }) => {
        await setupAnalysis(page, { properties: [] })
        await page.route(/\/api\/tariff-flag(\?.*)?$/, (route) => route.fulfill({ status: 404 }))

        await page.goto("/propriedades")
        await hideDevTools(page)

        await expect(page.getByText(/nenhuma propriedade cadastrada/i)).toBeVisible()
        await page.getByRole("link", { name: "Cadastre em Configurações" }).click()
        await expect(page).toHaveURL(/\/configuracoes\/cadastro$/)
    })
})

test.describe("Análise — comparação de áreas da propriedade", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    const AREA_2: Area = { ...AREA_1, id: "area-2", name: "Sala" }

    test("compara as áreas com medidor em kWh e em R$", async ({ page }) => {
        await setupAnalysis(page, { areas: [AREA_1, AREA_2] })
        await page.route(/\/api\/consumption\/summary(\?.*)?$/, (route) =>
            fulfillJson(route, {
                items: [summaryItem("area-1", 40, 32), summaryItem("area-2", 20, 16)],
            }),
        )
        await page.goto("/propriedades/prop-1")
        await hideDevTools(page)

        const comparison = page.getByTestId("area-comparison")
        await expect(comparison.getByText("Cozinha")).toBeVisible()
        await expect(comparison.getByText("Sala")).toBeVisible()
        await expect(comparison.getByText("40,00 kWh")).toBeVisible()

        await comparison.getByRole("button", { name: "R$" }).click()
        await expect(comparison.getByText(/R\$\s?32,00/)).toBeVisible()
    })

    test("deixa de fora a área sem medidor", async ({ page }) => {
        await setupAnalysis(page, { areas: [AREA_1, AREA_2] })
        await page.route(/\/api\/consumption\/summary(\?.*)?$/, (route) =>
            fulfillJson(route, { items: [summaryItem("area-1", 40, 32)] }),
        )
        await page.goto("/propriedades/prop-1")
        await hideDevTools(page)

        const comparison = page.getByTestId("area-comparison")
        await expect(comparison.getByText("Cozinha")).toBeVisible()
        await expect(comparison.getByText("Sala")).toHaveCount(0)
    })

    test("sem custo calculável (Grupo A ou Branca), mostra kWh e desabilita R$ com a explicação", async ({
        page,
    }) => {
        await setupAnalysis(page, { areas: [AREA_1] })
        await page.route(/\/api\/consumption\/summary(\?.*)?$/, (route) =>
            fulfillJson(route, { items: [summaryItem("area-1", 40)] }),
        )
        await page.goto("/propriedades/prop-1")
        await hideDevTools(page)

        const comparison = page.getByTestId("area-comparison")
        await expect(comparison.getByText("40,00 kWh")).toBeVisible()
        await expect(comparison.getByRole("button", { name: "R$" })).toBeDisabled()
        await expect(
            comparison.getByText("Custo em R$ indisponível para esta tarifa."),
        ).toBeVisible()
    })

    test("explica quando nenhuma área tem medidor ou quando não há áreas", async ({ page }) => {
        await setupAnalysis(page, { areas: [AREA_1] })
        await page.goto("/propriedades/prop-1")
        await hideDevTools(page)
        await expect(page.getByText("Nenhuma área desta propriedade tem medidor.")).toBeVisible()

        await page.unroute(/\/api\/properties\/prop-\d+\/areas(\?.*)?$/)
        await page.route(/\/api\/properties\/prop-\d+\/areas(\?.*)?$/, (route) =>
            fulfillPaginated(route, []),
        )
        await page.reload()
        await expect(
            page.getByText("Cadastre áreas para comparar o consumo entre elas."),
        ).toBeVisible()
    })
})
