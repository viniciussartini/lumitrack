import { useState } from "react"
import { Link } from "react-router"
import { LayoutGrid } from "lucide-react"
import { AreaMenu } from "@/components/area/AreaMenu"
import { AreaFormDialog } from "@/components/area/AreaFormDialog"
import { formatKwh } from "@/lib/formatters/consumption"
import type { Area } from "@/types/area.types"
import type { ConsumptionBucket } from "@/types/consumption.types"

interface AreaCardProps {
    area: Area
    /**
     * Bucket de consumo do mês atual — `undefined` enquanto carrega,
     * `null` quando a área não tem medidor vinculado (sem dado real pra
     * mostrar, então a linha de kWh/mês some em vez de fabricar um valor).
     * Resolvido pelo pai (`AreasSection`) via `useQueries`, um por área.
     */
    monthlyConsumption?: ConsumptionBucket | null
}

/**
 * Card de área — LumiTrack Home.dc.html, bloco "Áreas" da propDetailView
 * (card minimalista: só borda, sem `.blueprint`/corners, diferente do card
 * de propriedade da listagem).
 *
 * Comportamento:
 *   - Click no card → /propriedades/:propertyId/areas/:areaId (detalhes)
 *   - Click no ⋯ → menu com "Editar" e "Excluir"
 *
 * O AreaMenu fica fora do <Link> (em uma camada visual sobreposta) porque
 * tem seu próprio <button> e clicks que NÃO devem propagar pro link
 * envolvente. O CSS `relative` no wrapper + `absolute` no menu resolve sem
 * precisar tirar o link.
 *
 * O menu não recebe onAfterDelete — quando o card é deletado da lista, o
 * próprio invalidate da query no hook re-renderiza o pai (PropertyDetailsPage)
 * sem o card removido. Não há rota a navegar.
 */
export const AreaCard = ({ area, monthlyConsumption }: AreaCardProps) => {
    const [isEditOpen, setIsEditOpen] = useState(false)

    return (
        <div className="relative">
            <Link
                to={`/propriedades/${area.propertyId}/areas/${area.id}`}
                className="border-divider flex flex-col gap-3 border p-4"
                data-testid={`area-card-${area.id}`}
            >
                {/* pr-8 reserva o espaço onde o AreaMenu fica em absolute */}
                <div className="flex items-center gap-2.5 pr-8">
                    <span
                        className="border-accent text-accent flex h-8 w-8 shrink-0 items-center justify-center border"
                        aria-hidden="true"
                    >
                        <LayoutGrid className="h-4 w-4" strokeWidth={1.5} />
                    </span>
                    <h3 className="min-w-0 truncate text-sm font-semibold">{area.name}</h3>
                </div>

                {/* Descrição — opcional, não está no protótipo (que não modela esse
                    campo), mas é dado real do usuário — mantida, sem inventar layout,
                    só encaixada como linha auxiliar acima do kWh/mês. */}
                {area.description && (
                    <p className="text-muted line-clamp-2 text-xs">{area.description}</p>
                )}

                {monthlyConsumption !== undefined && monthlyConsumption !== null && (
                    <div className="font-heading font-features-['tnum'_1] text-[22px] leading-none font-semibold">
                        {formatKwh(monthlyConsumption.kwhConsumed)}
                        <span className="text-muted ml-[3px] text-[13px] font-normal normal-case">
                            kWh/mês
                        </span>
                    </div>
                )}
            </Link>

            <AreaMenu area={area} onEdit={() => setIsEditOpen(true)} />

            <AreaFormDialog
                isOpen={isEditOpen}
                onClose={() => setIsEditOpen(false)}
                mode={{ kind: "edit", propertyId: area.propertyId, area }}
            />
        </div>
    )
}
