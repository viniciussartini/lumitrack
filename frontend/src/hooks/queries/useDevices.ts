import { useQuery } from "@tanstack/react-query"
import { deviceService } from "@/services/device.service"
import { queryKeys } from "@/lib/queryClient"
import type { Device } from "@/types/device.types"

/**
 * Lista todos os dispositivos de uma área.
 *
 * `enabled: Boolean(propertyId && areaId)` evita disparar a query quando
 * algum dos dois é undefined/empty (rotas dinâmicas onde algum param ainda
 * não chegou). Sem isso, o queryFn rodaria com `undefined` na URL.
 *
 * Retorna o `result` completo do useQuery — quem consome decide se quer
 * `data`, `isLoading`, `isError`, etc.
 */
export const useDevices = (
    propertyId: string | undefined,
    areaId: string | undefined,
) =>
    useQuery<Device[]>({
        queryKey: queryKeys.devices.list(propertyId ?? "", areaId ?? ""),
        queryFn: () => deviceService.list(propertyId!, areaId!),
        enabled: Boolean(propertyId && areaId),
    })

/**
 * Detalhes de um dispositivo específico dentro de uma área de uma propriedade.
 *
 * Os 3 params são obrigatórios pra disparar (sem qualquer um deles, não há
 * como bater no endpoint correto).
 */
export const useDevice = (
    propertyId: string | undefined,
    areaId: string | undefined,
    deviceId: string | undefined,
) =>
    useQuery<Device>({
        queryKey: queryKeys.devices.detail(
            propertyId ?? "",
            areaId ?? "",
            deviceId ?? "",
        ),
        queryFn: () =>
            deviceService.getById(propertyId!, areaId!, deviceId!),
        enabled: Boolean(propertyId && areaId && deviceId),
    })