import { useState } from "react"
import { Link, useParams } from "react-router"
import { Cpu } from "lucide-react"
import { DeviceMenu } from "@/components/device/DeviceMenu"
import { DeviceFormDialog } from "@/components/device/DeviceFormDialog"
import { Tag } from "@/components/ui/Tag"
import type { Device } from "@/types/device.types"

interface DeviceCardProps {
    device: Device
}

/**
 * Card de dispositivo — LumiTrack Home.dc.html, bloco "Dispositivos" da
 * areaDetailView (card minimalista: só borda, sem `.blueprint`/corners,
 * mesmo estilo do AreaCard).
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
                className="border-divider flex flex-col gap-3 border p-4"
                data-testid={`device-card-${device.id}`}
            >
                {/* pr-8 reserva o espaço onde o DeviceMenu fica em absolute */}
                <div className="flex items-center gap-2.5 pr-8">
                    <span
                        className="border-accent text-accent flex h-[38px] w-[38px] shrink-0 items-center justify-center border"
                        aria-hidden="true"
                    >
                        <Cpu className="h-[19px] w-[19px]" strokeWidth={1.5} />
                    </span>
                    <h3 className="min-w-0 truncate text-sm font-semibold">{device.name}</h3>
                </div>

                {(brandModelLabel || device.powerWatts !== null) && (
                    <div className="flex flex-wrap gap-1.5">
                        {brandModelLabel && <Tag variant="neutral">{brandModelLabel}</Tag>}
                        {device.powerWatts !== null && (
                            <Tag variant="accent" className="font-semibold">
                                {device.powerWatts}W
                            </Tag>
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
