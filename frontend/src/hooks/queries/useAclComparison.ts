import { useQuery } from "@tanstack/react-query"
import { consumptionService } from "@/services/consumption.service"
import { queryKeys } from "@/lib/queryClient"

/**
 * Comparação ACR × ACL de uma propriedade num período. `enabled` exige os
 * três parâmetros — a página só monta a query depois que o usuário escolhe
 * a janela (sem período default: a página guia o usuário a escolher, não
 * infere silenciosamente um intervalo arbitrário — ver `AclComparisonPage`).
 */
export const useAclComparison = (
    propertyId: string | undefined,
    from: Date | undefined,
    to: Date | undefined,
) =>
    useQuery({
        queryKey: queryKeys.aclComparison.detail(
            propertyId ?? "",
            from?.toISOString() ?? "",
            to?.toISOString() ?? "",
        ),
        queryFn: () =>
            consumptionService.compareAclToAcr({ propertyId: propertyId!, from: from!, to: to! }),
        enabled: Boolean(propertyId && from && to),
    })
