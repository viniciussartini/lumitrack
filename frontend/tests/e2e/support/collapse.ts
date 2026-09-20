import { expect, type Locator } from "@playwright/test"

/**
 * Expande uma linha recolhível e só devolve quando a transição de altura do
 * painel que ela controla (`aria-controls`, classe `lt-collapse`) terminou.
 *
 * O painel entra no DOM já interativo, mas cresce por ~0,5 s. O Playwright
 * considera o botão de dentro "estável" logo (ele não muda de posição, só é
 * revelado aos poucos) e clica no meio da animação; sob carga o clique
 * acontece com o botão ainda sendo revelado e o `click` nunca chega ao
 * handler, sem nenhum erro — o passo seguinte do teste só descobre por
 * timeout. Esperar as animações (Web Animations API, sem espera fixa) faz o
 * clique acontecer sempre com o painel já assentado.
 *
 * Animações infinitas (`animate-pulse`/`animate-spin` de esqueletos de
 * carregamento) são ignoradas: nunca terminam e prenderiam o helper até o
 * timeout do teste. Resíduo conhecido: se a transição ainda não tiver começado
 * no instante da consulta, `getAnimations()` volta vazia e o helper não espera
 * nada; na prática o `aria-expanded` só muda no mesmo commit que dispara a
 * transição, então ela já existe quando a consulta roda.
 *
 * @param toggle - O botão da linha (`aria-expanded` + `aria-controls`).
 */
export const expandAndSettle = async (toggle: Locator): Promise<void> => {
    await toggle.click()
    await expect(toggle).toHaveAttribute("aria-expanded", "true")

    await toggle.evaluate((button) => {
        const panel = document.getElementById(button.getAttribute("aria-controls") ?? "")
        const finite = (panel?.getAnimations({ subtree: true }) ?? []).filter(
            (animation) => animation.effect?.getComputedTiming().iterations !== Infinity,
        )
        return Promise.allSettled(finite.map((animation) => animation.finished)).then(
            () => undefined,
        )
    })
}
