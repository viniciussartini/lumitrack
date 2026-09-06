// Equivalente em JS do `localTsExpr()` (shared/database/timeBucket.ts), que
// faz a mesma conversão em SQL. São Paulo é UTC-3 o ano inteiro — sem horário
// de verão desde 2019 (RN26); se ele voltar, esta premissa precisa ser
// revisitada nos dois lugares.
const SP_OFFSET_MS = 3 * 60 * 60 * 1000

/**
 * Converte um instante UTC para a hora de parede de São Paulo — o resultado
 * é um `Date` cujos getters UTC (`getUTCHours`, `getUTCDate`...) devem ser
 * lidos como se fossem a hora local, mesma convenção de `classifyPost`
 * (`shared/tariff/tariffPost.ts`).
 *
 * @param utcDate - Instante em UTC (ex.: `MeterReading.minuteStart`).
 * @returns O mesmo instante, deslocado para a hora local de São Paulo.
 */
export function toSaoPauloLocal(utcDate: Date): Date {
    return new Date(utcDate.getTime() - SP_OFFSET_MS)
}

/**
 * Inverso de {@link toSaoPauloLocal} — converte um instante expresso na
 * convenção "hora local nos getters UTC" de volta para o instante UTC real.
 * Usado para persistir campos como `MeterDemandRollup.periodStart`: o valor
 * gravado no banco deve ser o instante UTC verdadeiro da meia-noite local do
 * dia 1º, não o truque de conversão usado só internamente em `classifyPost`.
 *
 * @param localDate - Instante na convenção local (ver {@link toSaoPauloLocal}).
 * @returns O instante UTC real correspondente.
 */
export function fromSaoPauloLocal(localDate: Date): Date {
    return new Date(localDate.getTime() + SP_OFFSET_MS)
}
