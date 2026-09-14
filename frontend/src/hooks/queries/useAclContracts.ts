import { useQuery } from "@tanstack/react-query"
import { aclContractService } from "@/services/acl-contract.service"
import { queryKeys } from "@/lib/queryClient"

/**
 * Contratos ACL de uma propriedade, mais recente primeiro (ver
 * `AclContractRepository.findAllByUserPaginated`, `orderBy: validFrom desc`).
 *
 * A UI trata "contrato corrente" como o primeiro item — nenhuma tela ainda
 * expõe o histórico de contratos sobrepostos que o modelo permite (ver
 * `useCurrentAclContract` abaixo). `enabled: Boolean(propertyId)` evita
 * disparar a query antes do id da propriedade estar disponível (mesmo
 * padrão de `useProperty`).
 */
export const useAclContracts = (propertyId: string | undefined) =>
    useQuery({
        queryKey: queryKeys.aclContracts.byProperty(propertyId ?? ""),
        queryFn: () => aclContractService.listByProperty(propertyId!, { page: 1, pageSize: 31 }),
        enabled: Boolean(propertyId),
    })

/**
 * O contrato corrente de uma propriedade ACL, ou `undefined` se ainda não
 * há nenhum — usado tanto para exibir os dados vigentes quanto para o form
 * de edição decidir entre criar um contrato novo ou atualizar o existente.
 */
export const useCurrentAclContract = (propertyId: string | undefined) => {
    const query = useAclContracts(propertyId)
    return { ...query, data: query.data?.items[0] }
}
