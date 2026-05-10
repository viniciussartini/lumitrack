import { useEffect, useRef } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/Button"
import { cn } from "@/lib/cn"
import {
    consumptionFormSchema,
    type ConsumptionFormData,
    type ConsumptionFormInput,
} from "@/schemas/consumption.schema"
import {
    CONSUMPTION_PERIODS,
    CONSUMPTION_PERIOD_LABELS,
    type ConsumptionPeriod,
    type ConsumptionRecord,
} from "@/types/consumption.types"
import {
    isoToFormInput,
    periodToDateLabel,
    periodToInputType,
    todayForPeriod,
} from "@/lib/consumption-date"

interface ConsumptionFormProps {
    initialData?: ConsumptionRecord
    onSubmit: (data: ConsumptionFormData) => Promise<void>
    onCancel: () => void
    submitLabel?: string
}

export const ConsumptionForm = ({
    initialData,
    onSubmit,
    onCancel,
    submitLabel = "Salvar",
}: ConsumptionFormProps) => {
    const isEditMode = Boolean(initialData)

    const {
        control,
        register,
        handleSubmit,
        setValue,
        formState: { errors, isSubmitting },
    } = useForm<ConsumptionFormInput, unknown, ConsumptionFormData>({
        resolver: zodResolver(consumptionFormSchema),
        mode: "onBlur",
        defaultValues: initialData
            ? {
                period: initialData.period,
                referenceDate: isoToFormInput(
                    initialData.referenceDate,
                    initialData.period,
                ),
                kwhConsumed: initialData.kwhConsumed,
                notes: initialData.notes ?? "",
            }
            : {
                period: "DAILY",
                referenceDate: todayForPeriod("DAILY"),
                kwhConsumed: "",
                notes: "",
            },
    })

    const period = useWatch({ control, name: "period" })

    /**
     * Reseta `referenceDate` APENAS quando o period muda de valor (não no mount).
     *
     * `prevPeriodRef` inicia como `null` (sentinela de "ainda não setado").
     *
     * Invocações do effect:
     *   - 1ª (mount):    prev=null   → `prev===null`   → return early
     *   - 2ª (StrictMode re-run): prev=period atual   → `prev===period` → return early
     *   - Mudança real:  prev≠period → reseta referenceDate
     *
     * Por que não `isFirstRender / didMountRef`:
     *   Refs NÃO são resetadas no StrictMode unmount/remount cycle. Na 2ª
     *   invocação, `didMountRef.current` já seria `true`, fazendo o guard falhar.
     *   `prevPeriodRef` compara VALORES, então funciona em qualquer scenario.
     */
    const prevPeriodRef = useRef<ConsumptionPeriod | null>(null)

    useEffect(() => {
        const prev = prevPeriodRef.current
        prevPeriodRef.current = period

        // Primeira invocação (null) ou re-run sem mudança real → não faz nada
        if (prev === null || prev === period) {
            return
        }

        // Em modo edição, period é readonly — defensivo
        if (isEditMode) {
            return
        }

        setValue("referenceDate", "", {
            shouldValidate: false,
            shouldDirty: false,
        })
    }, [period, isEditMode, setValue])

    const dateInputType = periodToInputType(period ?? "DAILY")
    const dateLabel = periodToDateLabel(period ?? "DAILY")

    return (
        <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
            data-testid="consumption-form"
            noValidate
        >
            {isEditMode && (
                <div
                    className={cn(
                        "rounded-md border px-3 py-2 text-xs",
                        "border-amber-200 bg-amber-50 text-amber-900",
                        "dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200",
                    )}
                    data-testid="consumption-form-edit-warning"
                >
                    Período e data não podem ser alterados. Para mudá-los,
                    exclua o registro e crie um novo.
                </div>
            )}

            {/* Period */}
            <div className="flex flex-col gap-1">
                <label
                    htmlFor="consumption-period"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                    Período
                    {isEditMode && (
                        <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                            (não editável)
                        </span>
                    )}
                </label>
                <select
                    id="consumption-period"
                    data-testid="consumption-form-period"
                    {...register("period")}
                    disabled={isEditMode}
                    aria-invalid={errors.period ? "true" : "false"}
                    className={cn(
                        "rounded-md border bg-white px-3 py-2 text-sm",
                        "border-slate-300 text-slate-900",
                        "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
                        "focus:outline-none focus:ring-2 focus:ring-brand-500",
                        "disabled:cursor-not-allowed disabled:opacity-60",
                    )}
                >
                    {CONSUMPTION_PERIODS.map((p) => (
                        <option key={p} value={p}>
                            {CONSUMPTION_PERIOD_LABELS[p]}
                        </option>
                    ))}
                </select>
                {errors.period && (
                    <p
                        className="text-xs text-red-600 dark:text-red-400"
                        role="alert"
                    >
                        {errors.period.message}
                    </p>
                )}
            </div>

            {/* Reference date */}
            <div className="flex flex-col gap-1">
                <label
                    htmlFor="consumption-referenceDate"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                    {dateLabel}
                    {isEditMode && (
                        <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                            (não editável)
                        </span>
                    )}
                </label>
                <input
                    id="consumption-referenceDate"
                    data-testid="consumption-form-referenceDate"
                    type={dateInputType}
                    {...register("referenceDate")}
                    disabled={isEditMode}
                    {...(dateInputType === "number" && {
                        min: 2000,
                        max: 2100,
                        step: 1,
                    })}
                    aria-invalid={errors.referenceDate ? "true" : "false"}
                    className={cn(
                        "rounded-md border bg-white px-3 py-2 text-sm",
                        "border-slate-300 text-slate-900",
                        "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
                        "focus:outline-none focus:ring-2 focus:ring-brand-500",
                        "disabled:cursor-not-allowed disabled:opacity-60",
                    )}
                />
                {errors.referenceDate && (
                    <p
                        className="text-xs text-red-600 dark:text-red-400"
                        role="alert"
                    >
                        {errors.referenceDate.message}
                    </p>
                )}
            </div>

            {/* kWh consumido */}
            <div className="flex flex-col gap-1">
                <label
                    htmlFor="consumption-kwhConsumed"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                    Consumo (kWh)
                </label>
                <input
                    id="consumption-kwhConsumed"
                    data-testid="consumption-form-kwhConsumed"
                    type="number"
                    step="0.001"
                    min="0"
                    {...register("kwhConsumed")}
                    aria-invalid={errors.kwhConsumed ? "true" : "false"}
                    className={cn(
                        "rounded-md border bg-white px-3 py-2 text-sm",
                        "border-slate-300 text-slate-900",
                        "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
                        "focus:outline-none focus:ring-2 focus:ring-brand-500",
                    )}
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    Custo será calculado automaticamente com a tarifa da
                    distribuidora vinculada à propriedade.
                </p>
                {errors.kwhConsumed && (
                    <p
                        className="text-xs text-red-600 dark:text-red-400"
                        role="alert"
                    >
                        {errors.kwhConsumed.message}
                    </p>
                )}
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1">
                <label
                    htmlFor="consumption-notes"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                    Observações{" "}
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                        (opcional)
                    </span>
                </label>
                <textarea
                    id="consumption-notes"
                    data-testid="consumption-form-notes"
                    {...register("notes")}
                    rows={3}
                    maxLength={500}
                    aria-invalid={errors.notes ? "true" : "false"}
                    className={cn(
                        "rounded-md border bg-white px-3 py-2 text-sm",
                        "border-slate-300 text-slate-900",
                        "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
                        "focus:outline-none focus:ring-2 focus:ring-brand-500",
                        "resize-none",
                    )}
                />
                {errors.notes && (
                    <p
                        className="text-xs text-red-600 dark:text-red-400"
                        role="alert"
                    >
                        {errors.notes.message}
                    </p>
                )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
                <Button
                    type="button"
                    variant="secondary"
                    onClick={onCancel}
                    disabled={isSubmitting}
                    data-testid="consumption-form-cancel"
                >
                    Cancelar
                </Button>
                <Button
                    type="submit"
                    disabled={isSubmitting}
                    data-testid="consumption-form-submit"
                >
                    {isSubmitting ? "Salvando..." : submitLabel}
                </Button>
            </div>
        </form>
    )
}