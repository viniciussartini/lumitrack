/**
 * Presets de data para o filtro de Relatório.
 *
 * Por que módulo separado e não inline no componente:
 *   1. Lógica de data tem MUITAS pegadinhas — primeiro dia do ano, fim
 *      de mês, fuso horário, dias com 23/25h por DST. Vale testar
 *      isolado, sem render de React.
 *   2. Funções puras (recebem `now`, retornam `{from, to}`) permitem
 *      mockar a data atual nos testes sem `vi.setSystemTime` global.
 *   3. Reuso futuro: dashboards e charts de consumption.ts também
 *      podem precisar de "este mês" / "últimos 30 dias".
 *
 * Formato de saída: `YYYY-MM-DD` (sem tempo, sem TZ). Mesma string
 * que o `<input type="date">` produz nativamente e que o backend
 * aceita via z.coerce.date(). Construído manualmente em vez de
 * `.toISOString().slice(0, 10)` porque toISOString usa UTC — em
 * America/Sao_Paulo (UTC-3), no fim do dia 31/01 isso vira "01-02"
 * no UTC e quebraria "Este mês".
 */

export type DatePresetId = "this-month" | "last-30-days" | "this-year"

export interface DatePresetRange {
    dateFrom: string
    dateTo: string
}

/**
 * Formata um Date como "YYYY-MM-DD" usando os componentes locais.
 * Evita o bug de TZ comentado acima.
 */
const toLocalDateString = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

/**
 * "Este mês" — do dia 1 do mês corrente até hoje.
 *
 * Decisão: vai até HOJE, não até o último dia do mês. Mostrar dias
 * futuros num gráfico de consumo seria ruído (não há dados ainda).
 * Mesmo padrão de "MTD" — Month To Date — usado em dashboards
 * financeiros.
 */
export const thisMonthRange = (now: Date = new Date()): DatePresetRange => {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    return {
        dateFrom: toLocalDateString(start),
        dateTo: toLocalDateString(now),
    }
}

/**
 * "Últimos 30 dias" — janela móvel, terminando hoje.
 *
 * Inclui hoje (= 30 dias incluindo o atual). Para um intervalo móvel,
 * setDate(getDate() - 29) é o jeito certo: 29 dias antes + hoje = 30.
 * Usar -30 daria 31 dias incluindo hoje.
 */
export const last30DaysRange = (now: Date = new Date()): DatePresetRange => {
    const start = new Date(now)
    start.setDate(now.getDate() - 29)
    return {
        dateFrom: toLocalDateString(start),
        dateTo: toLocalDateString(now),
    }
}

/**
 * "Este ano" — 1º de janeiro até hoje.
 *
 * Mesma lógica de YTD ("Year To Date") — não vai até 31/12 do ano
 * corrente porque dezembro futuro não tem dados.
 */
export const thisYearRange = (now: Date = new Date()): DatePresetRange => {
    const start = new Date(now.getFullYear(), 0, 1)
    return {
        dateFrom: toLocalDateString(start),
        dateTo: toLocalDateString(now),
    }
}

/**
 * Mapa centralizado para uso no componente.
 *
 * Order matters: a ordem aqui é a ordem visual dos chips.
 * "Este mês" primeiro porque é o caso de uso mais comum (ver a
 * conta atual). "Últimos 30 dias" no meio porque é janela móvel
 * (relativo). "Este ano" por último porque é o escopo mais amplo.
 */
export const DATE_PRESETS: ReadonlyArray<{
    id: DatePresetId
    label: string
    compute: (now?: Date) => DatePresetRange
}> = [
    {
        id: "this-month",
        label: "Este mês",
        compute: thisMonthRange,
    },
    {
        id: "last-30-days",
        label: "Últimos 30 dias",
        compute: last30DaysRange,
    },
    {
        id: "this-year",
        label: "Este ano",
        compute: thisYearRange,
    },
] as const

/**
 * Dado um par (dateFrom, dateTo), detecta qual preset corresponde
 * (se algum). Usado pra destacar o chip ativo quando o usuário
 * navega via URL com datas que casam com um preset.
 *
 * Match exato — basta um dia de diferença para retornar undefined
 * (cai em "personalizado", sem chip destacado).
 */
export const detectActivePreset = (
    dateFrom: string | undefined,
    dateTo: string | undefined,
    now: Date = new Date(),
): DatePresetId | undefined => {
    if (!dateFrom || !dateTo) return undefined

    for (const preset of DATE_PRESETS) {
        const range = preset.compute(now)
        if (range.dateFrom === dateFrom && range.dateTo === dateTo) {
            return preset.id
        }
    }
    return undefined
}