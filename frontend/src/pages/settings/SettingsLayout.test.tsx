import { describe, it, expect } from "vitest"
import { MemoryRouter, Route, Routes } from "react-router"
import { render, screen } from "@testing-library/react"
import { SettingsLayout } from "@/pages/settings/SettingsLayout"

const renderAt = (pathname: string) =>
    render(
        <MemoryRouter initialEntries={[pathname]}>
            <Routes>
                <Route path="/configuracoes" element={<SettingsLayout />}>
                    <Route path="cadastro" element={<p>conteúdo do cadastro</p>} />
                </Route>
            </Routes>
        </MemoryRouter>,
    )

describe("SettingsLayout", () => {
    it("mostra a sub-navegação com Cadastro apontando para /configuracoes/cadastro", () => {
        renderAt("/configuracoes/cadastro")

        const nav = screen.getByRole("navigation", { name: /configurações/i })
        const link = screen.getByRole("link", { name: "Cadastro" })

        expect(nav).toContainElement(link)
        expect(link).toHaveAttribute("href", "/configuracoes/cadastro")
    })

    it("marca a configuração aberta com aria-current", () => {
        renderAt("/configuracoes/cadastro")

        expect(screen.getByRole("link", { name: "Cadastro" })).toHaveAttribute(
            "aria-current",
            "page",
        )
    })

    it("renderiza a página da configuração selecionada ao lado da sub-navegação", () => {
        renderAt("/configuracoes/cadastro")

        expect(screen.getByText("conteúdo do cadastro")).toBeInTheDocument()
    })
})
