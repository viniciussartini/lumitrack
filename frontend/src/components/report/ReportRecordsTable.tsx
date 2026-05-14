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

interface ReportRecordsTableProps {
    records: ConsumptionRecord[]
}

/**
 * Tabela read-only dos registros que entraram no relatório.
 *
 * Por que NÃO reaproveitamos ConsumptionTable?
 *   Ela tem props `propertyId` + `onEdit` que habilitam coluna de ações.
 *   No relatório a tabela é estritamente read-only — não há fluxo de
 *   edição daqui (o usuário vai pra Details pra editar).
 *
 *   Adicionar uma prop `readOnly` no ConsumptionTable só pra esconder
 *   ações duplicaria a API (tem 2 props que já controlam isso, e elas
 *   seriam sempre undefined neste caso). Componente separado fica mais
 *   honesto — só lê e renderiza.
 *
 * Por que MANTEMOS a mesma estrutura visual?
 *   Coesão entre a página de consumo (Details → ConsumptionSection) e a
 *   página de relatório. O usuário reconhece a tabela como "a mesma
 *   tabela de consumo, mas filtrada pelo relatório".
 *
 * Colunas: Período | Data | kWh | Custo
 *
 * Observação sobre `period` exibido:
 *   Cada record TEM seu próprio period (foi salvo originalmente com
 *   um period). Mesmo que o filtro do relatório seja MONTHLY, registros
 *   DAILY podem aparecer (o backend filtra por period antes de agregar).
 *   A tabela mostra o period DO REGISTRO, não o do filtro.
 */
export const ReportRecordsTable = ({ records }: ReportRecordsTableProps) => (
    <div
        className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800"
        data-testid="report-records-table-wrapper"
    >
        <table className="w-full text-sm" data-testid="report-records-table">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <th scope="col" className="px-4 py-3 font-medium">
                        Período
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                        Data
                    </th>
                    <th
                        scope="col"
                        className="px-4 py-3 text-right font-medium"
                    >
                        kWh
                    </th>
                    <th
                        scope="col"
                        className="px-4 py-3 text-right font-medium"
                    >
                        Custo
                    </th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {records.map((record) => (
                    <Row key={record.id} record={record} />
                ))}
            </tbody>
        </table>
    </div>
)

interface RowProps {
    record: ConsumptionRecord
}

const Row = ({ record }: RowProps) => (
    <tr
        data-testid={`report-record-row-${record.id}`}
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
                        data-testid={`report-record-row-${record.id}-notes-icon`}
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
    </tr>
)