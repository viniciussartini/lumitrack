/**
 * Dispara o download de um conteúdo em texto como arquivo.
 *
 * Encapsulamento intencional:
 *   Toda a manipulação de Blob + URL.createObjectURL + <a> + click +
 *   revokeObjectURL fica num único lugar. O componente que precisa
 *   baixar arquivo só chama `downloadFile(...)` — não lida com DOM.
 *
 * Isso permite mockar nos testes do botão (vi.mock do módulo inteiro)
 * em vez de mockar Blob, URL.createObjectURL e document.createElement
 * separadamente. Mais limpo e mais robusto.
 *
 * Compatibilidade:
 *   URL.createObjectURL é suportado em todos os browsers modernos
 *   (incluindo Safari iOS). Atributo `download` requer same-origin
 *   ou data URLs — Blob URL é same-origin por definição, então funciona.
 *
 * Cleanup:
 *   Chamamos URL.revokeObjectURL DEPOIS de um setTimeout(0) porque
 *   alguns browsers (especialmente Safari) cancelam o download se o
 *   blob URL é revogado no mesmo tick do click. setTimeout 0 espera
 *   o navegador iniciar o download antes de liberar o URL.
 */
export const downloadFile = (filename: string, mimeType: string, content: string): void => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)

    const link = document.createElement("a")
    link.href = url
    link.download = filename
    // O <a> precisa estar no DOM em alguns browsers (Firefox) para
    // que o click programático dispare o download.
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    // Defer cleanup — ver comentário acima sobre Safari.
    setTimeout(() => URL.revokeObjectURL(url), 0)
}
