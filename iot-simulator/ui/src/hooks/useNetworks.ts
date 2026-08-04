import { useMutation } from "@tanstack/react-query"
import { api } from "@/services/api"
import type { DeviceParams } from "@/types"

// Mutations de controle (CRUD de redes/devices, power, anomalia). Não há
// useQuery/cache aqui de propósito: o estado de leitura vem inteiramente de
// useLiveStatus (SSE) — o servidor reenvia o snapshot atualizado logo após
// qualquer mutação ter efeito, então duplicar esse estado numa query do
// TanStack Query seria uma segunda fonte de verdade sem necessidade.
export function useNetworks() {
    const createNetwork = useMutation({
        mutationFn: (name: string) => api.createNetwork(name),
    })

    const deleteNetwork = useMutation({
        mutationFn: (id: string) => api.deleteNetwork(id),
    })

    const createDevice = useMutation({
        mutationFn: ({
            networkId,
            name,
            topic,
            params,
        }: {
            networkId: string
            name: string
            topic: string
            params?: Partial<DeviceParams>
        }) => api.createDevice(networkId, { name, topic, params }),
    })

    const updateDevice = useMutation({
        mutationFn: ({
            id,
            patch,
        }: {
            id: string
            patch: { name?: string; topic?: string; params?: Partial<DeviceParams> }
        }) => api.updateDevice(id, patch),
    })

    const deleteDevice = useMutation({
        mutationFn: (id: string) => api.deleteDevice(id),
    })

    const setPower = useMutation({
        mutationFn: ({ id, on }: { id: string; on: boolean }) => api.setPower(id, on),
    })

    const triggerAnomaly = useMutation({
        mutationFn: ({
            id,
            multiplier,
            durationSeconds,
        }: {
            id: string
            multiplier: number
            durationSeconds: number
        }) => api.triggerAnomaly(id, multiplier, durationSeconds),
    })

    const clearAnomaly = useMutation({
        mutationFn: (id: string) => api.clearAnomaly(id),
    })

    return {
        createNetwork,
        deleteNetwork,
        createDevice,
        updateDevice,
        deleteDevice,
        setPower,
        triggerAnomaly,
        clearAnomaly,
    }
}
