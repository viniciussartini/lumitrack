import { QueryClient } from "@tanstack/react-query"

/**
 * Instância única do QueryClient usada pelo app.
 *
 * Defaults justificados:
 *   - staleTime: 30s
 *       Dados ficam "frescos" por meio minuto. Evita refetches agressivos
 *       em re-renders. Para dados que mudam pouco (como distribuidoras),
 *       30s é folga suficiente.
 *
 *   - gcTime: 5min
 *       Tempo que dados ficam em cache após nenhum componente os usar.
 *       Volta pra mesma página em < 5min: cache hit, render instantâneo.
 *
 *   - retry: 1 em queries
 *       Cobre falhas transitórias de rede sem mascarar bugs reais (que
 *       falhariam consistentemente). Default do TanStack é 3, agressivo.
 *
 *   - retry: 0 em mutations
 *       REGRA DE OURO: mutations nunca retentam. Retentar um POST pode
 *       criar duplicatas. Falhou? O usuário decide se tenta de novo.
 *
 *   - refetchOnWindowFocus: true (default do TanStack)
 *       Volta da aba? Refetch silencioso para manter dados atualizados.
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30 * 1000,
            gcTime: 5 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: true,
        },
        mutations: {
            retry: 0,
        },
    },
})

/**
 * Chaves de query — centralizadas para evitar typos e facilitar invalidação.
 */
export const queryKeys = {
    distributors: {
        all: ["distributors"] as const,
        list: () => [...queryKeys.distributors.all, "list"] as const,
        detail: (id: string) =>
            [...queryKeys.distributors.all, "detail", id] as const,
    },
    properties: {
        all: ["properties"] as const,
        list: () => [...queryKeys.properties.all, "list"] as const,
        detail: (id: string) =>
            [...queryKeys.properties.all, "detail", id] as const,
    },
    areas: {
        all: ["areas"] as const,
        list: (propertyId: string) =>
            [...queryKeys.areas.all, "list", propertyId] as const,
        detail: (propertyId: string, areaId: string) =>
            [...queryKeys.areas.all, "detail", propertyId, areaId] as const,
    },
    devices: {
        all: ["devices"] as const,
        list: (propertyId: string, areaId: string) =>
            [...queryKeys.devices.all, "list", propertyId, areaId] as const,
        detail: (propertyId: string, areaId: string, deviceId: string) =>
            [
                ...queryKeys.devices.all,
                "detail",
                propertyId,
                areaId,
                deviceId,
            ] as const,
    },
    consumption: {
        all: ["consumption"] as const,
        byProperty: (propertyId: string, period?: string) =>
            [
                ...queryKeys.consumption.all,
                "list",
                "property",
                propertyId,
                period ?? "all",
            ] as const,

        byArea: (propertyId: string, areaId: string, period?: string) =>
            [
                ...queryKeys.consumption.all,
                "list",
                "area",
                propertyId,
                areaId,
                period ?? "all",
            ] as const,

        byDevice: (
            propertyId: string,
            areaId: string,
            deviceId: string,
            period?: string,
        ) =>
            [
                ...queryKeys.consumption.all,
                "list",
                "device",
                propertyId,
                areaId,
                deviceId,
                period ?? "all",
            ] as const,

        // Detalhe — apenas pelo id; o backend não exige propertyId pra
        // localizar (mas exige pra autorizar). A query inclui propertyId
        // como "scope guard" implícito via queryFn, mas a key é só pelo id.
        detail: (id: string) =>
            [...queryKeys.consumption.all, "detail", id] as const,
    },
    alerts: {
        all: ["alerts"] as const,
    
        /**
         * Inbox global em /alertas — filtro por triggered.
         * Convenção: undefined → "all", true → "triggered", false → "active".
         */
        global: (triggered?: boolean) =>
            [
                ...queryKeys.alerts.all,
                "list",
                "global",
                triggered === undefined
                    ? "all"
                    : triggered
                    ? "triggered"
                    : "active",
            ] as const,
    
        byProperty: (propertyId: string) =>
            [
                ...queryKeys.alerts.all,
                "list",
                "property",
                propertyId,
            ] as const,
    
        byArea: (propertyId: string, areaId: string) =>
            [
                ...queryKeys.alerts.all,
                "list",
                "area",
                propertyId,
                areaId,
            ] as const,
    
        byDevice: (propertyId: string, areaId: string, deviceId: string) =>
            [
                ...queryKeys.alerts.all,
                "list",
                "device",
                propertyId,
                areaId,
                deviceId,
            ] as const,
    
        /**
         * Detalhe — apenas pelo id; backend usa /alerts/:id.
         */
        detail: (id: string) =>
            [...queryKeys.alerts.all, "detail", id] as const,
    },
    reports: {
        all: ["reports"] as const,
        /**
         * Chave de um relatório de propriedade. Inclui filtros porque cada
         * combinação (period + dateFrom + dateTo) é um resultado distinto
         * que vale a pena cachear separadamente.
         *
         * `?? "all"` mantém a chave estável quando o filtro é undefined —
         * mesmo padrão do queryKeys.consumption.byProperty.
         */
        byProperty: (
            propertyId: string,
            period: string,
            dateFrom?: string,
            dateTo?: string,
        ) =>
            [
                ...queryKeys.reports.all,
                "property",
                propertyId,
                period,
                dateFrom ?? "all",
                dateTo ?? "all",
            ] as const,
        byArea: (
            propertyId: string,
            areaId: string,
            period: string,
            dateFrom?: string,
            dateTo?: string,
        ) =>
            [
                ...queryKeys.reports.all,
                "area",
                propertyId,
                areaId,
                period,
                dateFrom ?? "all",
                dateTo ?? "all",
            ] as const,
        byDevice: (
            propertyId: string,
            areaId: string,
            deviceId: string,
            period: string,
            dateFrom?: string,
            dateTo?: string,
        ) =>
            [
                ...queryKeys.reports.all,
                "device",
                propertyId,
                areaId,
                deviceId,
                period,
                dateFrom ?? "all",
                dateTo ?? "all",
            ] as const,
    },
} as const