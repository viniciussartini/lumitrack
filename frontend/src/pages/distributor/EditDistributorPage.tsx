import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { DistributorForm } from "@/components/distributor/DistributorForm"
import { Button } from "@/components/ui/Button"
import {
    useDistributor,
} from "@/hooks/queries/useDistributors"
import { useUpdateDistributor } from "@/hooks/queries/useDistributorMutations"
import { extractErrorMessage } from "@/services/api"
import { cn } from "@/lib/cn"
import type { DistributorFormData } from "@/schemas/distributor.schema"
import type { UpdateDistributorInput } from "@/types/distributor.types"

export const EditDistributorPage = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()

    const { data: distributor, isLoading, isError, error } = useDistributor(id)
    const updateMutation = useUpdateDistributor()

    const handleSubmit = async (data: DistributorFormData) => {
        if (!id) return

        const payload: UpdateDistributorInput = {
            name: data.name,
            electricalSystem: data.electricalSystem,
            workingVoltage: data.workingVoltage,
            kwhPrice: data.kwhPrice,
            // CNPJ não vai no payload — é imutável
            ...(data.taxRate !== undefined && { taxRate: data.taxRate / 100 }),
            ...(data.publicLightingFee !== undefined && {
                publicLightingFee: data.publicLightingFee,
            }),
        }

        try {
            await updateMutation.mutateAsync({ id, input: payload })
            navigate("/distribuidoras", { replace: true })
        } catch (error) {
            toast.error("Erro ao atualizar distribuidora", {
                description: extractErrorMessage(error),
            })
        }
    }

    return (
        <div className="flex flex-col gap-6">
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
                    Editar distribuidora
                </h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Atualize os dados da distribuidora.
                </p>
            </div>

            {isLoading && <FormSkeleton />}

            {isError && (
                <ErrorState
                    message={
                        error instanceof Error
                            ? error.message
                            : "Erro ao carregar distribuidora"
                    }
                />
            )}

            {!isLoading && !isError && distributor && (
                <div
                    className={cn(
                        "rounded-lg border bg-white p-6 shadow-sm",
                        "border-slate-200 dark:border-slate-800 dark:bg-slate-900",
                    )}
                >
                    <DistributorForm
                        initialData={distributor}
                        onSubmit={handleSubmit}
                        onCancel={() => navigate("/distribuidoras")}
                        submitLabel="Salvar alterações"
                    />
                </div>
            )}
        </div>
    )
}

const FormSkeleton = () => (
    <div
        className={cn(
            "h-96 animate-pulse rounded-lg border bg-white p-6",
            "border-slate-200 dark:border-slate-800 dark:bg-slate-900",
        )}
        aria-busy="true"
        aria-label="Carregando dados"
    />
)

interface ErrorStateProps {
    message: string
}

const ErrorState = ({ message }: ErrorStateProps) => (
    <div
        role="alert"
        className={cn(
            "flex flex-col items-center justify-center gap-4 rounded-lg border border-red-200 bg-red-50 py-12 text-center",
            "dark:border-red-900 dark:bg-red-950/30",
        )}
    >
        <AlertCircle
            className="h-8 w-8 text-red-500 dark:text-red-400"
            aria-hidden="true"
        />
        <div>
            <h3 className="font-semibold text-red-900 dark:text-red-200">
                Não foi possível carregar
            </h3>
            <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                {message}
            </p>
        </div>
        <Button asChild variant="secondary">
            <Link to="/distribuidoras">Voltar para a lista</Link>
        </Button>
    </div>
)