import { useState } from "react"
import { AlertCircle, Pencil, Plus, Radio, Trash2, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { MeterFormDialog } from "@/components/meter/MeterFormDialog"
import { useMeterByTarget } from "@/hooks/queries/useMeters"
import { useDeleteMeter } from "@/hooks/queries/useMeterMutations"
import { useLiveMeterReading } from "@/hooks/useLiveMeterReading"
import { extractErrorMessage } from "@/services/api"
import { formatCurrentRms, formatPowerKw, formatVoltageRms } from "@/lib/format"
import { cn } from "@/lib/cn"
import { METER_PROTOCOL_LABELS, type TargetType } from "@/types/meter.types"
import { toast } from "sonner"

interface MeterSectionProps {
    targetType: TargetType
    targetId: string
}

/**
 * Seção de medidor nas details pages (Property/Area/Device) — substitui o
 * antigo placeholder "Integração IoT". Mostra:
 *   - Sem medidor: EmptyState + botão "Configurar medidor".
 *   - Com medidor: card (LumiTrack Home.dc.html, bloco "Medidor") com nome/
 *     conexão + status "Conectado"/"Sem leitura recente" e um footer de 3
 *     colunas (Potência/Tensão/Corrente) — leitura via SSE (`useRealtime`),
 *     antes mostrada num `RealTimeCard` separado (removido — a mesma fonte
 *     de dado agora entra inline no card, conforme o protótipo).
 */
export const MeterSection = ({ targetType, targetId }: MeterSectionProps) => {
    const meterQuery = useMeterByTarget(targetType, targetId)
    const deleteMeter = useDeleteMeter()
    const [dialogOpen, setDialogOpen] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)

    const meter = meterQuery.data
    const { reading, isStale, lastKnownPowerW } = useLiveMeterReading(
        targetType,
        targetId,
        meter?.id,
    )

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
            {!meter && (
                <header className="flex items-center justify-between">
                    <h2 className="font-heading text-lg font-semibold uppercase">Medidor</h2>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setDialogOpen(true)}
                        data-testid="meter-section-create"
                    >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Configurar medidor
                    </Button>
                </header>
            )}

            {meterQuery.isLoading && (
                <div
                    className="blueprint h-20 animate-pulse"
                    aria-busy="true"
                    aria-label="Carregando medidor"
                />
            )}

            {meterQuery.isError && (
                <div
                    role="alert"
                    className="border-status-danger/40 flex items-start gap-3 border p-4"
                >
                    <AlertCircle
                        className="text-status-danger h-5 w-5 shrink-0"
                        aria-hidden="true"
                    />
                    <p className="text-status-danger/85 text-sm">
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
                <div className="blueprint">
                    <i className="corner tl" />
                    <i className="corner tr" />
                    <i className="corner bl" />
                    <i className="corner br" />

                    <div className="border-divider flex items-center justify-between border-b px-5 py-4">
                        <span className="font-heading text-17 font-semibold uppercase">
                            Medidor
                        </span>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setDialogOpen(true)}
                                className="text-13 min-h-9"
                            >
                                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                Editar medidor
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmOpen(true)}
                                aria-label="Remover medidor"
                            >
                                <Trash2 className="text-status-danger h-4 w-4" aria-hidden="true" />
                            </Button>
                        </div>
                    </div>

                    <div
                        className="py-18px flex flex-wrap items-center justify-between gap-4 px-5"
                        data-testid="meter-connection-card"
                    >
                        <div className="flex min-w-0 items-center gap-[13px]">
                            <span
                                className="border-accent text-accent flex h-10 w-10 shrink-0 items-center justify-center border"
                                aria-hidden="true"
                            >
                                <Radio className="h-5 w-5" strokeWidth={1.5} />
                            </span>
                            <div className="min-w-0">
                                <p className="text-14-5 truncate font-semibold">{meter.name}</p>
                                <p className="text-muted text-12-5 mt-[3px]">
                                    {METER_PROTOCOL_LABELS[meter.protocol]}
                                    {meter.host &&
                                        ` · ${meter.host}${meter.port ? `:${meter.port}` : ""}`}
                                    {meter.topic && ` · ${meter.topic}`}
                                    {meter.address && ` · ${meter.address}`}
                                </p>
                            </div>
                        </div>

                        {isStale ? (
                            <span
                                className="text-muted font-heading text-11 inline-flex items-center gap-1.5 font-semibold tracking-[.07em] uppercase"
                                data-testid="meter-status-stale"
                            >
                                <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
                                Sem leitura recente
                            </span>
                        ) : (
                            <span className="font-heading text-11 inline-flex items-center gap-1.5 font-semibold tracking-[.07em] text-[#3f8f52] uppercase">
                                <span
                                    className="h-2 w-2 rounded-full bg-[#3f8f52]"
                                    style={{ animation: "lt-pulse 1.6s ease-in-out infinite" }}
                                />
                                Conectado
                            </span>
                        )}
                    </div>

                    <div className="border-divider grid grid-cols-3 border-t">
                        <MeterStat
                            label="Potência"
                            value={
                                lastKnownPowerW !== undefined ? formatPowerKw(lastKnownPowerW) : "—"
                            }
                            className="border-divider border-r"
                        />
                        <MeterStat
                            label="Tensão"
                            value={!isStale && reading ? formatVoltageRms(reading.voltage) : "—"}
                            className="border-divider border-r"
                        />
                        <MeterStat
                            label="Corrente"
                            value={!isStale && reading ? formatCurrentRms(reading.current) : "—"}
                        />
                    </div>
                </div>
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
                onConfirm={() => void handleDelete()}
            />
        </section>
    )
}

interface MeterStatProps {
    label: string
    value: string
    className?: string
}

const MeterStat = ({ label, value, className }: MeterStatProps) => (
    <div className={cn("px-5 py-3.5", className)}>
        <div className="font-heading text-muted text-10 font-semibold tracking-[.07em] uppercase">
            {label}
        </div>
        <div className="font-heading mt-[7px] font-features-['tnum'_1] text-xl font-semibold">
            {value}
        </div>
    </div>
)
