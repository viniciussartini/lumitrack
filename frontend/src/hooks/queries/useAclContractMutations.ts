import { useMutation, useQueryClient } from "@tanstack/react-query"
import { aclContractService } from "@/services/acl-contract.service"
import { queryKeys } from "@/lib/queryClient"
import type {
    AclContract,
    CreateAclContractInput,
    UpdateAclContractInput,
} from "@/types/acl-contract.types"

/**
 * Mutations de contrato ACL.
 *
 * Sem toast de sucesso próprio: as duas mutations são sempre disparadas
 * dentro do submit de `PropertyFormDialog` (create/update de Propriedade +
 * create/update de contrato), que já mostra um único toast cobrindo a
 * operação inteira — um segundo toast aqui duplicaria a mensagem.
 */
export const useCreateAclContract = () => {
    const queryClient = useQueryClient()

    return useMutation<AclContract, Error, CreateAclContractInput>({
        mutationFn: (input) => aclContractService.create(input),
        onSuccess: (created) => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.aclContracts.byProperty(created.propertyId),
            })
        },
    })
}

interface UpdateAclContractVariables {
    id: string
    propertyId: string
    input: UpdateAclContractInput
}

export const useUpdateAclContract = () => {
    const queryClient = useQueryClient()

    return useMutation<AclContract, Error, UpdateAclContractVariables>({
        mutationFn: ({ id, input }) => aclContractService.update(id, input),
        onSuccess: (_, { propertyId }) => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.aclContracts.byProperty(propertyId),
            })
        },
    })
}
