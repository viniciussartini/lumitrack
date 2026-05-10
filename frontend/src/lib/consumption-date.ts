import type { ConsumptionPeriod } from "@/types/consumption.types"

/**
 * Helpers de conversão entre o valor exibido no input HTML do form e a
 * string ISO que o backend espera/devolve.
 *
 * Por que esse arquivo existe (e separado de lib/formatters/consumption.ts):
 *   - lib/formatters/consumption.ts cuida de DISPLAY (Intl.DateTimeFormat,
 *     pt-BR, formatos legíveis pelo usuário em tabelas/toasts)
 *   - este aqui cuida de TRANSPORT (input form ↔ API JSON)
 *
 * Um problema central: cada period usa um <input> HTML diferente, e cada
 * <input> tem seu próprio formato de string.
 *
 *   HOURLY  → <input type="datetime-local"> → "2025-01-15T14:00"
 *   DAILY   → <input type="date">           → "2025-01-15"
 *   MONTHLY → <input type="month">          → "2025-01"
 *   ANNUAL  → <input type="number">         → "2025"
 *
 * E precisamos enviar/receber ISO completo: "2025-01-15T12:00:00.000Z".
 *
 * Sobre o middle-of-day em UTC (T12:00:00.000Z):
 *   Para DAILY/MONTHLY/ANNUAL não há informação de hora real — só a unidade
 *   de tempo. Fixar o instante em meio-dia UTC garante que a data renderize
 *   o dia/mês/ano correto em qualquer timezone entre UTC-11 e UTC+11
 *   (qualquer lugar onde haja um humano). T00:00:00 ou T23:59:59 sofreriam
 *   off-by-one em zonas extremas. Padrão amplamente usado em sistemas que
 *   armazenam "datas sem hora" como timestamp.
 */

/**
 * Formato esperado pelo input HTML correspondente ao period.
 * Usado pra defaults iniciais e como "reset" ao trocar period.
 *
 * Atenção: usa horário LOCAL (não UTC) — o usuário enxerga "agora" no
 * próprio fuso. Para HOURLY isso significa que se o backend retorna
 * "2025-01-15T17:00:00.000Z" e o usuário está em UTC-3, o input vai mostrar
 * "2025-01-15T14:00" (que é o "agora" dele).
 */
export const todayForPeriod = (period: ConsumptionPeriod): string => {
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    const hh = String(now.getHours()).padStart(2, "0")
    const mi = String(now.getMinutes()).padStart(2, "0")

    switch (period) {
        case "HOURLY":
            return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
        case "DAILY":
            return `${yyyy}-${mm}-${dd}`
        case "MONTHLY":
            return `${yyyy}-${mm}`
        case "ANNUAL":
            return String(yyyy)
    }
}

/**
 * Converte o valor do input HTML para ISO completo (envio ao backend).
 *
 *   HOURLY  "2025-01-15T14:00"  → "2025-01-15T17:00:00.000Z" (em UTC-3)
 *   DAILY   "2025-01-15"        → "2025-01-15T12:00:00.000Z"
 *   MONTHLY "2025-01"           → "2025-01-01T12:00:00.000Z"
 *   ANNUAL  "2025"              → "2025-01-01T12:00:00.000Z"
 *
 * Para HOURLY, `new Date(string).toISOString()` interpreta a string como
 * horário local e converte pra UTC corretamente. Para os outros, montamos
 * a string ISO manualmente fixando T12:00:00.000Z (vide JSDoc do arquivo).
 */
export const formInputToIso = (
    value: string,
    period: ConsumptionPeriod,
): string => {
    switch (period) {
        case "HOURLY":
            // Browser parseia "2025-01-15T14:00" como local; toISOString converte pra UTC
            return new Date(value).toISOString()
        case "DAILY":
            return `${value}T12:00:00.000Z`
        case "MONTHLY":
            return `${value}-01T12:00:00.000Z`
        case "ANNUAL":
            return `${value}-01-01T12:00:00.000Z`
    }
}

/**
 * Converte ISO recebido do backend para o formato do input HTML (edição).
 *
 *   "2025-01-15T17:00:00.000Z" + HOURLY  → "2025-01-15T14:00" (em UTC-3)
 *   "2025-01-15T12:00:00.000Z" + DAILY   → "2025-01-15"
 *   "2025-01-01T12:00:00.000Z" + MONTHLY → "2025-01"
 *   "2025-01-01T12:00:00.000Z" + ANNUAL  → "2025"
 *
 * Para HOURLY usamos o getter local (`getHours`) para que o usuário veja
 * o instante no seu próprio fuso, coerente com o que ele digitou ao criar.
 *
 * Para DAILY/MONTHLY/ANNUAL usamos getters UTC. Como o backend persistiu
 * com T12:00:00.000Z, qualquer timezone do mundo lê o dia/mês/ano correto
 * em UTC. Usar getters locais aqui causaria off-by-one em zonas onde
 * 12:00 UTC já é o dia anterior ou seguinte (não acontece em fusos
 * habitados, mas ainda assim getUTC* é o invariante).
 */
export const isoToFormInput = (
    iso: string,
    period: ConsumptionPeriod,
): string => {
    const date = new Date(iso)

    switch (period) {
        case "HOURLY": {
            const yyyy = date.getFullYear()
            const mm = String(date.getMonth() + 1).padStart(2, "0")
            const dd = String(date.getDate()).padStart(2, "0")
            const hh = String(date.getHours()).padStart(2, "0")
            const mi = String(date.getMinutes()).padStart(2, "0")
            return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
        }
        case "DAILY": {
            const yyyy = date.getUTCFullYear()
            const mm = String(date.getUTCMonth() + 1).padStart(2, "0")
            const dd = String(date.getUTCDate()).padStart(2, "0")
            return `${yyyy}-${mm}-${dd}`
        }
        case "MONTHLY": {
            const yyyy = date.getUTCFullYear()
            const mm = String(date.getUTCMonth() + 1).padStart(2, "0")
            return `${yyyy}-${mm}`
        }
        case "ANNUAL":
            return String(date.getUTCFullYear())
    }
}

/**
 * Tipo de input HTML correspondente ao period.
 *
 * `<input type="number">` para ANNUAL é proposital — não há `<input type="year">`
 * nativo. Limites min/max são aplicados separadamente no form.
 */
export const periodToInputType = (
    period: ConsumptionPeriod,
): "datetime-local" | "date" | "month" | "number" => {
    switch (period) {
        case "HOURLY":
            return "datetime-local"
        case "DAILY":
            return "date"
        case "MONTHLY":
            return "month"
        case "ANNUAL":
            return "number"
    }
}

/**
 * Label do campo de data adaptada ao period — vai no <label>.
 */
export const periodToDateLabel = (period: ConsumptionPeriod): string => {
    switch (period) {
        case "HOURLY":
            return "Data e hora"
        case "DAILY":
            return "Data"
        case "MONTHLY":
            return "Mês"
        case "ANNUAL":
            return "Ano"
    }
}