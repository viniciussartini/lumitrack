import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { RouteLoadErrorBoundary } from "@/components/ui/RouteLoadErrorBoundary"

const ThrowingChild = () => {
    throw new Error("falha de carregamento simulada")
}

describe("RouteLoadErrorBoundary", () => {
    beforeEach(() => {
        // React loga o erro capturado no console mesmo com um boundary —
        // esperado neste teste, não um sintoma de falha.
        vi.spyOn(console, "error").mockImplementation(() => undefined)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it("renderiza os filhos normalmente quando não há erro", () => {
        render(
            <RouteLoadErrorBoundary>
                <p>conteúdo normal</p>
            </RouteLoadErrorBoundary>,
        )

        expect(screen.getByText("conteúdo normal")).toBeInTheDocument()
    })

    it("mostra a UI de recuperação em vez de deixar o erro quebrar a árvore", () => {
        render(
            <RouteLoadErrorBoundary>
                <ThrowingChild />
            </RouteLoadErrorBoundary>,
        )

        expect(screen.getByRole("button", { name: "Recarregar" })).toBeInTheDocument()
    })
})
