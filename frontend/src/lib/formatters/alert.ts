import type { Alert } from "@/types/alert.types"

/**
 * Formatadores de Alerta para uso na UI.
 *
 * Princípio: o backend retorna IDs polimórficos (propertyId | areaId | deviceId).
 * O frontend NÃO conhece o nome humano dessas entidades automaticamente —
 * precisa do contexto (entidade já carregada) ou de uma query auxiliar.
 *
 * Por isso o formatAlertTarget aceita um `lookup` opcional: quando a página
 * conhece as entidades (ex: AlertsPage carrega properties/areas/devices em
 * paralelo), passa o dicionário; quando não, mostra fallback com o ID curto.
 */

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
})

const KWH_FORMATTER = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
})

/**
 * Formata o threshold em kWh.
 *
 * Exemplos:
 *   100      → "100 kWh"
 *   100.5    → "100,5 kWh"
 *   0.123    → "0,12 kWh"   (limitado a 2 casas)
 */
export const formatThresholdKwh = (value: number): string =>
    `${KWH_FORMATTER.format(value)} kWh`

/**
 * Formata a data de disparo. Retorna "—" se nunca disparou.
 *
 * Exemplos:
 *   null                          → "—"
 *   "2025-11-15T14:30:00Z"        → "15/11/2025, 11:30"  (timezone local)
 */
export const formatTriggeredAt = (triggeredAt: string | null): string => {
    if (!triggeredAt) return "—"
    return DATE_TIME_FORMATTER.format(new Date(triggeredAt))
}

/**
 * Dicionário opcional para resolver nomes legíveis dos IDs polimórficos.
 *
 * Quem TEM as entidades carregadas (AlertsPage global) monta esse objeto
 * a partir das queries de property/area/device e passa.
 * Quem NÃO tem (AlertSection nested, onde só conhecemos o target atual)
 * deixa undefined e o helper exibe fallback com ID curto.
 */
export interface AlertTargetLookup {
    properties?: Record<string, { name: string }>
    areas?: Record<string, { name: string; propertyName?: string }>
    devices?: Record<
        string,
        { name: string; areaName?: string; propertyName?: string }
    >
}

const shortId = (id: string) => id.slice(0, 8)

/**
 * Formata o target de um alerta em texto legível.
 *
 * Com lookup completo:
 *   PROPERTY → "Casa Principal"
 *   AREA     → "Casa Principal · Cozinha"
 *   DEVICE   → "Casa Principal · Cozinha · Geladeira"
 *
 * Sem lookup ou com entrada faltando:
 *   PROPERTY → "Propriedade · 7c4a1b2e"
 *   AREA     → "Área · 9e1d3a45"
 *   DEVICE   → "Dispositivo · b2c84091"
 */
export const formatAlertTarget = (
    alert: Alert,
    lookup: AlertTargetLookup = {},
): string => {
    if (alert.targetType === "PROPERTY" && alert.propertyId) {
        const entry = lookup.properties?.[alert.propertyId]
        return entry?.name ?? `Propriedade · ${shortId(alert.propertyId)}`
    }

    if (alert.targetType === "AREA" && alert.areaId) {
        const entry = lookup.areas?.[alert.areaId]
        if (entry) {
            const parts = [entry.propertyName, entry.name].filter(Boolean)
            return parts.join(" · ")
        }
        return `Área · ${shortId(alert.areaId)}`
    }

    if (alert.targetType === "DEVICE" && alert.deviceId) {
        const entry = lookup.devices?.[alert.deviceId]
        if (entry) {
            const parts = [
                entry.propertyName,
                entry.areaName,
                entry.name,
            ].filter(Boolean)
            return parts.join(" · ")
        }
        return `Dispositivo · ${shortId(alert.deviceId)}`
    }

    // Fallback defensivo — não deveria acontecer pelo schema do backend
    // (target sempre tem exatamente 1 FK preenchido).
    return "Alvo desconhecido"
}