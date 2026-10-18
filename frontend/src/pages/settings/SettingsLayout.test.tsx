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
                    <Route path="relatorios" element={<p>conteúdo dos relatórios</p>} />
                    <Route path="metas" element={<p>conteúdo das metas</p>} />
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

    it("lista Relatórios e o marca como aberto em /configuracoes/relatorios", () => {
        renderAt("/configuracoes/relatorios")

        const link = screen.getByRole("link", { name: "Relatórios" })
        expect(link).toHaveAttribute("href", "/configuracoes/relatorios")
        expect(link).toHaveAttribute("aria-current", "page")
        expect(screen.getByRole("link", { name: "Cadastro" })).not.toHaveAttribute("aria-current")
    })

    it("lista Metas e a marca como aberta em /configuracoes/metas", () => {
        renderAt("/configuracoes/metas")

        const link = screen.getByRole("link", { name: "Metas" })
        expect(link).toHaveAttribute("href", "/configuracoes/metas")
        expect(link).toHaveAttribute("aria-current", "page")
        expect(screen.getByText("conteúdo das metas")).toBeInTheDocument()
    })
})
