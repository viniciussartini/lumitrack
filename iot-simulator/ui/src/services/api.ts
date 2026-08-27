import type { BrokerInfo, DeviceParams, NetworkSnapshot, VirtualDevice } from "@/types"

// Cliente REST simples para a API de controle do simulador. Sem CSRF/cookies
// (ferramenta local, único operador) — bem mais enxuto que frontend/src/services/api.ts.
// Anexa sempre o token: as rotas que não o exigem (broker/info,
// status/stream) simplesmente o ignoram — mais simples que anexar por rota.

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(init?.headers as Record<string, string> | undefined),
    }
    if (import.meta.env.VITE_SIMULATOR_API_TOKEN) {
        headers["Authorization"] = `Bearer ${import.meta.env.VITE_SIMULATOR_API_TOKEN}`
    }

    const res = await fetch(`/api${path}`, { ...init, headers })

    if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.message ?? `Falha na requisição (${res.status})`)
    }

    if (res.status === 204) return undefined as T

    return res.json() as Promise<T>
}

export const api = {
    getBrokerInfo: () => request<BrokerInfo>("/broker/info"),

    listNetworks: () => request<NetworkSnapshot[]>("/networks"),
    createNetwork: (name: string) =>
        request<NetworkSnapshot>("/networks", { method: "POST", body: JSON.stringify({ name }) }),
    deleteNetwork: (id: string) => request<void>(`/networks/${id}`, { method: "DELETE" }),

    createDevice: (
        networkId: string,
        input: { name: string; topic: string; params?: Partial<DeviceParams> },
    ) =>
        request<VirtualDevice>(`/networks/${networkId}/devices`, {
            method: "POST",
            body: JSON.stringify(input),
        }),
    updateDevice: (
        id: string,
        patch: { name?: string; topic?: string; params?: Partial<DeviceParams> },
    ) => request<VirtualDevice>(`/devices/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    deleteDevice: (id: string) => request<void>(`/devices/${id}`, { method: "DELETE" }),

    setPower: (id: string, on: boolean) =>
        request<VirtualDevice>(`/devices/${id}/power`, {
            method: "POST",
            body: JSON.stringify({ on }),
        }),

    triggerAnomaly: (id: string, multiplier: number, durationSeconds: number) =>
        request<VirtualDevice>(`/devices/${id}/anomaly`, {
            method: "POST",
            body: JSON.stringify({ multiplier, durationSeconds }),
        }),
    clearAnomaly: (id: string) =>
        request<VirtualDevice>(`/devices/${id}/anomaly`, { method: "DELETE" }),
}
