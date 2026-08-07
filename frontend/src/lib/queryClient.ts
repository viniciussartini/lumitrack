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
 *   - refetchOnWindowFocus: false (decisão consciente, #165 — M-11)
 *       O default do TanStack é `true`, mas aqui voltar à aba refaria
 *       TODAS as queries montadas de uma vez — inclui o fan-out de
 *       consumo do Painel (A-04: até 20 propriedades × ~8 queries no
 *       backend cada, ~160 queries por refetch). Enquanto esse endpoint
 *       não vira uma chamada em lote (Fase 15 do roadmap), `true`
 *       amplificaria exatamente o custo que o laudo de desempenho já
 *       sinalizou. Os dados que realmente precisam de frescor "ao vivo"
 *       (potência, leituras) já chegam por SSE (RealtimeContext), não
 *       por refetch do TanStack Query — revisitar quando A-04 for
 *       resolvido, se fizer sentido.
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30 * 1000,
            gcTime: 5 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
        },
        mutations: {
            retry: 0,
        },
    },
})

/**
 * Chaves de query — centralizadas para evitar typos e facilitar invalidação.
 *
 * Reformulação IoT (Fase 5): listagens paginadas (properties, areas, devices,
 * meters, distributors, alerts, alertEvents, consumption) incluem page/pageSize
 * na key — páginas diferentes são resultados diferentes que valem cache
 * próprio. `notifications` não é paginado (efêmero, cap de 100 no backend).
 */
export const queryKeys = {
    distributors: {
        all: ["distributors"] as const,
        list: (page: number, pageSize: number) =>
            [...queryKeys.distributors.all, "list", page, pageSize] as const,
        detail: (id: string) => [...queryKeys.distributors.all, "detail", id] as const,
    },
    properties: {
        all: ["properties"] as const,
        list: (page: number, pageSize: number) =>
            [...queryKeys.properties.all, "list", page, pageSize] as const,
        detail: (id: string) => [...queryKeys.properties.all, "detail", id] as const,
    },
    areas: {
        all: ["areas"] as const,
        list: (propertyId: string, page: number, pageSize: number) =>
            [...queryKeys.areas.all, "list", propertyId, page, pageSize] as const,
        detail: (propertyId: string, areaId: string) =>
            [...queryKeys.areas.all, "detail", propertyId, areaId] as const,
    },
    devices: {
        all: ["devices"] as const,
        list: (propertyId: string, areaId: string, page: number, pageSize: number) =>
            [...queryKeys.devices.all, "list", propertyId, areaId, page, pageSize] as const,
        detail: (propertyId: string, areaId: string, deviceId: string) =>
            [...queryKeys.devices.all, "detail", propertyId, areaId, deviceId] as const,
    },
    meters: {
        all: ["meters"] as const,
        list: (page: number, pageSize: number) =>
            [...queryKeys.meters.all, "list", page, pageSize] as const,
        byTarget: (targetType: string, targetId: string) =>
            [...queryKeys.meters.all, "by-target", targetType, targetId] as const,
        detail: (id: string) => [...queryKeys.meters.all, "detail", id] as const,
    },
    consumption: {
        all: ["consumption"] as const,
        list: (
            targetType: string,
            targetId: string,
            granularity: string,
            page: number,
            pageSize: number,
        ) =>
            [
                ...queryKeys.consumption.all,
                "list",
                targetType,
                targetId,
                granularity,
                page,
                pageSize,
            ] as const,
    },
    alerts: {
        all: ["alerts"] as const,
        list: (page: number, pageSize: number) =>
            [...queryKeys.alerts.all, "list", page, pageSize] as const,
        firing: () => [...queryKeys.alerts.all, "firing"] as const,
        detail: (id: string) => [...queryKeys.alerts.all, "detail", id] as const,
    },
    alertEvents: {
        all: ["alertEvents"] as const,
        list: (alertId: string, page: number, pageSize: number) =>
            [...queryKeys.alertEvents.all, "list", alertId, page, pageSize] as const,
    },
    notifications: {
        all: ["notifications"] as const,
        list: () => [...queryKeys.notifications.all, "list"] as const,
    },
    tariffFlag: {
        all: ["tariffFlag"] as const,
        current: () => [...queryKeys.tariffFlag.all, "current"] as const,
    },
} as const
