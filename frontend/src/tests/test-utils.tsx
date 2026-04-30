// eslint-disable-next-line react-refresh/only-export-components
// Arquivo de utilitários de teste — não é carregado pelo HMR em dev,
// apenas pelo runner do Vitest. O warning do react-refresh não se aplica.
import { type ReactElement, type ReactNode } from "react"
import { render, type RenderOptions } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { AuthProvider } from "@/contexts/AuthContext"
import { ThemeProvider } from "@/contexts/ThemeContext"

interface AllProvidersProps {
    children: ReactNode
    initialEntries?: string[]
}

export const AllProviders = ({
    children,
    initialEntries = ["/"],
}: AllProvidersProps) => (
    <MemoryRouter initialEntries={initialEntries}>
        <ThemeProvider>
            <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
    </MemoryRouter>
)

interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
    initialEntries?: string[]
}

export const renderWithProviders = (
    ui: ReactElement,
    { initialEntries, ...options }: CustomRenderOptions = {},
) =>
    render(ui, {
        wrapper: ({ children }) => (
            <AllProviders initialEntries={initialEntries}>{children}</AllProviders>
        ),
        ...options,
    })

// eslint-disable-next-line react-refresh/only-export-components
export * from "@testing-library/react"