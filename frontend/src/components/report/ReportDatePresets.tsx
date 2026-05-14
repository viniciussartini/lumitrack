import { cn } from "@/lib/cn"
import {
    DATE_PRESETS,
    detectActivePreset,
    type DatePresetId,
    type DatePresetRange,
} from "@/lib/date/datePresets"

interface ReportDatePresetsProps {
    /** Estado atual das datas (vem do filtro). */
    dateFrom: string | undefined
    dateTo: string | undefined

    /**
     * Callback quando um preset é selecionado.
     *
     * Recebe o range computado, não o id do preset — quem consome
     * (ReportFilters) só precisa saber as novas datas. Manter o
     * componente "burro" em relação aos IDs evita acoplamento.
     */
    onSelect: (range: DatePresetRange) => void

    /**
     * Permite injetar uma data fixa nos testes para evitar
     * dependência da data real do sistema. Em produção, undefined
     * deixa cada compute() usar `new Date()`.
     *
     * Decisão: aceitar a injeção *somente para testes* em vez de
     * usar Date.now() ou vi.setSystemTime. Mantém os testes
     * determinísticos sem mexer em mock global do Date.
     */
    nowOverride?: Date
}

/**
 * Chips de presets de data.
 *
 * Comportamento:
 *   - Click num chip: chama onSelect com o range computado.
 *   - Click no chip JÁ ativo: também chama (pode ser que o usuário
 *     queira "resetar" pra hoje depois de ter mudado pra ontem).
 *     Isso é DIFERENTE dos chips de Período (lá o toggle off não
 *     existe porque period é obrigatório). Aqui o "off" é uma
 *     ação válida em qualquer momento.
 *
 * Detecção de chip ativo:
 *   Comparação exata de strings. Se o usuário tem "2026-05-01 a
 *   2026-05-13" e hoje é 13/05/2026, "Este mês" fica destacado.
 *   No dia seguinte (14/05), o mesmo range NÃO mais corresponde a
 *   "Este mês" e o chip apaga — está correto (o range agora é
 *   personalizado).
 *
 * Acessibilidade:
 *   <div role="group"> agrupa semanticamente os chips com aria-label.
 *   Cada button usa aria-pressed pra indicar estado ativo (igual aos
 *   chips de período).
 */
export const ReportDatePresets = ({
    dateFrom,
    dateTo,
    onSelect,
    nowOverride,
}: ReportDatePresetsProps) => {
    const activeId: DatePresetId | undefined = detectActivePreset(
        dateFrom,
        dateTo,
        nowOverride,
    )

    return (
        <div
            role="group"
            aria-label="Atalhos de período"
            data-testid="report-date-presets"
            className="flex flex-wrap items-center gap-2"
        >
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Atalhos
            </span>
            {DATE_PRESETS.map((preset) => {
                const isActive = activeId === preset.id
                return (
                    <button
                        key={preset.id}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => onSelect(preset.compute(nowOverride))}
                        data-testid={`report-date-preset-${preset.id}`}
                        className={cn(
                            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950",
                            isActive
                                ? "bg-brand-500 text-white shadow-sm hover:bg-brand-600 dark:bg-brand-500 dark:hover:bg-brand-400"
                                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
                        )}
                    >
                        {preset.label}
                    </button>
                )
            })}
        </div>
    )
}