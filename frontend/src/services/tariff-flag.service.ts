import { api } from "@/services/api"
import type { TariffFlagConfig } from "@/types/tariff-flag.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

/**
 * Camada de acesso à bandeira tarifária vigente — config singleton, global
 * (não por usuário/propriedade). Leitura liberada a qualquer usuário
 * autenticado; atualização (`PUT`) é restrita a ADMIN e não tem UI nesta
 * fase.
 */
export const tariffFlagService = {
    get: async (): Promise<TariffFlagConfig> => {
        const { data } = await api.get<ApiEnvelope<TariffFlagConfig>>("/tariff-flag")
        return data.data
    },
}
