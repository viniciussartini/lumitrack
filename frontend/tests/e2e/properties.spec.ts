import { test, expect } from "@playwright/test"

import { fulfillError, fulfillJson, fulfillPaginated } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { hideDevTools } from "./support/devtools"
import { DIST_CEMIG } from "./support/fixtures"
import type { Property } from "../../src/types/property.types"

/**
 * E2E focado em UI: mocka as respostas do backend via page.route().
 * Vantagem: não depende do backend rodando — roda no CI sem coordenação.
 *
 * Este spec cobre o fluxo completo de Property:
 *   1. Listar (vazio inicial)
 *   2. Criar (via modal, sem navegação — #97 substituiu as 6 rotas
 *      dedicadas de CRUD por PropertyFormDialog/AreaFormDialog/
 *      DeviceFormDialog)
 *   3. Editar (mudar nome, via modal aberto na própria PropertyDetailsPage)
 *   4. Trocar distribuidora vinculada (mesmo modal)
 *   5. Excluir
 *
 * Reescrito na sub-issue #102 — a versão anterior assumia rotas /nova e
 * /:id/editar que não existem mais desde #97, e labels de botão que
 * divergiram por entidade desde então (ver properties/area/device
 * FormDialog.tsx: cada um tem seu próprio texto de kicker/título/submit).
 */

const DIST_ENEL = {
    ...DIST_CEMIG,
    id: "dist-enel",
    name: "ENEL São Paulo",
    cnpj: "61.695.227/0001-93",
}

/**
 * Configura mocks compartilhados (auth + AppShell + distribuidoras).
 *
 * Não mocka /api/properties aqui — cada teste configura suas próprias
 * respostas pra controlar o estado da lista.
 */
const setupAuthAndDistributors = async (page: Parameters<typeof setupAuth>[0]) => {
    await mockAppShellBackground(page)
    await setupAuth(page)

    // Catálogo de distribuidoras — usado pela PropertiesPage, NewPropertyPage
    // e EditPropertyPage (todas com pageSize=31, cobrindo o catálogo inteiro
    // numa página só). fulfillPaginated ignora os query params recebidos.
    await page.route(/\/api\/distributors(\?.*)?$/, (route) =>
        fulfillPaginated(route, [DIST_CEMIG, DIST_ENEL]),
    )
    // Detalhe por ID — usado pela PropertyDetailsPage via useDistributor.
    await page.route("**/api/distributors/dist-cemig", (route) =>
        fulfillJson(route, DIST_CEMIG),
    )
    await page.route("**/api/distributors/dist-enel", (route) =>
        fulfillJson(route, DIST_ENEL),
    )

    // Áreas: lista vazia por default (testes de Property não mexem em áreas).
    await page.route(/\/api\/properties\/.*\/areas(\?.*)?$/, (route) => {
        if (route.request().method() === "GET") {
            return fulfillPaginated(route, [])
        }
        return route.continue()
    })

    // MeterSection é renderizada em toda PropertyDetailsPage — sem medidor
    // vinculado, 404 é o estado normal (meterService.byTarget trata como
    // null). Nenhum teste deste spec cobre medidor.
    await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) =>
        fulfillError(route, "Alvo sem medidor vinculado", 404),
    )
}

test.describe("Fluxo CRUD de propriedades", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("cria, edita, troca distribuidora e exclui uma propriedade", async ({
        page,
    }) => {
        await setupAuthAndDistributors(page)

        // Estado da "DB" simulada — começa vazio, evolui ao longo do teste
        let properties: Property[] = []

        await page.route(/\/api\/properties(\?.*)?$/, async (route) => {
            const method = route.request().method()

            if (method === "GET") {
                return fulfillPaginated(route, properties)
            }

            if (method === "POST") {
                const body = JSON.parse(route.request().postData() ?? "{}")
                const created: Property = {
                    id: "prop-1",
                    userId: "user-123",
                    distributorId: body.distributorId,
                    name: body.name,
                    address: body.address ?? null,
                    city: body.city ?? null,
                    state: body.state ?? null,
                    zipCode: body.zipCode ?? null,
                    electricalSystem: body.electricalSystem,
                    billingClass: body.billingClass,
                    publicLightingFeeBrl: body.publicLightingFeeBrl ?? null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                }
                properties = [created]
                return fulfillJson(route, created, 201)
            }

            return route.continue()
        })

        await page.route("**/api/properties/prop-1", async (route) => {
            const method = route.request().method()

            if (method === "GET") {
                return fulfillJson(route, properties[0])
            }

            if (method === "PUT") {
                const body = JSON.parse(route.request().postData() ?? "{}")
                properties[0] = {
                    ...properties[0]!,
                    ...body,
                    updatedAt: new Date().toISOString(),
                }
                return fulfillJson(route, properties[0])
            }

            if (method === "DELETE") {
                properties = []
                return route.fulfill({ status: 204 })
            }

            return route.continue()
        })

        // ─── 1. Lista vazia inicialmente ─────────────────────────────────────
        await page.goto("/propriedades")
        await hideDevTools(page)

        await expect(
            page.getByRole("heading", { name: /propriedades/i, level: 1 }),
        ).toBeVisible()
        await expect(
            page.getByText(/nenhuma propriedade cadastrada/i),
        ).toBeVisible()

        // ─── 2. Criar nova propriedade (via modal) ───────────────────────────
        await page
            .getByRole("button", { name: /cadastrar primeira propriedade/i })
            .click()
        const createDialog = page.getByRole("dialog", {
            name: /adicionar propriedade/i,
        })
        await expect(createDialog).toBeVisible()

        await page.getByLabel(/nome da propriedade/i).fill("Casa Principal")
        await page
            .getByLabel(/distribuidora vinculada/i)
            .selectOption("dist-cemig")
        await page.getByLabel(/logradouro/i).fill("Rua das Flores, 100")
        await page.getByLabel(/cidade/i).fill("Belo Horizonte")
        await page.getByLabel(/^uf$/i).selectOption("MG")
        await page.getByLabel(/cep/i).fill("30000000")

        await page.getByRole("button", { name: /criar propriedade/i }).click()

        // Modal fecha, sem navegação — o card aparece na mesma /propriedades
        await expect(createDialog).not.toBeVisible()
        await expect(page).toHaveURL(/\/propriedades$/)
        await expect(page.getByTestId("property-card-prop-1")).toBeVisible()
        await expect(page.getByText(/cemig/i).first()).toBeVisible()

        // ─── 3. Detalhes → Editar (via botão "Editar" no header, modal) ──────
        // Click no card vai pra detalhes.
        await page.getByTestId("property-card-prop-1").click()
        await expect(page).toHaveURL(/\/propriedades\/prop-1$/)

        // Header da details mostra o nome e a distribuidora
        await expect(
            page.getByRole("heading", { level: 1, name: /casa principal/i }),
        ).toBeVisible()
        await expect(page.getByText(/cemig/i).first()).toBeVisible()
        // Faturamento migrado da distribuidora pra propriedade (Fase 1) —
        // não selecionamos electricalSystem/billingClass no form, então
        // valem os defaults do PropertyForm (MONOPHASIC/B1).
        await expect(page.getByText(/monofásico/i)).toBeVisible()
        await expect(page.getByText(/b1 — residencial/i)).toBeVisible()
        // Seção de áreas — EmptyState
        await expect(page.getByText(/nenhuma área cadastrada/i)).toBeVisible()

        // Botão "Editar" (só o verbo, desde #99) abre o modal de edição —
        // sem navegar, o título do dialog é que diz "Editar propriedade".
        await page.getByRole("button", { name: /^editar$/i }).click()
        const editDialog = page.getByRole("dialog", {
            name: /editar propriedade/i,
        })
        await expect(editDialog).toBeVisible()

        const nameInput = page.getByLabel(/nome da propriedade/i)
        await nameInput.fill("Casa Renovada")
        await page.getByRole("button", { name: /salvar alterações/i }).click()

        // Modal fecha, permanece na details (não navega pra lista)
        await expect(editDialog).not.toBeVisible()
        await expect(page).toHaveURL(/\/propriedades\/prop-1$/)
        await expect(
            page.getByRole("heading", { level: 1, name: /casa renovada/i }),
        ).toBeVisible()

        // ─── 4. Trocar distribuidora (mesmo botão "Editar", ainda na details) ─
        await page.getByRole("button", { name: /^editar$/i }).click()
        await expect(editDialog).toBeVisible()

        await page
            .getByLabel(/distribuidora vinculada/i)
            .selectOption("dist-enel")
        await page.getByRole("button", { name: /salvar alterações/i }).click()

        await expect(editDialog).not.toBeVisible()
        await expect(page).toHaveURL(/\/propriedades\/prop-1$/)
        // Tag da distribuidora na details agora mostra ENEL
        await expect(page.getByText(/enel são paulo/i)).toBeVisible()

        // ─── 5. Excluir (via menu ⋯ no header da details) ────────────────────
        await page
            .getByRole("button", { name: /opções de Casa Renovada/i })
            .click()
        await page.getByRole("menuitem", { name: /excluir/i }).click()

        // ConfirmDialog abre
        await expect(
            page.getByRole("heading", { name: /excluir propriedade/i }),
        ).toBeVisible()

        await page.getByRole("button", { name: "Excluir" }).click()

        // onAfterDelete navega de volta pra lista, empty state restaurado
        await expect(page).toHaveURL(/\/propriedades$/)
        await expect(
            page.getByText(/nenhuma propriedade cadastrada/i),
        ).toBeVisible()
        await expect(
            page.getByTestId("property-card-prop-1"),
        ).not.toBeVisible()
    })

    test("sem distribuidora cadastrada, o modal abre mas o submit é bloqueado por validação", async ({
        page,
    }) => {
        // A antiga NewPropertyPage bloqueava a criação inteira com um
        // EmptyState ("catálogo de distribuidoras indisponível") quando o
        // catálogo estava vazio — esse guard não existe mais: PropertyForm
        // (usado dentro do modal desde #97) sempre renderiza o form, com o
        // select de distribuidora vazio (só a opção desabilitada
        // "Selecione"). O usuário só descobre o problema ao submeter, via a
        // validação client-side normal do campo obrigatório. Gap real de
        // comportamento, fora do escopo de #102 (reescrita de teste, não de
        // feature) — documentado aqui e no CHANGELOG.
        await mockAppShellBackground(page)
        await setupAuth(page)
        await page.route(/\/api\/properties(\?.*)?$/, (route) => {
            if (route.request().method() === "GET") {
                return fulfillPaginated(route, [])
            }
            return route.continue()
        })
        // Catálogo vazio
        await page.route(/\/api\/distributors(\?.*)?$/, (route) =>
            fulfillPaginated(route, []),
        )

        await page.goto("/propriedades")
        await hideDevTools(page)

        await page
            .getByRole("button", { name: /cadastrar primeira propriedade/i })
            .click()
        const createDialog = page.getByRole("dialog", {
            name: /adicionar propriedade/i,
        })
        await expect(createDialog).toBeVisible()

        // O form renderiza normalmente — só não há opção de distribuidora
        // além do placeholder desabilitado.
        await expect(page.getByLabel(/nome da propriedade/i)).toBeVisible()
        const distributorSelect = page.getByLabel(/distribuidora vinculada/i)
        await expect(distributorSelect.getByRole("option")).toHaveCount(1)

        await page.getByLabel(/nome da propriedade/i).fill("Sítio")
        await page.getByRole("button", { name: /criar propriedade/i }).click()

        await expect(
            page.getByText(/selecione uma distribuidora/i),
        ).toBeVisible()
        // Continua no modal — não foi possível submeter
        await expect(createDialog).toBeVisible()
    })
})
