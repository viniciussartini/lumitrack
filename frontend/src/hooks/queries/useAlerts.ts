import { useQuery } from "@tanstack/react-query"
import { alertService } from "@/services/alert.service"
import { queryKeys } from "@/lib/queryClient"
import type { Alert, ListAlertQuery } from "@/types/alert.types"

/**
 * Hooks de query para alertas.
 *
 * Espelha a estrutura de useConsumption: 3 hooks `useAlertsBy*` (um por
 * target nested) + um `useAlerts` para a inbox global.
 *
 * Razão de NÃO unificar num hook genérico que recebe `target`:
 *   Cada target tem combinação distinta de IDs obrigatórios (1, 2 ou 3).
 *   Type safety natural com funções separadas, sem ginástica de
 *   discriminated unions no consumidor.
 *
 * Sobre o filtro `triggered` no useAlerts:
 *   O inbox global SEMPRE chama useAlerts() sem filtro e faz a
 *   filtragem client-side via useMemo (1 query única,
 *   alterna abas instantâneo, badge no header reusa o mesmo cache).
 *
 *   A assinatura do hook aceita { triggered? } mesmo assim porque:
 *     a) é um buraco de extensibilidade barato (server-side futuro
 *        sem mudar callers),
 *     b) a queryKey passa o filtro adiante, então caches ficam corretos
 *        se algum dia alguém chamar com filtro.
 *
 * Sobre staleTime:
 *   Usa o default global do queryClient (30s). O handler do SSE
 *   chama invalidateQueries({ queryKey: queryKeys.alerts.all }) ao receber
 *   evento `alert`, forçando refetch — o staleTime não compete com isso.
 */

/**
 * Inbox global — lista todos os alertas do usuário autenticado.
 *
 * `query.triggered` opcional: no PR1 sempre será omitido pela AlertsPage.
 * O filtro de UI fica em useMemo no componente.
 */
export const useAlerts = (query: ListAlertQuery = {}) =>
    useQuery<Alert[]>({
        queryKey: queryKeys.alerts.global(query.triggered),
        queryFn: () => alertService.listGlobal(query),
    })

/**
 * Lista alertas de uma propriedade (target=PROPERTY).
 *
 * `enabled` evita disparar a query quando propertyId é undefined (rota
 * dinâmica ainda resolvendo param). Sem isso, queryFn rodaria com
 * "undefined" na URL.
 */
export const useAlertsByProperty = (propertyId: string | undefined) =>
    useQuery<Alert[]>({
        queryKey: queryKeys.alerts.byProperty(propertyId ?? ""),
        queryFn: () => alertService.listByProperty(propertyId!),
        enabled: Boolean(propertyId),
    })

/**
 * Lista alertas de uma área (target=AREA).
 *
 * Requer propertyId + areaId — sem qualquer um, fica disabled.
 */
export const useAlertsByArea = (
    propertyId: string | undefined,
    areaId: string | undefined,
) =>
    useQuery<Alert[]>({
        queryKey: queryKeys.alerts.byArea(propertyId ?? "", areaId ?? ""),
        queryFn: () => alertService.listByArea(propertyId!, areaId!),
        enabled: Boolean(propertyId && areaId),
    })

/**
 * Lista alertas de um dispositivo (target=DEVICE).
 *
 * Requer propertyId + areaId + deviceId — sem qualquer um, fica disabled.
 */
export const useAlertsByDevice = (
    propertyId: string | undefined,
    areaId: string | undefined,
    deviceId: string | undefined,
) =>
    useQuery<Alert[]>({
        queryKey: queryKeys.alerts.byDevice(
            propertyId ?? "",
            areaId ?? "",
            deviceId ?? "",
        ),
        queryFn: () =>
            alertService.listByDevice(propertyId!, areaId!, deviceId!),
        enabled: Boolean(propertyId && areaId && deviceId),
    })

/**
 * Detalhe de um alerta.
 *
 * Diferente do useConsumption (que exige propertyId para autorizar via
 * URL aninhada), o backend de alertas usa /alerts/:id puro — autorização
 * acontece pelo userId do token. Por isso a assinatura aqui só precisa
 * do id.
 */
export const useAlert = (id: string | undefined) =>
    useQuery<Alert>({
        queryKey: queryKeys.alerts.detail(id ?? ""),
        queryFn: () => alertService.getById(id!),
        enabled: Boolean(id),
    })