import { useState } from "react"
import { AlertCircle, Pencil, Plus, Radio, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { MeterFormDialog } from "@/components/meter/MeterFormDialog"
import { RealTimeCard } from "@/components/meter/RealTimeCard"
import { useMeterByTarget } from "@/hooks/queries/useMeters"
import { useDeleteMeter } from "@/hooks/queries/useMeterMutations"
import { extractErrorMessage } from "@/services/api"
import { cn } from "@/lib/cn"
import { METER_PROTOCOL_LABELS, type TargetType } from "@/types/meter.types"
import { toast } from "sonner"

interface MeterSectionProps {
    targetType: TargetType
    targetId: string
}

/**
 * Seção de medidor nas details pages (Property/Area/Device) — substitui o
 * antigo placeholder "Integração IoT" (Fase 5). Mostra:
 *   - Sem medidor: EmptyState + botão "Configurar medidor".
 *   - Com medidor: card de conexão (protocolo + endpoint) com editar/remover
 *     + `RealTimeCard` (leituras via SSE) logo abaixo.
 */
export const MeterSection = ({ targetType, targetId }: MeterSectionProps) => {
    const meterQuery = useMeterByTarget(targetType, targetId)
    const deleteMeter = useDeleteMeter()
    const [dialogOpen, setDialogOpen] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)

    const meter = meterQuery.data

    const handleDelete = async () => {
        if (!meter) return
        try {
            await deleteMeter.mutateAsync(meter.id)
            setConfirmOpen(false)
        } catch (error) {
            toast.error("Erro ao remover medidor", {
                description: extractErrorMessage(error),
            })
        }
    }

    return (
        <section className="flex flex-col gap-3" data-testid="meter-section">
            <header className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Medidor
                </h2>
                {!meter && (
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setDialogOpen(true)}
                        data-testid="meter-section-create"
                    >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Configurar medidor
                    </Button>
                )}
            </header>

            {meterQuery.isLoading && (
                <div
                    className="h-20 animate-pulse rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/50"
                    aria-busy="true"
                    aria-label="Carregando medidor"
                />
            )}

            {meterQuery.isError && (
                <div
                    role="alert"
                    className={cn(
                        "flex items-start gap-3 rounded-lg border p-4",
                        "border-red-200 bg-red-50 text-red-900",
                        "dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200",
                    )}
                >
                    <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <p className="text-sm">
                        {meterQuery.error instanceof Error
                            ? meterQuery.error.message
                            : "Não foi possível carregar o medidor."}
                    </p>
                </div>
            )}

            {meterQuery.isSuccess && !meter && (
                <EmptyState
                    icon={Radio}
                    title="Nenhum medidor vinculado"
                    description="Conecte um medidor IoT (MQTT, Modbus, EtherNet/IP...) para coletar consumo automaticamente, minuto a minuto."
                />
            )}

            {meter && (
                <>
                    <div
                        className={cn(
                            "flex items-center justify-between gap-4 rounded-lg border bg-white p-4",
                            "border-slate-200 dark:border-slate-800 dark:bg-slate-900",
                        )}
                        data-testid="meter-connection-card"
                    >
                        <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                                {meter.name}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                {METER_PROTOCOL_LABELS[meter.protocol]}
                                {meter.host && ` · ${meter.host}${meter.port ? `:${meter.port}` : ""}`}
                                {meter.topic && ` · ${meter.topic}`}
                                {meter.address && ` · ${meter.address}`}
                            </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDialogOpen(true)}
                                aria-label="Editar medidor"
                            >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmOpen(true)}
                                aria-label="Remover medidor"
                            >
                                <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden="true" />
                            </Button>
                        </div>
                    </div>

                    <RealTimeCard meterId={meter.id} />
                </>
            )}

            <MeterFormDialog
                isOpen={dialogOpen}
                onClose={() => setDialogOpen(false)}
                mode={meter ? { kind: "edit", meter } : { kind: "create", targetType, targetId }}
            />

            <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title="Remover medidor"
                description="Isso remove o medidor e todas as leituras associadas. Esta ação não pode ser desfeita."
                confirmLabel="Remover"
                isLoading={deleteMeter.isPending}
                onConfirm={handleDelete}
            />
        </section>
    )
}
