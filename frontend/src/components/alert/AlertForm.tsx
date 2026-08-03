import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import {
    alertFormSchema,
    type AlertFormData,
    type AlertFormInput,
} from "@/schemas/alert.schema"
import type { AlertWithStatus } from "@/types/alert.types"
import type { Meter } from "@/types/meter.types"

interface AlertFormProps {
    /** Dados iniciais — quando presente, o form opera em modo edição
     * (o medidor não é mais selecionável, é imutável). */
    initialData?: AlertWithStatus
    /** Medidores disponíveis para o Select — só usado em modo criação. */
    meters: Meter[]
    onSubmit: (data: AlertFormData) => Promise<void>
    onCancel: () => void
    submitLabel?: string
}

/**
 * Form de Alerta — faixa de potência (Fase 5, substitui o antigo threshold
 * de kWh acumulado). `meterId` é imutável: em edição viaja como campo
 * hidden com o valor original, sem exigir nova escolha do usuário.
 *
 * Sem `autoFocus` no primeiro campo (achado durante #107): o `Dialog.Content`
 * do Radix já move foco pro primeiro elemento focável ao abrir — competir
 * com um `autoFocus` HTML explícito faz o PRIMEIRO clique no botão de
 * submit, sem tocar em nenhum campo antes, disparar só a validação onBlur
 * do campo focado (não o submit real), escondendo os outros erros até um
 * segundo clique. Bug real do padrão `FormDialog`, não só deste form —
 * `AreaForm`/`DeviceForm` têm o mesmo `autoFocus` redundante e o mesmo risco,
 * fora do escopo desta sub-issue (só Alertas).
 */
export const AlertForm = ({
    initialData,
    meters,
    onSubmit,
    onCancel,
    submitLabel = "Salvar",
}: AlertFormProps) => {
    const isEditMode = Boolean(initialData)

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<AlertFormInput, unknown, AlertFormData>({
        resolver: zodResolver(alertFormSchema),
        mode: "onBlur",
        defaultValues: initialData
            ? {
                name: initialData.name,
                meterId: initialData.meterId,
                referencePowerKw: initialData.referencePowerKw,
                tolerancePercent: initialData.tolerancePercent,
                enabled: initialData.enabled,
            }
            : {
                name: "",
                meterId: "",
                referencePowerKw: undefined,
                tolerancePercent: 10,
                enabled: true,
            },
    })

    return (
        <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
            noValidate
        >
            <Input
                label="Nome do alerta"
                placeholder="Ar-condicionado ligado demais"
                error={errors.name?.message}
                data-testid="alert-form-name"
                {...register("name")}
            />

            {isEditMode ? (
                <input type="hidden" {...register("meterId")} />
            ) : (
                <Select
                    label="Medidor"
                    error={errors.meterId?.message}
                    data-testid="alert-form-meterId"
                    {...register("meterId")}
                >
                    <option value="" disabled>
                        Selecione
                    </option>
                    {meters.map((meter) => (
                        <option key={meter.id} value={meter.id}>
                            {meter.name}
                        </option>
                    ))}
                </Select>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                    label="Potência de referência (kW)"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0.01"
                    placeholder="10"
                    error={errors.referencePowerKw?.message}
                    data-testid="alert-form-referencePowerKw"
                    {...register("referencePowerKw")}
                />

                <Input
                    label="Tolerância (%)"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="0"
                    max="100"
                    placeholder="10"
                    helperText="Ex.: 10 kW ± 2% dispara fora de [9,8 – 10,2] kW."
                    error={errors.tolerancePercent?.message}
                    data-testid="alert-form-tolerancePercent"
                    {...register("tolerancePercent")}
                />
            </div>

            <label className="flex items-center gap-2 text-sm">
                <input
                    type="checkbox"
                    className="accent-accent h-4 w-4"
                    data-testid="alert-form-enabled"
                    {...register("enabled")}
                />
                Alerta habilitado
            </label>

            <div className="flex justify-end gap-2 pt-2">
                <Button
                    type="button"
                    variant="secondary"
                    onClick={onCancel}
                    disabled={isSubmitting}
                    data-testid="alert-form-cancel"
                >
                    Cancelar
                </Button>
                <Button
                    type="submit"
                    isLoading={isSubmitting}
                    data-testid="alert-form-submit"
                >
                    {submitLabel}
                </Button>
            </div>
        </form>
    )
}
