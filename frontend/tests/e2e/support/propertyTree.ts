import type { Page } from "@playwright/test"

import { fulfillJson } from "./api"
import { AREA_1, PROP_1 } from "./fixtures"
import type { PropertyTree } from "../../../src/types/property.types"

/** Árvore com a propriedade e a área das fixtures, sem dispositivos. */
export const PROPERTY_TREE_1: PropertyTree = {
    total: 1,
    items: [
        {
            id: PROP_1.id,
            name: PROP_1.name,
            areas: [{ id: AREA_1.id, name: AREA_1.name, devices: [] }],
        },
    ],
}

/**
 * Mocka `GET /api/properties/tree`, que a árvore de Análise dispara em toda
 * rota `/propriedades*`. Sem o mock a chamada vaza para o backend real e o
 * 401 devolve o usuário ao login no meio do teste (ver `support/appShell.ts`).
 * `getTree` é uma função para o spec poder mudar a árvore ao longo do fluxo.
 */
export const mockPropertyTree = (page: Page, getTree: () => PropertyTree = () => PROPERTY_TREE_1) =>
    page.route("**/api/properties/tree", (route) => fulfillJson(route, getTree()))
