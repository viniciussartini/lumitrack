import { useQuery } from "@tanstack/react-query"
import { consumptionService } from "@/services/consumption.service"
import { queryKeys } from "@/lib/queryClient"

/**
 * Comparação Convencional × Branca de uma propriedade num período. Mesmo
 * padrão de `useAclComparison`: `enabled` exige os três parâmetros — quem
 * decide o período default é `BrancaComparisonPage`, não este hook.
 */
export const useBrancaComparison = (
    propertyId: string | undefined,
    from: Date | undefined,
    to: Date | undefined,
) =>
    useQuery({
        queryKey: queryKeys.brancaComparison.detail(
            propertyId ?? "",
            from?.toISOString() ?? "",
            to?.toISOString() ?? "",
        ),
        queryFn: () =>
            consumptionService.compareBrancaToConvencional({
                propertyId: propertyId!,
                from: from!,
                to: to!,
            }),
        enabled: Boolean(
            propertyId &&
            from &&
            to &&
            !Number.isNaN(from.getTime()) &&
            !Number.isNaN(to.getTime()),
        ),
    })
