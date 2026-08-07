import { useQuery } from "@tanstack/react-query"
import { deviceService } from "@/services/device.service"
import { queryKeys } from "@/lib/queryClient"
import { DEFAULT_PAGE_SIZE } from "@/types/pagination.types"
import type { Device } from "@/types/device.types"

/**
 * Lista os dispositivos de uma área (paginado — Fase 5).
 *
 * `enabled: Boolean(propertyId && areaId)` evita disparar a query quando
 * algum dos dois é undefined/empty (rotas dinâmicas onde algum param ainda
 * não chegou).
 */
export const useDevices = (
    propertyId: string | undefined,
    areaId: string | undefined,
    page: number = 1,
    pageSize: number = DEFAULT_PAGE_SIZE,
) =>
    useQuery({
        queryKey: queryKeys.devices.list(propertyId ?? "", areaId ?? "", page, pageSize),
        queryFn: () => deviceService.list(propertyId!, areaId!, { page, pageSize }),
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
        queryKey: queryKeys.devices.detail(propertyId ?? "", areaId ?? "", deviceId ?? ""),
        queryFn: () => deviceService.getById(propertyId!, areaId!, deviceId!),
        enabled: Boolean(propertyId && areaId && deviceId),
    })
