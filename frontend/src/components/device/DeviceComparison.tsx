import { TargetComparison } from "@/components/consumption/TargetComparison"
import { useDevices } from "@/hooks/queries/useDevices"

// Teto do backend por página e, ao mesmo tempo, dentro do limite de ids do
// resumo de consumo — todos os dispositivos de uma área cabem numa página.
const DEVICES_PAGE_SIZE = 31

interface DeviceComparisonProps {
    propertyId: string
    areaId: string
}

/**
 * "Comparação de dispositivos" da área: consumo do mês **medido** por cada
 * dispositivo com medidor — não estimado pela potência nominal.
 */
export const DeviceComparison = ({ propertyId, areaId }: DeviceComparisonProps) => {
    const devicesQuery = useDevices(propertyId, areaId, 1, DEVICES_PAGE_SIZE)

    return (
        <TargetComparison
            targetType="DEVICE"
            title="Comparação de dispositivos"
            subtitle="Consumo por dispositivo neste mês"
            targets={devicesQuery.data?.items}
            isListError={devicesQuery.isError}
            nouns={{ singular: "dispositivo", plural: "dispositivos" }}
            emptyMessage="Cadastre dispositivos para comparar o consumo entre eles."
            noMeterMessage="Nenhum dispositivo desta área tem medidor."
            errorMessage="Não foi possível carregar a comparação de dispositivos."
            testId="device-comparison"
        />
    )
}
