// Formatador CSV dos relatórios. Convenções pensadas para abrir direto no
// Excel em pt-BR: separador ";", decimal com vírgula e BOM UTF-8 (sem ele os
// acentos viram lixo).

export type CsvCell = string | number | null

const SEPARATOR = ";"
const LINE_BREAK = "\r\n"
const UTF8_BOM = "﻿"

// Caracteres que fazem uma planilha interpretar a célula como fórmula. Nomes
// de propriedade/área/dispositivo são texto livre do usuário e o arquivo pode
// ser aberto por terceiros (envio agendado), então o texto é neutralizado.
const FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r"]

/**
 * Formata uma célula: ausência ("-", nunca 0), número com vírgula decimal, ou
 * texto neutralizado contra injeção de fórmula e escapado quando necessário.
 *
 * @param value - Valor da célula; `null` representa grandeza ausente.
 */
export function csvCell(value: CsvCell): string {
    if (value === null) return "-"
    if (typeof value === "number") {
        return Number.isFinite(value) ? String(value).replace(".", ",") : "-"
    }
    // "-" sozinho é o marcador de ausência, inofensivo como fórmula.
    const safe =
        value !== "-" && FORMULA_TRIGGERS.some((c) => value.startsWith(c)) ? `'${value}` : value
    return /[;"\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

/**
 * Monta o CSV completo a partir de linhas de células.
 *
 * @param rows - Linhas do arquivo (cabeçalhos inclusos, como a primeira linha).
 * @returns O arquivo em bytes, com BOM UTF-8.
 */
export function buildCsv(rows: CsvCell[][]): Buffer {
    const body = rows.map((row) => row.map(csvCell).join(SEPARATOR)).join(LINE_BREAK)
    return Buffer.from(UTF8_BOM + body + LINE_BREAK, "utf8")
}
