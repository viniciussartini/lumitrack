import { useState } from "react"
import { Link, useParams } from "react-router"
import { Cpu, Gauge, Tag } from "lucide-react"
import { cn } from "@/lib/cn"
import { DeviceMenu } from "@/components/device/DeviceMenu"
import { DeviceFormDialog } from "@/components/device/DeviceFormDialog"
import type { Device } from "@/types/device.types"

interface DeviceCardProps {
    device: Device
}

/**
 * Card de dispositivo.
 *
 * Comportamento:
 *   - Click no card → /propriedades/:propertyId/areas/:areaId/devices/:deviceId
 *   - Click no ⋯ → menu com "Editar" e "Excluir" (DeviceMenu)
 *
 * O DeviceMenu fica fora do <Link> (em uma camada visual sobreposta) porque
 * tem seu próprio <button> e clicks que NÃO devem propagar pro link
 * envolvente. O CSS `relative` no wrapper + `absolute` no menu resolve sem
 * precisar tirar o link.
 *
 * O menu não recebe onAfterDelete — quando o card é deletado da lista, o
 * próprio invalidate da query no hook re-renderiza o pai (AreaDetailsPage)
 * sem o card removido. Não há rota a navegar.
 *
 *   O Device só sabe o areaId — não tem propertyId no objeto. Mas o link
 *   precisa do propertyId pra montar a URL. O propertyId vem 
 *   via useParams da rota envolvente (este card só renderiza dentro de
 *   AreaDetailsPage, que já tem :propertyId no path).
 */
export const DeviceCard = ({ device }: DeviceCardProps) => {
    const { propertyId } = useParams<{ propertyId: string }>()
    const [isEditOpen, setIsEditOpen] = useState(false)

    // Concatena marca + modelo num chip único quando ao menos um existe
    const brandModelLabel = [device.brand, device.model]
        .filter(Boolean)
        .join(" · ")

    return (
        <div className="relative">
            <Link
                to={`/propriedades/${propertyId}/areas/${device.areaId}/devices/${device.id}`}
                className={cn(
                    "group flex flex-col gap-3 rounded-lg border bg-white p-5 transition",
                    "border-slate-200 hover:border-brand-500 hover:shadow-md",
                    "dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-500",
                )}
                data-testid={`device-card-${device.id}`}
            >
                {/* Header — pr-10 reserva espaço pro DeviceMenu (em absolute) */}
                <div className="flex items-start gap-3 pr-10">
                    <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-50 dark:bg-brand-500/10"
                        aria-hidden="true"
                    >
                        <Cpu className="h-5 w-5 text-brand-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold text-slate-900 dark:text-slate-100">
                            {device.name}
                        </h3>
                    </div>
                </div>

                {/* Metadados — só renderiza a div se tiver algo pra mostrar */}
                {(brandModelLabel || device.powerWatts !== null) && (
                    <div className="flex flex-wrap gap-2">
                        {brandModelLabel && (
                            <span
                                className={cn(
                                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
                                    "bg-slate-100 text-slate-700",
                                    "dark:bg-slate-800 dark:text-slate-300",
                                )}
                            >
                                <Tag
                                    className="h-3 w-3"
                                    aria-hidden="true"
                                />
                                <span className="max-w-50 truncate">
                                    {brandModelLabel}
                                </span>
                            </span>
                        )}
                        {device.powerWatts !== null && (
                            <span
                                className={cn(
                                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
                                    "bg-brand-50 text-brand-700",
                                    "dark:bg-brand-500/10 dark:text-brand-300",
                                )}
                            >
                                <Gauge
                                    className="h-3 w-3"
                                    aria-hidden="true"
                                />
                                {device.powerWatts}W
                            </span>
                        )}
                    </div>
                )}
            </Link>

            <DeviceMenu device={device} onEdit={() => setIsEditOpen(true)} />

            {propertyId && (
                <DeviceFormDialog
                    isOpen={isEditOpen}
                    onClose={() => setIsEditOpen(false)}
                    mode={{ kind: "edit", propertyId, areaId: device.areaId, device }}
                />
            )}
        </div>
    )
}