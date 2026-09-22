import { TargetComparison } from "@/components/consumption/TargetComparison"
import { useAreas } from "@/hooks/queries/useAreas"

// Teto do backend por página e, ao mesmo tempo, dentro do limite de ids do
// resumo de consumo — todas as áreas de uma propriedade cabem numa página.
const AREAS_PAGE_SIZE = 31

interface AreaComparisonProps {
    propertyId: string
}

/** "Comparação de áreas" da propriedade: consumo do mês de cada área com medidor. */
export const AreaComparison = ({ propertyId }: AreaComparisonProps) => {
    const areasQuery = useAreas(propertyId, 1, AREAS_PAGE_SIZE)

    return (
        <TargetComparison
            targetType="AREA"
            title="Comparação de áreas"
            subtitle="Consumo por área neste mês"
            targets={areasQuery.data?.items}
            isListError={areasQuery.isError}
            nouns={{ singular: "área", plural: "áreas" }}
            emptyMessage="Cadastre áreas para comparar o consumo entre elas."
            noMeterMessage="Nenhuma área desta propriedade tem medidor."
            errorMessage="Não foi possível carregar a comparação de áreas."
            testId="area-comparison"
        />
    )
}
