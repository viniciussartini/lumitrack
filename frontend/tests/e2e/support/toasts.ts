import type { Page } from "@playwright/test"

/**
 * Faz os toasts (sonner) deixarem os cliques passarem para o que está embaixo.
 *
 * Os toasts ficam no canto superior direito, o mesmo lugar dos controles do
 * cabeçalho e dos menus que abrem dele. Empilhados (criar → editar → editar),
 * cobrem o item do menu, e o sonner não os descarta enquanto o ponteiro está
 * sobre eles ou o documento é considerado oculto (com vários navegadores em
 * paralelo isso acontece): o clique no menu passa a ser interceptado pelo
 * toast indefinidamente, e o teste só termina no timeout. Fechar o toast pelo
 * botão não resolve — sob a mesma carga ele nunca fica "estável" para o
 * Playwright. Com `pointer-events: none` o toast continua visível e com o
 * texto disponível para asserção, mas nunca intercepta um clique.
 *
 * Só para specs que não interagem com os toasts: quem clica em "Close toast"
 * ou no "Ver" precisa dos eventos de ponteiro e não deve chamar isto.
 *
 * Chame DEPOIS do `goto` — `addStyleTag` injeta no documento atual, e uma
 * navegação posterior descarta o style.
 */
export const letClicksPassThroughToasts = (page: Page) =>
    page.addStyleTag({
        content: "[data-sonner-toaster], [data-sonner-toast] { pointer-events: none !important; }",
    })
