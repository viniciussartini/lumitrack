import { Home, AlertCircle } from "lucide-react"
import { Link } from "react-router"
import { useAuth } from "@/contexts/AuthContext"
import { useProperties } from "@/hooks/queries/useProperties"
import { usePropertySelection } from "@/hooks/usePropertySelection"
import { PropertySelector } from "@/components/dashboard/PropertySelector"
import { RealtimeSection } from "@/components/dashboard/RealtimeSection"
import { EmptyState } from "@/components/ui/EmptyState"
import { Button } from "@/components/ui/Button"

/**
 * Painel (`/dashboard`) — épico #114 (Fase 4), bloco `isDashboard` do
 * handoff (`LumiTrack Home.dc.html`, linhas 152-246). O seletor de
 * propriedade fica aqui dentro, não na topbar (o handoff não tem nenhum
 * seletor no header compartilhado) — #115.
 *
 * KPIs "Potência agora"/"Custo estimado" + gráfico de consumo em tempo real
 * (#116) vivem em `RealtimeSection`, escopados à propriedade selecionada.
 * Histórico/comparação (#119) e as demais KPIs (#117) chegam nas próximas
 * sub-issues do épico.
 *
 * Cardinalidade assumida: pequena quantidade de propriedades por usuário
 * (pageSize 50, sem paginação de UI) — sem precedente idêntico no código,
 * ver nota no CHANGELOG.
 */
const PROPERTIES_PAGE_SIZE = 50

export const DashboardPage = () => {
    const { user } = useAuth()
    const propertiesQuery = useProperties(1, PROPERTIES_PAGE_SIZE)

    const properties = propertiesQuery.data?.items
    const { selectedId, selectProperty } = usePropertySelection(properties)

    const greeting = user?.firstName
        ? `Olá, ${user.firstName}!`
        : user?.companyName
            ? `Olá, ${user.tradeName ?? user.companyName}!`
            : "Olá!"

    const isLoading = propertiesQuery.isLoading
    const isError = propertiesQuery.isError
    const hasNoProperties = !isLoading && !isError && properties && properties.length === 0
    const hasProperties = !isLoading && !isError && properties && properties.length > 0

    return (
        <div className="flex flex-col gap-6">
            <div>
                <span className="font-heading text-accent-700 block text-xs font-semibold tracking-[.08em] uppercase">
                    Seu painel
                </span>
                <h1 className="font-heading mt-2 text-[clamp(22px,2.4vw,30px)] leading-[1.05] font-semibold uppercase">
                    {greeting}
                </h1>
            </div>

            {isLoading && <DashboardSkeleton />}

            {!isLoading && isError && (
                <ErrorState
                    message={
                        propertiesQuery.error instanceof Error
                            ? propertiesQuery.error.message
                            : "Erro ao carregar propriedades"
                    }
                    onRetry={() => propertiesQuery.refetch()}
                />
            )}

            {hasNoProperties && (
                <EmptyState
                    icon={Home}
                    title="Nenhuma propriedade cadastrada"
                    description="Cadastre uma propriedade para acompanhar o consumo no Painel."
                    action={
                        <Button asChild>
                            <Link to="/propriedades">Cadastrar propriedade</Link>
                        </Button>
                    }
                />
            )}

            {hasProperties && (
                <>
                    <PropertySelector
                        properties={properties}
                        selectedId={selectedId}
                        onChange={selectProperty}
                    />
                    {selectedId && <RealtimeSection propertyId={selectedId} />}
                </>
            )}
        </div>
    )
}

// Subcomponentes locais

const DashboardSkeleton = () => (
    <div
        className="blueprint h-24 animate-pulse p-5"
        aria-busy="true"
        aria-label="Carregando painel"
    />
)

interface ErrorStateProps {
    message: string
    onRetry: () => void
}

const ErrorState = ({ message, onRetry }: ErrorStateProps) => (
    <div
        role="alert"
        className="border-status-danger/40 flex flex-col items-center justify-center gap-4 border py-12 text-center"
    >
        <AlertCircle className="text-status-danger h-8 w-8" aria-hidden="true" />
        <div>
            <h3 className="font-heading text-status-danger font-semibold uppercase">
                Não foi possível carregar
            </h3>
            <p className="text-status-danger/85 mt-1 text-sm">{message}</p>
        </div>
        <Button onClick={onRetry} variant="secondary">
            Tentar novamente
        </Button>
    </div>
)
