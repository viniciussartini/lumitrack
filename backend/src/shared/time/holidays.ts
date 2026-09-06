// Calendário de feriados nacionais brasileiros (RN25) — usado para classificar
// consumo por posto tarifário (Grupo A, Fase 19). Datas móveis são CALCULADAS
// a partir da Páscoa a cada chamada, nunca uma tabela copiada: uma lista fixa
// funciona um ano e erra silenciosamente no seguinte, cobrando ponta num
// feriado (RN25) — o mesmo raciocínio já registrado no roadmap.
//
// Todas as datas são meia-noite UTC (o "dia" do feriado, não um instante) —
// comparação com uma leitura é sempre feita pela data local já convertida
// (ver tariffPost.ts), nunca pelo instante bruto em UTC.

const MS_PER_DAY = 24 * 60 * 60 * 1000

function addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * MS_PER_DAY)
}

/**
 * Data da Páscoa (domingo) num ano, pelo algoritmo de Meeus/Jones/Butcher
 * (calendário gregoriano) — a mesma fórmula por trás de todo calendário
 * litúrgico móvel usado em cálculo de feriados.
 *
 * @param year - Ano (calendário gregoriano).
 * @returns A data da Páscoa, meia-noite UTC.
 */
export function getEasterDate(year: number): Date {
    const a = year % 19
    const b = Math.floor(year / 100)
    const c = year % 100
    const d = Math.floor(b / 4)
    const e = b % 4
    const f = Math.floor((b + 8) / 25)
    const g = Math.floor((b - f + 1) / 3)
    const h = (19 * a + b - d - g + 15) % 30
    const i = Math.floor(c / 4)
    const k = c % 4
    const l = (32 + 2 * e + 2 * i - h - k) % 7
    const m = Math.floor((a + 11 * h + 22 * l) / 451)
    const month = Math.floor((h + l - 7 * m + 114) / 31) // 3 = março, 4 = abril
    const day = ((h + l - 7 * m + 114) % 31) + 1

    return new Date(Date.UTC(year, month - 1, day))
}

/**
 * Feriados nacionais de um ano — fixos (REN 1.000/2021 + calendário civil) e
 * móveis (derivados da Páscoa). Feriados estaduais/municipais ficam fora:
 * RN25 só cobre o calendário nacional.
 *
 * @param year - Ano a calcular.
 * @returns Todos os feriados nacionais do ano, meia-noite UTC.
 */
export function getNationalHolidays(year: number): Date[] {
    const fixed = [
        new Date(Date.UTC(year, 0, 1)), // Confraternização Universal
        new Date(Date.UTC(year, 3, 21)), // Tiradentes
        new Date(Date.UTC(year, 4, 1)), // Dia do Trabalho
        new Date(Date.UTC(year, 8, 7)), // Independência do Brasil
        new Date(Date.UTC(year, 9, 12)), // Nossa Senhora Aparecida
        new Date(Date.UTC(year, 10, 2)), // Finados
        new Date(Date.UTC(year, 10, 15)), // Proclamação da República
        new Date(Date.UTC(year, 10, 20)), // Consciência Negra (Lei 14.759/2023)
        new Date(Date.UTC(year, 11, 25)), // Natal
    ]

    const easter = getEasterDate(year)
    const movable = [
        addDays(easter, -48), // Carnaval (segunda)
        addDays(easter, -47), // Carnaval (terça)
        addDays(easter, -2), // Sexta-Feira Santa
        addDays(easter, 60), // Corpus Christi
    ]

    return [...fixed, ...movable]
}

/**
 * Feriados nacionais de todos os anos tocados por um intervalo — uma
 * agregação de consumo frequentemente atravessa a virada do ano.
 *
 * @param from - Início do intervalo (inclusive).
 * @param to - Fim do intervalo (inclusive, mesma convenção do `to` usado pelo restante do módulo de consumo).
 * @returns Os feriados nacionais de `from.getUTCFullYear()` até `to.getUTCFullYear()`.
 */
export function getNationalHolidaysInRange(from: Date, to: Date): Date[] {
    const startYear = from.getUTCFullYear()
    const endYear = to.getUTCFullYear()

    const holidays: Date[] = []
    for (let year = startYear; year <= endYear; year++) {
        holidays.push(...getNationalHolidays(year))
    }
    return holidays
}
