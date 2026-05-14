import { useMemo } from "react"
import { cn } from "@/lib/cn"
import { ReportDatePresets } from "@/components/report/ReportDatePresets"
import type { DatePresetRange } from "@/lib/date/datePresets"
import {
    REPORT_PERIODS,
    REPORT_PERIOD_LABELS,
    type ReportFilters as ReportFiltersType,
    type ReportPeriod,
} from "@/types/report.types"

interface ReportFiltersProps {
    value: ReportFiltersType
    onChange: (next: ReportFiltersType) => void

    /**
     * Permite testes injetarem uma "data atual" determinística nos
     * presets. Em produção: undefined (cada chamada de compute() usa
     * new Date()).
     */
    nowOverride?: Date
}

/**
 * Filtros do relatório: período (obrigatório, chips) + presets de data +
 * range customizado de datas.
 *
 * Hierarquia visual (top-down):
 *   1. Chips de Período  — granularidade dos registros
 *   2. Chips de Preset   — atalhos de range comum (novo no PR2)
 *   3. Inputs De/Até     — range customizado
 *
 * A ordem reflete a frequência de uso esperada: a maioria das vezes o
 * usuário só troca period + clica num preset. Os inputs ficam por último
 * como escape hatch para casos não cobertos pelos presets.
 *
 * Comportamentos:
 *   - Chips de período NÃO toggle off (period é obrigatório).
 *   - Clique no chip ativo é NO-OP.
 *   - Validação inline de from > to.
 *   - min/max cruzados entre inputs de data.
 *   - Botão "Limpar datas" condicional.
 */
export const ReportFilters = ({
    value,
    onChange,
    nowOverride,
}: ReportFiltersProps) => {
    const rangeError = useMemo(() => {
        if (!value.dateFrom || !value.dateTo) return null
        if (value.dateFrom > value.dateTo) {
            return "Data final deve ser maior ou igual à inicial"
        }
        return null
    }, [value.dateFrom, value.dateTo])

    const handlePeriodChange = (next: ReportPeriod) => {
        if (next === value.period) return
        onChange({ ...value, period: next })
    }

    const handleDateFromChange = (next: string) => {
        onChange({ ...value, dateFrom: next || undefined })
    }

    const handleDateToChange = (next: string) => {
        onChange({ ...value, dateTo: next || undefined })
    }

    const handleClearDates = () => {
        onChange({ ...value, dateFrom: undefined, dateTo: undefined })
    }

    const handlePresetSelect = (range: DatePresetRange) => {
        onChange({
            ...value,
            dateFrom: range.dateFrom,
            dateTo: range.dateTo,
        })
    }

    const hasDates = Boolean(value.dateFrom || value.dateTo)

    return (
        <div
            className={cn(
                "flex flex-col gap-4 rounded-lg border p-4",
                "border-slate-200 bg-white",
                "dark:border-slate-800 dark:bg-slate-950",
            )}
            data-testid="report-filters"
        >
            {/* Bloco 1 — Período (granularidade) */}
            <div
                role="group"
                aria-label="Período do relatório"
                className="flex flex-wrap items-center gap-2"
            >
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Período
                </span>
                {REPORT_PERIODS.map((period) => {
                    const isActive = value.period === period
                    return (
                        <button
                            key={period}
                            type="button"
                            aria-pressed={isActive}
                            onClick={() => handlePeriodChange(period)}
                            data-testid={`report-period-chip-${period.toLowerCase()}`}
                            className={cn(
                                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950",
                                isActive
                                    ? "bg-brand-500 text-white shadow-sm hover:bg-brand-600 dark:bg-brand-500 dark:hover:bg-brand-400"
                                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
                            )}
                        >
                            {REPORT_PERIOD_LABELS[period]}
                        </button>
                    )
                })}
            </div>

            {/* Bloco 2 — Presets de data (novo no PR2) */}
            <ReportDatePresets
                dateFrom={value.dateFrom}
                dateTo={value.dateTo}
                onSelect={handlePresetSelect}
                nowOverride={nowOverride}
            />

            {/* Bloco 3 — Range customizado */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <DateField
                    id="report-date-from"
                    testId="report-filter-dateFrom"
                    label="De"
                    value={value.dateFrom ?? ""}
                    max={value.dateTo}
                    onChange={handleDateFromChange}
                />
                <DateField
                    id="report-date-to"
                    testId="report-filter-dateTo"
                    label="Até"
                    value={value.dateTo ?? ""}
                    min={value.dateFrom}
                    onChange={handleDateToChange}
                    hasError={Boolean(rangeError)}
                    errorMessage={rangeError ?? undefined}
                />

                {hasDates && (
                    <button
                        type="button"
                        onClick={handleClearDates}
                        data-testid="report-filter-clearDates"
                        className={cn(
                            "self-start rounded-md px-3 py-2 text-xs font-medium transition-colors",
                            "text-slate-600 hover:bg-slate-100",
                            "dark:text-slate-400 dark:hover:bg-slate-800",
                            "sm:self-end",
                        )}
                    >
                        Limpar datas
                    </button>
                )}
            </div>
        </div>
    )
}

interface DateFieldProps {
    id: string
    testId: string
    label: string
    value: string
    min?: string
    max?: string
    onChange: (next: string) => void
    hasError?: boolean
    errorMessage?: string
}

const DateField = ({
    id,
    testId,
    label,
    value,
    min,
    max,
    onChange,
    hasError,
    errorMessage,
}: DateFieldProps) => {
    const errorId = `${id}-error`
    return (
        <div className="flex flex-1 flex-col gap-1">
            <label
                htmlFor={id}
                className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
                {label}
            </label>
            <input
                id={id}
                type="date"
                value={value}
                min={min}
                max={max}
                onChange={(e) => onChange(e.target.value)}
                data-testid={testId}
                aria-invalid={hasError ? "true" : "false"}
                aria-describedby={hasError && errorMessage ? errorId : undefined}
                className={cn(
                    "rounded-md border bg-white px-3 py-2 text-sm",
                    "text-slate-900",
                    "dark:bg-slate-900 dark:text-slate-100",
                    "focus:outline-none focus:ring-2 focus:ring-brand-500",
                    hasError
                        ? "border-red-400 dark:border-red-700"
                        : "border-slate-300 dark:border-slate-700",
                )}
            />
            {hasError && errorMessage && (
                <p
                    id={errorId}
                    role="alert"
                    className="text-xs text-red-600 dark:text-red-400"
                >
                    {errorMessage}
                </p>
            )}
        </div>
    )
}