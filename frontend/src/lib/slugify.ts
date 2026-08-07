/** `"Política de Privacidade" → "politica-de-privacidade"` — determinístico,
 * usado tanto pro `id` de cada `h2` renderizado a partir de markdown quanto
 * pro `href` de qualquer TOC que aponte pra ele (mesma função, nunca diverge).
 * Promovido de `LegalDocumentPage.tsx` quando `industryMarkdownComponents`
 * virou o 2º consumidor real.
 *
 * `\p{Mn}` (Unicode "Mark, Nonspacing") depois do NFD casa os acentos
 * decompostos ("á" → "a" + combining acute) — mais preciso que hardcodar o
 * range U+0300-U+036F à mão. */
export const slugify = (text: string): string =>
    text
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Mn}/gu, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
