import { useQuery } from "@tanstack/react-query"
import { consumptionService } from "@/services/consumption.service"
import { queryKeys } from "@/lib/queryClient"

/**
 * Comparação ACR × ACL de uma propriedade num período. `enabled` exige os
 * três parâmetros — o hook em si não assume nenhum período: quem decide o
 * default (hoje, os últimos 6 meses) é `AclComparisonPage`, não este hook.
 * `from`/`to` inválidos (ex.: `Invalid Date` de um input de mês limpo) não
 * disparam a query — ver a validação em `AclComparisonPage`.
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
        enabled: Boolean(
            propertyId &&
            from &&
            to &&
            !Number.isNaN(from.getTime()) &&
            !Number.isNaN(to.getTime()),
        ),
    })
