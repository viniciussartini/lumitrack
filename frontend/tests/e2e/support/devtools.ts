import type { Page } from "@playwright/test"

/**
 * Oculta o TanStack Query DevTools via CSS injetado.
 *
 * O botão flutuante remonta a cada invalidação de query e volta a interceptar
 * pointer events sobre outros controles da página — causa raiz de uma leva de
 * cliques flakeados (diagnosticado originalmente no antigo consumption.spec).
 *
 * No CI isto é no-op: o job roda contra `vite preview` (build de produção) e o
 * DevTools é gated por `import.meta.env.DEV`, então nem existe no bundle.
 * Continua necessário localmente, onde o webServer é `vite dev`.
 *
 * Chame DEPOIS do `goto` — `addStyleTag` injeta no documento atual, e uma
 * navegação posterior descarta o style.
 */
export const hideDevTools = (page: Page) =>
    page.addStyleTag({
        content: ".tsqd-parent-container { display: none !important; }",
    })
