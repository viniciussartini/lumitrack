import { api } from "@/services/api"
import type {
    AclContract,
    CreateAclContractInput,
    UpdateAclContractInput,
} from "@/types/acl-contract.types"
import type { Paginated, PaginationParams } from "@/types/pagination.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

/**
 * Camada de acesso à API de contratos de energia do Mercado Livre (ACL).
 * Sem `delete`: o form de propriedade só cria ou atualiza o contrato
 * corrente (ver `PropertyFormDialog`) — nenhuma tela oferece remoção ainda.
 */
export const aclContractService = {
    listByProperty: async (
        propertyId: string,
        params: PaginationParams = {},
    ): Promise<Paginated<AclContract>> => {
        const { data } = await api.get<ApiEnvelope<Paginated<AclContract>>>("/acl-contracts", {
            params: { ...params, propertyId },
        })
        return data.data
    },

    create: async (input: CreateAclContractInput): Promise<AclContract> => {
        const { data } = await api.post<ApiEnvelope<AclContract>>("/acl-contracts", input)
        return data.data
    },

    update: async (id: string, input: UpdateAclContractInput): Promise<AclContract> => {
        const { data } = await api.put<ApiEnvelope<AclContract>>(`/acl-contracts/${id}`, input)
        return data.data
    },
}
