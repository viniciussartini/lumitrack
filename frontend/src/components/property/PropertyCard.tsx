import { Link } from "react-router"
import { Home, MapPin, Zap } from "lucide-react"
import type { Property } from "@/types/property.types"
import { PropertyMenu } from "@/components/property/PropertyMenu"
import { cn } from "@/lib/cn"

interface PropertyCardProps {
    property: Property
    /**
     * Nome da distribuidora vinculada — resolvido pelo pai (PropertiesPage).
     *
     * Property só carrega distributorId para evitar que cada card
     * dispare sua própria query, N+1 requests em listas grandes.
     * O pai faz uma query só pra todas as distribuidoras e passa o nome
     * já resolvido. Quando a distribuidora não existe mais (caso raro),
     * o pai passa um fallback ("Distribuidora removida").
     */
    distributorName: string
}

/**
 * Card de propriedade.
 *
 * Comportamento:
 *   - Click no card → /propriedades/:id (página de detalhes)
 *   - Click no ⋯ → menu com "Editar" e "Excluir"
 *
 * O PropertyMenu fica fora do <Link> (em uma camada visual sobreposta)
 * porque ele tem seu próprio <button> e clicks que NÃO devem propagar
 * pro link envolvente. O CSS `relative` no wrapper + `absolute` do menu
 * resolve sem precisar tirar o link.
 */
export const PropertyCard = ({ property, distributorName }: PropertyCardProps) => {
    const addressLine = formatAddress(property)

    return (
        <div className="relative">
            <Link
                to={`/propriedades/${property.id}`}
                className={cn(
                    "group flex flex-col gap-4 rounded-lg border bg-white p-5 transition",
                    "border-slate-200 hover:border-brand-500 hover:shadow-md",
                    "dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-500",
                )}
                data-testid={`property-card-${property.id}`}
            >
                {/* Header — espaço reservado pro menu (em absolute, ver div abaixo) */}
                <div className="flex items-start gap-3 pr-10">
                    <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-50 dark:bg-brand-500/10"
                        aria-hidden="true"
                    >
                        <Home className="h-5 w-5 text-brand-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold text-slate-900 dark:text-slate-100">
                            {property.name}
                        </h3>
                        {addressLine && (
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                                <MapPin
                                    className="h-3 w-3 shrink-0"
                                    aria-hidden="true"
                                />
                                <span className="truncate">{addressLine}</span>
                            </p>
                        )}
                    </div>
                </div>

                {/* Footer — badge da distribuidora */}
                <div className="flex items-center border-t border-slate-200 pt-3 dark:border-slate-800">
                    <span
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                            "bg-brand-50 text-brand-700",
                            "dark:bg-brand-500/10 dark:text-brand-300",
                        )}
                    >
                        <Zap className="h-3 w-3" aria-hidden="true" />
                        <span className="max-w-50 truncate">
                            {distributorName}
                        </span>
                    </span>
                </div>
            </Link>

            {/* Menu sobreposto ao Link, no canto superior direito */}
            <div className="absolute right-3 top-3">
                <PropertyMenu property={property} />
            </div>
        </div>
    )
}

/**
 * Formata o endereço pra uma linha curta.
 *
 * Combina os campos opcionais em ordem: address, "city/state".
 * Retorna null quando todos os campos estão vazios.
 *
 * Exemplos:
 *   - "Rua das Flores, 100, Belo Horizonte/MG"
 *   - "Belo Horizonte/MG"  (sem endereço, só cidade+UF)
 *   - "Belo Horizonte"     (só cidade)
 *   - "MG"                 (só UF)
 *   - null                 (nada preenchido)
 */
const formatAddress = (property: Property): string | null => {
    const parts: string[] = []

    if (property.address) parts.push(property.address)

    if (property.city && property.state) {
        parts.push(`${property.city}/${property.state}`)
    } else if (property.city) {
        parts.push(property.city)
    } else if (property.state) {
        parts.push(property.state)
    }

    return parts.length > 0 ? parts.join(", ") : null
}