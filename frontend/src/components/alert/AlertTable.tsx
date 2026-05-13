import { AlertStatusBadge } from "@/components/alert/AlertStatusBadge"
import { AlertRowMenu } from "@/components/alert/AlertRowMenu"
import {
    formatAlertTarget,
    formatThresholdKwh,
    formatTriggeredAt,
    type AlertTargetLookup,
} from "@/lib/formatters/alert"
import { cn } from "@/lib/cn"
import type { Alert } from "@/types/alert.types"

interface AlertTableProps {
    alerts: Alert[]

    /**
     * Quando true, renderiza coluna "Alvo" no início.
     * Padrão: false (uso na seção nested, onde o alvo é redundante).
     */
    showTarget?: boolean

    /**
     * Dicionário opcional para resolver nomes legíveis dos IDs polimórficos
     * na coluna "Alvo". Só faz sentido com showTarget=true.
     */
    targetLookup?: AlertTargetLookup

    /**
     * Callback chamado quando o usuário clica em "Editar" no menu ⋯ de
     * uma linha. Recebe o alert para o parent abrir o
     * <AlertFormDialog> em modo edit.
     *
     * Quando definido, habilita a coluna "Ações" com o <AlertRowMenu>
     * em cada linha. Quando omitido, a tabela é puramente read-only.
     *
     * Mesma estratégia do ConsumptionTable (showActions implícito).
     */
    onEdit?: (alert: Alert) => void
}

/**
 * Tabela de alertas — usada na seção nested e na AlertsPage global.
 *
 * Colunas read-only (nested):    Limite | Status | Disparado em
 * Colunas read-only (global):    Alvo | Limite | Status | Disparado em
 *
 * Com onEdit definido, adiciona coluna "Ações" ao final em ambos os modos.
 *
 * Ordenação: NÃO é responsabilidade da tabela. O parent (AlertSection ou
 * AlertsPage) reordena conforme a regra de prioridade (TRIGGERED não-lido
 * > ACTIVE > READ) antes de passar o array.
 */
export const AlertTable = ({
    alerts,
    showTarget = false,
    targetLookup,
    onEdit,
}: AlertTableProps) => {
    const showActions = Boolean(onEdit)

    return (
        <div
            className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800"
            data-testid="alert-table-wrapper"
        >
            <table className="w-full text-sm" data-testid="alert-table">
                <thead className="bg-slate-50 dark:bg-slate-900/50">
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {showTarget && (
                            <th scope="col" className="px-4 py-3 font-medium">
                                Alvo
                            </th>
                        )}
                        <th
                            scope="col"
                            className="px-4 py-3 text-right font-medium"
                        >
                            Limite
                        </th>
                        <th scope="col" className="px-4 py-3 font-medium">
                            Status
                        </th>
                        <th scope="col" className="px-4 py-3 font-medium">
                            Disparado em
                        </th>
                        {showActions && (
                            // w-px + sr-only: coluna do tamanho do conteúdo,
                            // header acessível mas sem label visual
                            <th scope="col" className="w-px px-2 py-3">
                                <span className="sr-only">Ações</span>
                            </th>
                        )}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {alerts.map((alert) => (
                        <Row
                            key={alert.id}
                            alert={alert}
                            showTarget={showTarget}
                            targetLookup={targetLookup}
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
    alert: Alert
    showTarget: boolean
    targetLookup?: AlertTargetLookup
    onEdit?: (alert: Alert) => void
    showActions: boolean
}

const Row = ({
    alert,
    showTarget,
    targetLookup,
    onEdit,
    showActions,
}: RowProps) => (
    <tr
        data-testid={`alert-row-${alert.id}`}
        className={cn(
            "text-slate-900 dark:text-slate-100",
            "hover:bg-slate-50 dark:hover:bg-slate-900/50",
        )}
    >
        {showTarget && (
            <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                {formatAlertTarget(alert, targetLookup)}
            </td>
        )}
        <td className="px-4 py-3 text-right font-mono tabular-nums">
            {formatThresholdKwh(alert.thresholdKwh)}
        </td>
        <td className="px-4 py-3">
            <AlertStatusBadge alert={alert} />
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-slate-700 dark:text-slate-300">
            {formatTriggeredAt(alert.triggeredAt)}
        </td>
        {showActions && onEdit && (
            <td className="px-2 py-2">
                <AlertRowMenu
                    alert={alert}
                    onEdit={() => onEdit(alert)}
                />
            </td>
        )}
    </tr>
)