import { useState } from "react"
import { Link } from "react-router"
import { Home, MapPin } from "lucide-react"
import { ELECTRICAL_SYSTEM_LABELS, type Property } from "@/types/property.types"
import type { Distributor } from "@/types/distributor.types"
import { PropertyMenu } from "@/components/property/PropertyMenu"
import { PropertyFormDialog } from "@/components/property/PropertyFormDialog"
import { Tag } from "@/components/ui/Tag"

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
    /**
     * Catálogo completo de distribuidoras — repassado pro PropertyFormDialog
     * quando o usuário clica em "Editar" no menu ⋯ (select de distribuidora).
     * O pai (PropertiesPage) já carrega essa lista.
     */
    distributors: Distributor[]
}

/**
 * Card de propriedade — LumiTrack Home.dc.html, view `propListView`.
 *
 * Comportamento:
 *   - Click no card → /propriedades/:id (página de detalhes)
 *   - Click no ⋯ → menu com "Editar" (abre PropertyFormDialog) e "Excluir"
 *
 * O PropertyMenu fica fora do <Link> (em uma camada visual sobreposta)
 * porque ele tem seu próprio <button> e clicks que NÃO devem propagar
 * pro link envolvente. O CSS `relative` no wrapper + `absolute` do menu
 * resolve sem precisar tirar o link.
 *
 * O `<Link>` (não um `<div>`) carrega a classe `blueprint` diretamente, com
 * as 4 marcas de canto inline — mesmo motivo documentado em FormDialog.tsx:
 * quando o elemento clicável precisa ser outra tag, replica-se o markup do
 * `Blueprint.tsx` em vez de aninhar o link dentro de um wrapper extra.
 */
export const PropertyCard = ({
    property,
    distributorName,
    distributors,
}: PropertyCardProps) => {
    const addressLine = formatAddress(property)
    const [isEditOpen, setIsEditOpen] = useState(false)

    return (
        <div className="relative">
            <Link
                to={`/propriedades/${property.id}`}
                className="blueprint flex cursor-pointer flex-col"
                data-testid={`property-card-${property.id}`}
            >
                <i className="corner tl" />
                <i className="corner tr" />
                <i className="corner bl" />
                <i className="corner br" />

                {/* Header — espaço reservado pro menu (em absolute, ver div abaixo) */}
                <div className="flex items-start gap-[13px] p-5 pr-12">
                    <span
                        className="border-accent text-accent flex h-10 w-10 shrink-0 items-center justify-center border"
                        aria-hidden="true"
                    >
                        <Home className="h-5 w-5" strokeWidth={1.5} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h3 className="font-heading truncate text-[19px] leading-tight font-semibold tracking-[.01em] uppercase">
                            {property.name}
                        </h3>
                        {addressLine && (
                            <p className="text-muted mt-[5px] flex items-center gap-1.5 text-[12.5px]">
                                <MapPin
                                    className="h-3.5 w-3.5 shrink-0"
                                    aria-hidden="true"
                                />
                                <span className="truncate">{addressLine}</span>
                            </p>
                        )}
                    </div>
                </div>

                {/* Footer — tags de faturamento/sistema/distribuidora */}
                <div className="flex flex-wrap gap-2 px-5 pb-[18px]">
                    <Tag variant="accent" className="font-semibold">
                        {property.billingClass}
                    </Tag>
                    <Tag variant="neutral">
                        {ELECTRICAL_SYSTEM_LABELS[property.electricalSystem]}
                    </Tag>
                    <Tag variant="outline" className="max-w-50 truncate">
                        {distributorName}
                    </Tag>
                </div>
            </Link>

            {/* Menu sobreposto ao Link, no canto superior direito */}
            <div className="absolute right-3 top-3">
                <PropertyMenu
                    property={property}
                    onEdit={() => setIsEditOpen(true)}
                />
            </div>

            <PropertyFormDialog
                isOpen={isEditOpen}
                onClose={() => setIsEditOpen(false)}
                mode={{ kind: "edit", property }}
                distributors={distributors}
            />
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