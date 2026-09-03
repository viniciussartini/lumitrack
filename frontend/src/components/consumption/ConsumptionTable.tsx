import {
    formatAvgPowerW,
    formatBucketLabel,
    formatCostBrl,
    formatKwh,
} from "@/lib/formatters/consumption"
import type { BucketSize, ConsumptionBucket } from "@/types/consumption.types"

interface ConsumptionTableProps {
    buckets: ConsumptionBucket[]
    bucketSize: BucketSize
}

/**
 * Tabela de consumo agregado — somente leitura (substitui o antigo
 * CRUD manual). Colunas: Período | kWh | Custo | Potência média.
 *
 * Renderiza na ordem recebida — quem consulta é que define se a janela vem
 * cronológica (`order: "asc"`) ou do mais recente para o mais antigo.
 */
export const ConsumptionTable = ({ buckets, bucketSize }: ConsumptionTableProps) => (
    // Sem borda própria: única consumidora (ConsumptionSection) já envolve a
    // tabela num `.blueprint` — mesmo raciocínio do ConsumptionChart.
    <div className="overflow-x-auto" data-testid="consumption-table-wrapper">
        <table className="w-full text-sm" data-testid="consumption-table">
            <thead className="bg-surface">
                <tr className="text-muted text-left text-xs tracking-wide uppercase">
                    <th scope="col" className="px-4 py-3 font-medium">
                        Período
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                        kWh
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                        Custo
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                        Potência média
                    </th>
                </tr>
            </thead>
            <tbody className="divide-divider divide-y">
                {buckets.map((bucket) => (
                    <tr
                        key={bucket.bucketStart}
                        data-testid={`consumption-row-${bucket.bucketStart}`}
                        className="text-text hover:bg-accent/7"
                    >
                        <td className="text-text/80 px-4 py-3 whitespace-nowrap">
                            {formatBucketLabel(bucket.bucketStart, bucketSize)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                            {formatKwh(bucket.kwhConsumed)}
                            <span className="text-muted ml-1 text-xs">kWh</span>
                        </td>
                        <td className="text-text/80 px-4 py-3 text-right font-mono tabular-nums">
                            {formatCostBrl(bucket.costBrl)}
                        </td>
                        <td className="text-text/80 px-4 py-3 text-right font-mono tabular-nums">
                            {formatAvgPowerW(bucket.avgPowerW)}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
)
