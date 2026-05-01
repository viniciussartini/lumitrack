import { useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { Link } from "react-router-dom"
import { DistributorForm } from "@/components/distributor/DistributorForm"
import { useCreateDistributor } from "@/hooks/queries/useDistributorMutations"
import { extractErrorMessage } from "@/services/api"
import { toast } from "sonner"
import { cn } from "@/lib/cn"
import type { DistributorFormData } from "@/schemas/distributor.schema"
import type { CreateDistributorInput } from "@/types/distributor.types"

/**
 * Página de cadastro de nova distribuidora.
 *
 * Conversões aplicadas no submit:
 *   - taxRate: percentual (UI) → decimal (backend). 12 → 0.12
 *   - undefined em campos opcionais é OMITIDO do payload (não envia null)
 */
export const NewDistributorPage = () => {
    const navigate = useNavigate()
    const createMutation = useCreateDistributor()

    const handleSubmit = async (data: DistributorFormData) => {
        const payload: CreateDistributorInput = {
            name: data.name,
            cnpj: data.cnpj,
            electricalSystem: data.electricalSystem,
            workingVoltage: data.workingVoltage,
            kwhPrice: data.kwhPrice,
            // Conversão: percentual UI → decimal backend
            ...(data.taxRate !== undefined && { taxRate: data.taxRate / 100 }),
            ...(data.publicLightingFee !== undefined && {
                publicLightingFee: data.publicLightingFee,
            }),
        }

        try {
            await createMutation.mutateAsync(payload)
            navigate("/distribuidoras", { replace: true })
        } catch (error) {
            // O toast de sucesso é disparado pelo hook. Aqui só erro.
            toast.error("Erro ao criar distribuidora", {
                description: extractErrorMessage(error),
            })
        }
    }

    return (
        <div className="flex flex-col gap-6">
            {/* Breadcrumb / voltar */}
            <Link
                to="/distribuidoras"
                className={cn(
                    "inline-flex w-fit items-center gap-1 text-sm",
                    "text-slate-600 hover:text-slate-900",
                    "dark:text-slate-400 dark:hover:text-slate-200",
                )}
            >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Voltar para distribuidoras
            </Link>

            <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    Nova distribuidora
                </h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Cadastre uma distribuidora de energia para vincular às suas propriedades.
                </p>
            </div>

            <div
                className={cn(
                    "rounded-lg border bg-white p-6 shadow-sm",
                    "border-slate-200 dark:border-slate-800 dark:bg-slate-900",
                )}
            >
                <DistributorForm
                    onSubmit={handleSubmit}
                    onCancel={() => navigate("/distribuidoras")}
                    submitLabel="Criar distribuidora"
                />
            </div>
        </div>
    )
}