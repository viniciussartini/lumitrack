import { Component, type ReactNode } from "react"
import { Button } from "@/components/ui/Button"

interface RouteLoadErrorBoundaryProps {
    children: ReactNode
}

interface RouteLoadErrorBoundaryState {
    hasError: boolean
}

/**
 * Rede de proteção para o `React.lazy` das rotas (`AppRouter`) — sem ela,
 * um chunk que falha ao carregar (deploy novo invalidando os hashes de uma
 * aba já aberta, ou uma queda de rede durante a navegação) rejeita a
 * promise do `import()` e o React desmonta a árvore inteira, sem nenhuma
 * UI de recuperação. A ação oferecida é recarregar a página, não um "tentar
 * de novo" em memória: um chunk que já falhou uma vez tende a falhar de
 * novo sem reload, e o reload é o que de fato busca o `index.html`/manifesto
 * de assets atualizado.
 */
export class RouteLoadErrorBoundary extends Component<
    RouteLoadErrorBoundaryProps,
    RouteLoadErrorBoundaryState
> {
    state: RouteLoadErrorBoundaryState = { hasError: false }

    static getDerivedStateFromError(): RouteLoadErrorBoundaryState {
        return { hasError: true }
    }

    componentDidCatch(error: unknown): void {
        console.error("Falha ao carregar uma rota:", error)
    }

    render(): ReactNode {
        if (!this.state.hasError) {
            return this.props.children
        }

        return (
            <div className="flex h-screen flex-col items-center justify-center gap-4 px-6 text-center">
                <p className="text-muted">
                    Não foi possível carregar esta página. Isso costuma acontecer depois de uma
                    atualização do sistema.
                </p>
                <Button onClick={() => window.location.reload()}>Recarregar</Button>
            </div>
        )
    }
}
