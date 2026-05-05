import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import {
    deviceFormSchema,
    type DeviceFormData,
    type DeviceFormInput,
} from "@/schemas/device.schema"
import type { Device } from "@/types/device.types"

interface DeviceFormProps {
    /** Dados iniciais — quando presente, o form opera em modo edição */
    initialData?: Device
    /** Callback de submit. Recebe os dados validados e transformados. */
    onSubmit: (data: DeviceFormData) => Promise<void>
    /** Callback de cancelamento — geralmente um navigate("..") */
    onCancel: () => void
    /** Texto do botão de submit. Default: "Salvar" */
    submitLabel?: string
}

/**
 * Form de dispositivo — usado em criação e edição.
 *
 * Diferenças entre os modos:
 *   - CRIAÇÃO (initialData=undefined): defaults vazios
 *   - EDIÇÃO (initialData=Device): campos pré-preenchidos. null → "" nos
 *     opcionais (vide defaultValues), e o schema converte string vazia
 *     de volta pra undefined antes do submit.
 *
 * Helper de potência típica:
 *   O input de powerWatts tem `helperText` com sugestões de wattagens
 *   típicas de eletrodomésticos comuns. É só uma referência visual — não
 *   há autocomplete nem validação contra esses valores.
 *
 * `<input type="number" value={null}>` reclama em runtime — input numérico
 * só aceita string ou number. Por isso convertemos null pra "" no
 * defaultValues; e o schema cuida da volta "" → undefined no submit.
 */
export const DeviceForm = ({
    initialData,
    onSubmit,
    onCancel,
    submitLabel = "Salvar",
}: DeviceFormProps) => {
    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<DeviceFormInput, unknown, DeviceFormData>({
        resolver: zodResolver(deviceFormSchema),
        mode: "onBlur",
        defaultValues: initialData
            ? {
                name: initialData.name,
                brand: initialData.brand ?? "",
                model: initialData.model ?? "",
                // null → "" pro <input type="number"> não dar warning
                powerWatts:
                    initialData.powerWatts !== null
                        ? String(initialData.powerWatts)
                        : "",
            }
            : {
                name: "",
                brand: "",
                model: "",
                powerWatts: "",
            },
    })

    return (
        <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-6"
            noValidate
        >
            <div className="flex flex-col gap-4">
                <Input
                    label="Nome do dispositivo"
                    autoFocus
                    placeholder="Ar-condicionado da sala"
                    error={errors.name?.message}
                    {...register("name")}
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input
                        label="Marca"
                        placeholder="Daikin"
                        helperText="Opcional"
                        error={errors.brand?.message}
                        {...register("brand")}
                    />
                    <Input
                        label="Modelo"
                        placeholder="Split 12000 BTU"
                        helperText="Opcional"
                        error={errors.model?.message}
                        {...register("model")}
                    />
                </div>

                <Input
                    label="Potência (W)"
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min="1"
                    placeholder="1200"
                    helperText="Opcional. Ex: Geladeira ~150W · Microondas ~1200W · Ar-condicionado ~1500W · TV LED 40\' ~50W"
                    error={errors.powerWatts?.message}
                    {...register("powerWatts")}
                />
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                <Button
                    type="button"
                    variant="secondary"
                    onClick={onCancel}
                    disabled={isSubmitting}
                >
                    Cancelar
                </Button>
                <Button type="submit" isLoading={isSubmitting}>
                    {submitLabel}
                </Button>
            </div>
        </form>
    )
}