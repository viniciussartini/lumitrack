import { test, expect, type Page } from "@playwright/test"

import { fulfillError, fulfillJson, fulfillPaginated } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { expandAndSettle } from "./support/collapse"
import { hideDevTools } from "./support/devtools"
import { AREA_1, DEVICE_1, DIST_CEMIG, PROP_1 } from "./support/fixtures"
import type { PropertyTree } from "../../src/types/property.types"

/**
 * E2E de Configurações → Cadastro: chegada pelo menu do usuário, redirect de
 * `/configuracoes` e criação de Área e Dispositivo escolhendo o pai dentro do
 * modal. Backend mockado via `page.route()`, como nos demais specs.
 */

const PROP_2 = { ...PROP_1, id: "prop-2", name: "Loja Centro" }
const AREA_2 = { ...AREA_1, id: "area-2", propertyId: "prop-2", name: "Balcão" }

const EMPTY_TREE: PropertyTree = { items: [], total: 0 }

const setupCadastro = async (
    page: Page,
    properties = [PROP_1, PROP_2],
    getTree: () => PropertyTree = () => EMPTY_TREE,
) => {
    await mockAppShellBackground(page)
    await setupAuth(page)

    await page.route(/\/api\/distributors(\?.*)?$/, (route) =>
        fulfillPaginated(route, [DIST_CEMIG]),
    )
    await page.route(/\/api\/properties(\?.*)?$/, (route) =>
        route.request().method() === "GET" ? fulfillPaginated(route, properties) : route.fallback(),
    )
    // Sem este mock a árvore vazaria para o backend real e o 401 devolveria
    // o usuário ao login no meio do teste.
    await page.route("**/api/properties/tree", (route) => fulfillJson(route, getTree()))
}

const TREE: PropertyTree = {
    total: 1,
    items: [
        {
            id: PROP_1.id,
            name: "Casa",
            areas: [
                {
                    id: AREA_1.id,
                    name: "Cozinha",
                    devices: [{ id: DEVICE_1.id, name: "Geladeira", powerWatts: 150 }],
                },
            ],
        },
    ],
}

// Duas propriedades, cada uma com uma área: alimenta os seletores de pai dos
// modais de Área e Dispositivo.
const TWO_PROPERTIES_TREE: PropertyTree = {
    total: 2,
    items: [
        {
            id: PROP_1.id,
            name: PROP_1.name,
            areas: [{ id: AREA_1.id, name: AREA_1.name, devices: [] }],
        },
        {
            id: PROP_2.id,
            name: PROP_2.name,
            areas: [{ id: AREA_2.id, name: AREA_2.name, devices: [] }],
        },
    ],
}

const renameArea = (tree: PropertyTree, name: string): PropertyTree => ({
    ...tree,
    items: tree.items.map((property) => ({
        ...property,
        areas: property.areas.map((area) => ({ ...area, name })),
    })),
})

test.describe("Configurações → Cadastro", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("o menu do usuário leva a Configurações → Cadastro", async ({ page }) => {
        await setupCadastro(page)
        await page.route(/\/api\/consumption(\?.*)?$/, (route) => fulfillPaginated(route, []))
        await page.route(/\/api\/consumption\/summary(\?.*)?$/, (route) =>
            fulfillJson(route, { items: [] }),
        )
        await page.route(/\/api\/tariff-flag(\?.*)?$/, (route) => route.fulfill({ status: 404 }))
        await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) =>
            fulfillError(route, "Alvo sem medidor vinculado", 404),
        )
        await page.goto("/dashboard")
        await hideDevTools(page)

        await page.getByRole("button", { name: /menu do usuário/i }).click()
        await page.getByRole("menuitem", { name: /configurações/i }).click()

        await expect(page).toHaveURL(/\/configuracoes\/cadastro$/)
        await expect(page.getByRole("heading", { name: "Cadastro", level: 1 })).toBeVisible()
        await expect(
            page.getByRole("navigation", { name: "Configurações" }).getByRole("link", {
                name: "Cadastro",
            }),
        ).toHaveAttribute("aria-current", "page")
    })

    test("/configuracoes redireciona para o Cadastro", async ({ page }) => {
        await setupCadastro(page)
        await page.goto("/configuracoes")

        await expect(page).toHaveURL(/\/configuracoes\/cadastro$/)
    })

    test("cria uma propriedade pelo cartão e a envia com os dados do formulário", async ({
        page,
    }) => {
        await setupCadastro(page, [])
        let postedBody: unknown
        await page.route(/\/api\/properties(\?.*)?$/, (route) => {
            if (route.request().method() !== "POST") return route.fallback()
            postedBody = JSON.parse(route.request().postData() ?? "{}")
            return fulfillJson(route, { ...PROP_1, name: "Casa de Campo" }, 201)
        })
        await page.goto("/configuracoes/cadastro")
        await hideDevTools(page)

        await page.getByRole("button", { name: /nova propriedade/i }).click()
        const dialog = page.getByRole("dialog", { name: /adicionar propriedade/i })
        await dialog.getByLabel(/nome da propriedade/i).fill("Casa de Campo")
        await dialog.getByLabel(/distribuidora vinculada/i).selectOption("dist-cemig")
        await dialog.getByLabel(/logradouro/i).fill("Estrada Velha, 10")
        await dialog.getByLabel(/cidade/i).fill("Belo Horizonte")
        await dialog.getByLabel(/^uf$/i).selectOption("MG")
        await dialog.getByLabel(/cep/i).fill("30000000")
        await dialog.getByRole("button", { name: /criar propriedade/i }).click()

        await expect(dialog).toBeHidden()
        expect(postedBody).toMatchObject({
            name: "Casa de Campo",
            distributorId: "dist-cemig",
            city: "Belo Horizonte",
            state: "MG",
        })
    })

    test("bloqueia criar propriedade quando não há distribuidora cadastrada", async ({ page }) => {
        await setupCadastro(page, [])
        // Catálogo vazio — registrado depois do de `setupCadastro`, que ele sobrepõe.
        await page.route(/\/api\/distributors(\?.*)?$/, (route) => fulfillPaginated(route, []))
        await page.goto("/configuracoes/cadastro")
        await hideDevTools(page)

        await page.getByRole("button", { name: /nova propriedade/i }).click()
        const dialog = page.getByRole("dialog", { name: /adicionar propriedade/i })

        await expect(dialog.getByText(/catálogo de distribuidoras indisponível/i)).toBeVisible()
        await expect(
            dialog.getByRole("link", { name: /ver catálogo de distribuidoras/i }),
        ).toHaveAttribute("href", "/distribuidoras")
        await expect(page.getByLabel(/nome da propriedade/i)).toBeHidden()
    })

    test("validação bloqueia criar área com nome vazio", async ({ page }) => {
        await setupCadastro(page, [PROP_1], () => TREE)
        await page.goto("/configuracoes/cadastro")
        await hideDevTools(page)

        await page.getByRole("button", { name: /nova área/i }).click()
        const dialog = page.getByRole("dialog", { name: /adicionar área/i })
        await dialog.getByRole("button", { name: /criar área/i }).click()

        await expect(dialog.getByText(/nome é obrigatório/i)).toBeVisible()
        await expect(dialog).toBeVisible()

        // Sem passar pelo campo "nome": o clique direto no envio já mostra os dois erros.
        await dialog.getByLabel(/descrição/i).fill("a".repeat(1001))
        await dialog.getByRole("button", { name: /criar área/i }).click()
        await expect(dialog.getByText(/nome é obrigatório/i)).toBeVisible()
        await expect(dialog.getByText(/descrição muito longa/i)).toBeVisible()
    })

    test("cria uma área na propriedade escolhida no modal", async ({ page }) => {
        await setupCadastro(page, [PROP_1, PROP_2], () => TWO_PROPERTIES_TREE)
        let postedTo = ""
        let postedBody: unknown
        await page.route(/\/api\/properties\/prop-\d\/areas$/, (route) => {
            postedTo = new URL(route.request().url()).pathname
            postedBody = JSON.parse(route.request().postData() ?? "{}")
            return fulfillJson(route, { ...AREA_2, name: "Estoque" }, 201)
        })
        await page.goto("/configuracoes/cadastro")
        await hideDevTools(page)

        await page.getByRole("button", { name: /nova área/i }).click()
        const dialog = page.getByRole("dialog", { name: /adicionar área/i })
        await expect(dialog.getByLabel("Propriedade")).toHaveValue("prop-1")

        await dialog.getByLabel("Propriedade").selectOption("prop-2")
        await dialog.getByLabel(/nome da área/i).fill("Estoque")
        await dialog.getByRole("button", { name: /criar área/i }).click()

        await expect(dialog).toBeHidden()
        expect(postedTo).toBe("/api/properties/prop-2/areas")
        expect(postedBody).toEqual({ name: "Estoque" })
    })

    test("cria um dispositivo na área escolhida no modal, agrupada por propriedade", async ({
        page,
    }) => {
        await setupCadastro(page, [PROP_1, PROP_2], () => TWO_PROPERTIES_TREE)
        let postedTo = ""
        await page.route(/\/api\/properties\/prop-\d\/areas\/area-\d\/devices$/, (route) => {
            postedTo = new URL(route.request().url()).pathname
            return fulfillJson(route, { ...DEVICE_1, name: "Geladeira" }, 201)
        })
        await page.goto("/configuracoes/cadastro")
        await hideDevTools(page)

        await page.getByRole("button", { name: /novo dispositivo/i }).click()
        const dialog = page.getByRole("dialog", { name: /adicionar dispositivo/i })
        const areaSelect = dialog.getByLabel("Área")
        await expect(areaSelect.locator("optgroup")).toHaveCount(2)

        await areaSelect.selectOption("area-2")
        await dialog.getByLabel(/nome do dispositivo/i).fill("Geladeira")
        await dialog.getByRole("button", { name: /criar dispositivo/i }).click()

        await expect(dialog).toBeHidden()
        expect(postedTo).toBe("/api/properties/prop-2/areas/area-2/devices")
    })

    test("sem propriedades, Nova área e Novo dispositivo ficam desabilitados", async ({ page }) => {
        await setupCadastro(page, [])
        await page.goto("/configuracoes/cadastro")

        await expect(page.getByText(/cadastre uma propriedade primeiro/i)).toBeVisible()
        await expect(page.getByRole("button", { name: /nova área/i })).toBeDisabled()
        await expect(page.getByRole("button", { name: /novo dispositivo/i })).toBeDisabled()
        await expect(page.getByRole("button", { name: /nova propriedade/i })).toBeEnabled()
    })

    test("mostra a estrutura cadastrada e expande até os dispositivos", async ({ page }) => {
        await setupCadastro(page, [PROP_1], () => TREE)
        await page.goto("/configuracoes/cadastro")
        await hideDevTools(page)

        const casa = page.getByRole("button", { name: /^casa/i })
        await expect(casa).toHaveAttribute("aria-expanded", "false")
        await expect(casa).toContainText("1 área · 1 dispositivo")
        // Recolhido: fora da árvore de acessibilidade (aria-hidden + inert).
        await expect(page.getByRole("button", { name: /^cozinha/i })).toHaveCount(0)

        await expandAndSettle(casa)
        await page.getByRole("button", { name: /^cozinha/i }).click()

        await expect(page.getByText("Geladeira", { exact: true })).toBeVisible()
        await expect(page.getByText("150 W")).toBeVisible()
    })

    test("edita uma área pela árvore e a árvore reflete o novo nome", async ({ page }) => {
        let tree = TREE
        await setupCadastro(page, [PROP_1], () => tree)
        let putBody: unknown
        await page.route("**/api/properties/prop-1/areas/area-1", (route) => {
            if (route.request().method() === "PUT") {
                putBody = JSON.parse(route.request().postData() ?? "{}")
                tree = renameArea(TREE, "Copa")
                return fulfillJson(route, { ...AREA_1, name: "Copa" })
            }
            return fulfillJson(route, AREA_1)
        })
        await page.goto("/configuracoes/cadastro")
        await hideDevTools(page)

        await expandAndSettle(page.getByRole("button", { name: /^casa/i }))
        await page.getByRole("button", { name: "Editar área Cozinha" }).click()
        const dialog = page.getByRole("dialog", { name: /editar área/i })
        await dialog.getByLabel(/nome da área/i).fill("Copa")
        await dialog.getByRole("button", { name: /salvar área/i }).click()

        await expect(dialog).toBeHidden()
        expect(putBody).toMatchObject({ name: "Copa" })
        await expect(page.getByRole("button", { name: /^copa/i })).toBeVisible()
    })

    test("exclui uma propriedade pela árvore só depois de confirmar", async ({ page }) => {
        let tree = TREE
        await setupCadastro(page, [PROP_1], () => tree)
        let deleted = false
        await page.route("**/api/properties/prop-1", (route) => {
            if (route.request().method() === "DELETE") {
                deleted = true
                tree = EMPTY_TREE
                return route.fulfill({ status: 204 })
            }
            return fulfillJson(route, PROP_1)
        })
        await page.goto("/configuracoes/cadastro")
        await hideDevTools(page)

        await page.getByRole("button", { name: "Excluir propriedade Casa" }).click()
        const dialog = page.getByRole("dialog", { name: /excluir propriedade/i })
        expect(deleted).toBe(false)

        await dialog.getByRole("button", { name: /^excluir$/i }).click()

        await expect(dialog).toBeHidden()
        expect(deleted).toBe(true)
        await expect(page.getByText(/nenhuma propriedade cadastrada/i)).toBeVisible()
    })

    test("exclui uma área pela árvore só depois de confirmar", async ({ page }) => {
        let tree = TREE
        await setupCadastro(page, [PROP_1], () => tree)
        let deleted = false
        await page.route("**/api/properties/prop-1/areas/area-1", (route) => {
            if (route.request().method() === "DELETE") {
                deleted = true
                tree = { ...TREE, items: [{ ...TREE.items[0]!, areas: [] }] }
                return route.fulfill({ status: 204 })
            }
            return fulfillJson(route, AREA_1)
        })
        await page.goto("/configuracoes/cadastro")
        await hideDevTools(page)

        await expandAndSettle(page.getByRole("button", { name: /^casa/i }))
        await page.getByRole("button", { name: "Excluir área Cozinha" }).click()
        const dialog = page.getByRole("dialog", { name: /excluir área/i })
        await expect(dialog).toContainText(/dispositivos/i)
        expect(deleted).toBe(false)

        await dialog.getByRole("button", { name: /^excluir$/i }).click()

        await expect(dialog).toBeHidden()
        expect(deleted).toBe(true)
        await expect(page.getByText("0 áreas · 0 dispositivos")).toBeVisible()
    })
})
