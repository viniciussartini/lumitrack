import { useState } from "react"
import { Construction } from "lucide-react"
import { Select } from "@/components/ui/Select"
import { ConsumptionSection } from "@/components/consumption/ConsumptionSection"
import { useProperties } from "@/hooks/queries/useProperties"
import { useAreas } from "@/hooks/queries/useAreas"
import { useDevices } from "@/hooks/queries/useDevices"
import { REPORT_GRANULARITIES } from "@/types/consumption.types"
import type { TargetType } from "@/types/meter.types"

/**
 * Relatórios — /relatorios. Corrige o gap do menu: antes só havia relatório
 * por entidade (rota `/…/relatorio`, removida); agora é uma página única
 * com seletor cascata de alvo (propriedade → área → dispositivo) + as 4
 * granularidades (hora/dia/mês/ano).
 *
 * Reaproveita `ConsumptionSection` (mesmo componente das details pages) —
 * gráfico, tabela e paginação idênticos, só variando o alvo e as
 * granularidades disponíveis.
 */
export const ReportsPage = () => {
    const [propertyId, setPropertyId] = useState("")
    const [areaId, setAreaId] = useState("")
    const [deviceId, setDeviceId] = useState("")

    // pageSize máximo (31) — os seletores precisam de todas as opções do
    // usuário, não só uma página.
    const propertiesQuery = useProperties(1, 31)
    const areasQuery = useAreas(propertyId || undefined, 1, 31)
    const devicesQuery = useDevices(propertyId || undefined, areaId || undefined, 1, 31)

    const properties = propertiesQuery.data?.items ?? []
    const areas = areasQuery.data?.items ?? []
    const devices = devicesQuery.data?.items ?? []

    const handlePropertyChange = (next: string) => {
        setPropertyId(next)
        setAreaId("")
        setDeviceId("")
    }

    const handleAreaChange = (next: string) => {
        setAreaId(next)
        setDeviceId("")
    }

    const target: { targetType: TargetType; targetId: string } | null = deviceId
        ? { targetType: "DEVICE", targetId: deviceId }
        : areaId
          ? { targetType: "AREA", targetId: areaId }
          : propertyId
            ? { targetType: "PROPERTY", targetId: propertyId }
            : null

    return (
        <div className="flex flex-col gap-6">
            {/* h1 "Relatórios" removido — duplicava o título que o Header
                agora mostra pra rota /relatorios. Página sem handoff
                Industry ainda (ver 10-design-system.md), resto intocado. */}
            <p className="text-muted text-sm">
                Selecione um alvo para ver o consumo agregado por hora, dia, mês ou ano.
            </p>

            <div className="border-divider bg-surface grid grid-cols-1 gap-4 rounded-lg border p-4 md:grid-cols-3">
                <Select
                    label="Propriedade"
                    value={propertyId}
                    onChange={(e) => handlePropertyChange(e.target.value)}
                    data-testid="reports-property-select"
                >
                    <option value="">Selecione</option>
                    {properties.map((property) => (
                        <option key={property.id} value={property.id}>
                            {property.name}
                        </option>
                    ))}
                </Select>

                <Select
                    label="Área (opcional)"
                    value={areaId}
                    onChange={(e) => handleAreaChange(e.target.value)}
                    disabled={!propertyId || areas.length === 0}
                    data-testid="reports-area-select"
                >
                    <option value="">Toda a propriedade</option>
                    {areas.map((area) => (
                        <option key={area.id} value={area.id}>
                            {area.name}
                        </option>
                    ))}
                </Select>

                <Select
                    label="Dispositivo (opcional)"
                    value={deviceId}
                    onChange={(e) => setDeviceId(e.target.value)}
                    disabled={!areaId || devices.length === 0}
                    data-testid="reports-device-select"
                >
                    <option value="">Toda a área</option>
                    {devices.map((device) => (
                        <option key={device.id} value={device.id}>
                            {device.name}
                        </option>
                    ))}
                </Select>
            </div>

            {target === null ? (
                <p className="text-muted text-sm">Selecione uma propriedade para começar.</p>
            ) : (
                <ConsumptionSection
                    key={`${target.targetType}-${target.targetId}`}
                    targetType={target.targetType}
                    targetId={target.targetId}
                    granularities={REPORT_GRANULARITIES}
                />
            )}

            <div
                className="border-divider text-muted flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm"
                data-testid="reports-placeholder-banner"
            >
                <Construction className="h-5 w-5 shrink-0" aria-hidden="true" />
                Montagem de relatórios personalizados em breve.
            </div>
        </div>
    )
}
