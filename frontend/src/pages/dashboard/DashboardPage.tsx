import { useAuth } from "@/contexts/AuthContext"
import { PlaceholderPage } from "@/components/PlaceHolderPage"

/**
 * DashboardPage — placeholder (Fase 5).
 *
 * O dashboard antigo (agregação client-side via fan-out de relatórios por
 * propriedade) dependia inteiramente do módulo `report`, removido nesta
 * fase. Uma nova visão agregada, construída sobre `/api/consumption`, fica
 * para uma fase futura — por ora a rota permanece no menu como placeholder,
 * mantendo a sensação de app completo.
 */
export const DashboardPage = () => {
    const { user } = useAuth()

    const greeting = user?.firstName
        ? `Olá, ${user.firstName}!`
        : user?.companyName
            ? `Olá, ${user.tradeName ?? user.companyName}!`
            : "Olá!"

    return (
        <PlaceholderPage
            title={greeting}
            description="O dashboard consolidado está sendo reconstruído sobre o novo modelo de consumo agregado por medidor. Enquanto isso, acompanhe o consumo em cada propriedade, área ou dispositivo."
        />
    )
}
