import { Calculator } from "lucide-react"
import { PlaceholderPage } from "@/components/PlaceHolderPage"

/**
 * Simulação — /simulacao (Fase 5, placeholder). O backend já reescreveu
 * `SimulationService` para usar o `TariffService` novo (Fase 3), mas a UI
 * de simulação em si fica para uma fase futura.
 */
export const SimulationPage = () => (
    <PlaceholderPage
        description="Em breve você poderá simular o custo de consumo de energia antes de gastar — por potência e uso diário, ou por kWh direto."
        icon={Calculator}
    />
)
