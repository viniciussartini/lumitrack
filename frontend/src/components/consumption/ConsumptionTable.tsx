import { cn } from "@/lib/cn"
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
 * Tabela de consumo agregado — somente leitura (Fase 5, substitui o antigo
 * CRUD manual). Colunas: Período | kWh | Custo | Potência média.
 *
 * Renderiza na ordem recebida — quem consulta é que define se a janela vem
 * cronológica (`order: "asc"`) ou do mais recente para o mais antigo.
 */
export const ConsumptionTable = ({ buckets, bucketSize }: ConsumptionTableProps) => (
    <div
        className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800"
        data-testid="consumption-table-wrapper"
    >
        <table className="w-full text-sm" data-testid="consumption-table">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
                <tr className="text-left text-xs tracking-wide text-slate-500 uppercase dark:text-slate-400">
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
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {buckets.map((bucket) => (
                    <tr
                        key={bucket.bucketStart}
                        data-testid={`consumption-row-${bucket.bucketStart}`}
                        className={cn(
                            "text-slate-900 dark:text-slate-100",
                            "hover:bg-slate-50 dark:hover:bg-slate-900/50",
                        )}
                    >
                        <td className="px-4 py-3 whitespace-nowrap text-slate-700 dark:text-slate-300">
                            {formatBucketLabel(bucket.bucketStart, bucketSize)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                            {formatKwh(bucket.kwhConsumed)}
                            <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">
                                kWh
                            </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700 tabular-nums dark:text-slate-300">
                            {formatCostBrl(bucket.costBrl)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700 tabular-nums dark:text-slate-300">
                            {formatAvgPowerW(bucket.avgPowerW)}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
)
