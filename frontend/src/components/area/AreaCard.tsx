import { Link } from "react-router"
import { LayoutGrid } from "lucide-react"
import { cn } from "@/lib/cn"
import { AreaMenu } from "@/components/area/AreaMenu"
import type { Area } from "@/types/area.types"

interface AreaCardProps {
    area: Area
}

/**
 * Card de área.
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
export const AreaCard = ({ area }: AreaCardProps) => (
    <div className="relative">
        <Link
            to={`/propriedades/${area.propertyId}/areas/${area.id}`}
            className={cn(
                "group flex flex-col gap-3 rounded-lg border bg-white p-5 transition",
                "border-slate-200 hover:border-brand-500 hover:shadow-md",
                "dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-500",
            )}
            data-testid={`area-card-${area.id}`}
        >
            {/* pr-10 reserva o espaço onde o AreaMenu fica em absolute */}
            <div className="flex items-start gap-3 pr-10">
                <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-50 dark:bg-brand-500/10"
                    aria-hidden="true"
                >
                    <LayoutGrid className="h-5 w-5 text-brand-500" />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold text-slate-900 dark:text-slate-100">
                        {area.name}
                    </h3>
                </div>
            </div>

            {/* Descrição — opcional. line-clamp-2 evita cards muito altos */}
            {area.description && (
                <p className="line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
                    {area.description}
                </p>
            )}
        </Link>

        <AreaMenu area={area} />
    </div>
)