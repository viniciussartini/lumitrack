import { test, expect, type Page } from "@playwright/test"

import { fulfillJson, fulfillPaginated } from "./support/api"
import { mockAppShellBackground, setupAuth } from "./support/appShell"
import { hideDevTools } from "./support/devtools"
import { AREA_1, DEVICE_1, METER_1, PROP_1 } from "./support/fixtures"

/**
 * E2E focado em UI: mocka as respostas do backend via page.route().
 * Vantagem: não depende do backend rodando — roda no CI sem coordenação.
 *
 * `/relatorios` — seletor cascata de alvo (propriedade → área → dispositivo)
 * reaproveitando a mesma `ConsumptionSection` das details pages, agora com
 * as 4 granularidades (`REPORT_GRANULARITIES`). Sem `useDistributors` — o
 * select de propriedade só precisa do nome, não da distribuidora vinculada.
 *
 * A precedência DEVICE > AREA > PROPERTY na query de `/api/consumption` é o
 * ponto central: `ConsumptionSection` é remontada (`key={targetType-targetId}`)
 * a cada troca de alvo, então a prova real está na query que ela dispara, não
 * só em qual select tem valor.
 */

const PROP_2 = { ...PROP_1, id: "prop-2", name: "Casa de Praia" }

const setupAuthAndProperties = async (page: Page) => {
    await mockAppShellBackground(page)
    await setupAuth(page)

    // pageSize 31 nos três selects — ReportsPage busca o catálogo inteiro do
    // usuário de uma vez (não pagina os próprios seletores).
    await page.route(/\/api\/properties(\?.*)?$/, (route) => {
        if (route.request().method() === "GET") {
            return fulfillPaginated(route, [PROP_1, PROP_2])
        }
        return route.continue()
    })
    await page.route(/\/api\/properties\/prop-1\/areas(\?.*)?$/, (route) =>
        fulfillPaginated(route, [AREA_1]),
    )
    // prop-2 não tem áreas — usado pelo teste de reset de cascata.
    await page.route(/\/api\/properties\/prop-2\/areas(\?.*)?$/, (route) =>
        fulfillPaginated(route, []),
    )
    await page.route(
        /\/api\/properties\/prop-1\/areas\/area-1\/devices(\?.*)?$/,
        (route) => fulfillPaginated(route, [DEVICE_1]),
    )

    // Medidor presente em qualquer alvo — sem isso, ConsumptionSection para
    // no EmptyState "sem medidor" e nunca chega a chamar /api/consumption,
    // que é justamente a chamada que este spec precisa inspecionar.
    await page.route(/\/api\/meters\/by-target(\?.*)?$/, (route) =>
        fulfillJson(route, METER_1),
    )
}

test.describe("Relatórios (/relatorios)", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies()
    })

    test("estado inicial pede pra selecionar uma propriedade, com os selects dependentes desabilitados", async ({
        page,
    }) => {
        await setupAuthAndProperties(page)
        await page.route(/\/api\/consumption(\?.*)?$/, (route) =>
            fulfillPaginated(route, []),
        )

        await page.goto("/relatorios")
        await hideDevTools(page)

        await expect(
            page.getByRole("heading", { name: /^relatórios$/i, level: 1 }),
        ).toBeVisible()
        await expect(
            page.getByText(/selecione uma propriedade para começar/i),
        ).toBeVisible()
        await expect(page.getByTestId("reports-area-select")).toBeDisabled()
        await expect(page.getByTestId("reports-device-select")).toBeDisabled()
        await expect(page.getByTestId("consumption-section")).toHaveCount(0)
        // O banner de placeholder aparece independente de haver alvo selecionado.
        await expect(
            page.getByTestId("reports-placeholder-banner"),
        ).toBeVisible()
    })

    test("cascata propriedade → área → dispositivo ajusta o targetType da consulta (DEVICE > AREA > PROPERTY)", async ({
        page,
    }) => {
        await setupAuthAndProperties(page)

        const consumptionRequests: { targetType: string; targetId: string }[] = []
        await page.route(/\/api\/consumption(\?.*)?$/, (route) => {
            const url = new URL(route.request().url())
            consumptionRequests.push({
                targetType: url.searchParams.get("targetType")!,
                targetId: url.searchParams.get("targetId")!,
            })
            return fulfillPaginated(route, [])
        })

        await page.goto("/relatorios")
        await hideDevTools(page)

        // ─── 1. Seleciona só a propriedade → targetType PROPERTY ─────────────
        await page
            .getByTestId("reports-property-select")
            .selectOption(PROP_1.id)

        await expect(page.getByTestId("consumption-section")).toBeVisible()
        await expect(page.getByTestId("reports-area-select")).toBeEnabled()
        await expect
            .poll(() => consumptionRequests.at(-1))
            .toEqual({ targetType: "PROPERTY", targetId: "prop-1" })

        // ─── 2. Seleciona a área → targetType AREA ────────────────────────────
        await page.getByTestId("reports-area-select").selectOption(AREA_1.id)

        await expect(page.getByTestId("reports-device-select")).toBeEnabled()
        await expect
            .poll(() => consumptionRequests.at(-1))
            .toEqual({ targetType: "AREA", targetId: "area-1" })

        // ─── 3. Seleciona o dispositivo → targetType DEVICE (vence sobre
        // área e propriedade, ambas ainda selecionadas nos outros selects) ────
        await page
            .getByTestId("reports-device-select")
            .selectOption(DEVICE_1.id)

        await expect
            .poll(() => consumptionRequests.at(-1))
            .toEqual({ targetType: "DEVICE", targetId: "device-1" })
    })

    test("trocar de propriedade reseta área e dispositivo selecionados", async ({
        page,
    }) => {
        await setupAuthAndProperties(page)
        await page.route(/\/api\/consumption(\?.*)?$/, (route) =>
            fulfillPaginated(route, []),
        )

        await page.goto("/relatorios")
        await hideDevTools(page)

        await page
            .getByTestId("reports-property-select")
            .selectOption(PROP_1.id)
        await page.getByTestId("reports-area-select").selectOption(AREA_1.id)
        await page
            .getByTestId("reports-device-select")
            .selectOption(DEVICE_1.id)

        await expect(page.getByTestId("reports-area-select")).toHaveValue(
            AREA_1.id,
        )
        await expect(page.getByTestId("reports-device-select")).toHaveValue(
            DEVICE_1.id,
        )

        // Troca pra outra propriedade (sem áreas) — reseta área e dispositivo,
        // e os dois selects voltam a ficar desabilitados.
        await page
            .getByTestId("reports-property-select")
            .selectOption(PROP_2.id)

        await expect(page.getByTestId("reports-area-select")).toHaveValue("")
        await expect(page.getByTestId("reports-device-select")).toHaveValue("")
        await expect(page.getByTestId("reports-area-select")).toBeDisabled()
        await expect(page.getByTestId("reports-device-select")).toBeDisabled()
    })
})
