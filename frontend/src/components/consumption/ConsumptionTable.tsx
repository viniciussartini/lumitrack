import { MessageSquare } from "lucide-react"
import { cn } from "@/lib/cn"
import {
    CONSUMPTION_PERIOD_LABELS,
    type ConsumptionRecord,
} from "@/types/consumption.types"
import {
    formatReferenceDate,
    formatKwh,
    formatCostBrl,
} from "@/lib/formatters/consumption"
import { ConsumptionRowMenu } from "@/components/consumption/ConsumptionRowMenu"

interface ConsumptionTableProps {
    records: ConsumptionRecord[]

    /**
     * Quando definido (junto com `onEdit`), habilita a coluna "Ações" e
     * renderiza o `<ConsumptionRowMenu>` em cada linha.
     *
     * Sempre o propertyId ROOT do contexto da página, mesmo quando os
     * registros são de área/dispositivo. Backend exige isso na rota de
     * delete (`/properties/:pid/consumption/:id`).
     */
    propertyId?: string

    /**
     * Callback chamado quando o usuário clica em "Editar" no menu ⋯ de
     * uma linha. Recebe o record para o parent abrir o
     * <ConsumptionFormDialog> em modo edit.
     */
    onEdit?: (record: ConsumptionRecord) => void
}

/**
 * Tabela de registros de consumo.
 *
 * Colunas: Período | Data | kWh | Custo | (Ações?)
 *
 * A coluna "Ações" só aparece quando `propertyId` E `onEdit` estão
 * definidos — mantém o componente reutilizável em contextos read-only
 * sem precisar de prop boolean separada `showActions`.
 */
export const ConsumptionTable = ({
    records,
    propertyId,
    onEdit,
}: ConsumptionTableProps) => {
    const showActions = Boolean(propertyId && onEdit)

    return (
        <div
            className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800"
            data-testid="consumption-table-wrapper"
        >
            <table
                className="w-full text-sm"
                data-testid="consumption-table"
            >
                <thead className="bg-slate-50 dark:bg-slate-900/50">
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        <th scope="col" className="px-4 py-3 font-medium">
                            Período
                        </th>
                        <th scope="col" className="px-4 py-3 font-medium">
                            Data
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-medium">
                            kWh
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-medium">
                            Custo
                        </th>
                        {showActions && (
                            // w-px + whitespace-nowrap = coluna do tamanho do conteúdo
                            // Header vazio com sr-only — coluna óbvia visualmente
                            <th
                                scope="col"
                                className="w-px px-2 py-3"
                            >
                                <span className="sr-only">Ações</span>
                            </th>
                        )}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {records.map((record) => (
                        <Row
                            key={record.id}
                            record={record}
                            propertyId={propertyId}
                            onEdit={onEdit}
                            showActions={showActions}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    )
}

interface RowProps {
    record: ConsumptionRecord
    propertyId?: string
    onEdit?: (record: ConsumptionRecord) => void
    showActions: boolean
}

const Row = ({ record, propertyId, onEdit, showActions }: RowProps) => (
    <tr
        data-testid={`consumption-row-${record.id}`}
        className={cn(
            "text-slate-900 dark:text-slate-100",
            "hover:bg-slate-50 dark:hover:bg-slate-900/50",
        )}
    >
        <td className="px-4 py-3">
            <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                    {CONSUMPTION_PERIOD_LABELS[record.period]}
                </span>
                {record.notes && (
                    <span
                        title={record.notes}
                        data-testid={`consumption-row-${record.id}-notes-icon`}
                        className="text-slate-400 dark:text-slate-500"
                    >
                        <MessageSquare
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                        />
                    </span>
                )}
            </div>
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-slate-700 dark:text-slate-300">
            {formatReferenceDate(record.referenceDate, record.period)}
        </td>
        <td className="px-4 py-3 text-right font-mono tabular-nums">
            {formatKwh(record.kwhConsumed)}
            <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">
                kWh
            </span>
        </td>
        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
            {formatCostBrl(record.costBrl)}
        </td>
        {showActions && propertyId && onEdit && (
            <td className="px-2 py-2">
                <ConsumptionRowMenu
                    record={record}
                    propertyId={propertyId}
                    onEdit={() => onEdit(record)}
                />
            </td>
        )}
    </tr>
)