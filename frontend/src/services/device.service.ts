import { api } from "@/services/api"
import type {
    Device,
    CreateDeviceInput,
    UpdateDeviceInput,
} from "@/types/device.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

/**
 * Camada de acesso à API de dispositivos.
 *
 * URL aninhada em DOIS níveis:
 *   /api/properties/:propertyId/areas/:areaId/devices[/:id]
 *
 * Diferente de areaService (1 nível de aninhamento), todos os métodos exigem
 * tanto `propertyId` quanto `areaId`. Os IDs entram só na URL — no body
 * vai apenas o subset editável (name, brand, model, powerWatts).
 *
 * Só faz HTTP, sem lógica de cache (isso é dos hooks). O envelope
 * { status, data } é desmembrado aqui.
 */
export const deviceService = {
    list: async (
        propertyId: string,
        areaId: string,
    ): Promise<Device[]> => {
        const { data } = await api.get<ApiEnvelope<Device[]>>(
            `/properties/${propertyId}/areas/${areaId}/devices`,
        )
        return data.data
    },

    getById: async (
        propertyId: string,
        areaId: string,
        id: string,
    ): Promise<Device> => {
        const { data } = await api.get<ApiEnvelope<Device>>(
            `/properties/${propertyId}/areas/${areaId}/devices/${id}`,
        )
        return data.data
    },

    create: async (
        propertyId: string,
        areaId: string,
        input: CreateDeviceInput,
    ): Promise<Device> => {
        const { data } = await api.post<ApiEnvelope<Device>>(
            `/properties/${propertyId}/areas/${areaId}/devices`,
            input,
        )
        return data.data
    },

    update: async (
        propertyId: string,
        areaId: string,
        id: string,
        input: UpdateDeviceInput,
    ): Promise<Device> => {
        const { data } = await api.put<ApiEnvelope<Device>>(
            `/properties/${propertyId}/areas/${areaId}/devices/${id}`,
            input,
        )
        return data.data
    },

    delete: async (
        propertyId: string,
        areaId: string,
        id: string,
    ): Promise<void> => {
        await api.delete(
            `/properties/${propertyId}/areas/${areaId}/devices/${id}`,
        )
    },
}