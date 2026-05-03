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
 *
 * Padrão: hierarquia de arrays, do geral ao específico.
 *   queryKeys.distributors.all              → ["distributors"]
 *   queryKeys.distributors.list()           → ["distributors", "list"]
 *   queryKeys.distributors.detail(id)       → ["distributors", "detail", id]
 *
 * Invalidar `["distributors"]` invalida TODAS as queries de distribuidora.
 * Invalidar `["distributors", "list"]` invalida só listas.
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
} as const