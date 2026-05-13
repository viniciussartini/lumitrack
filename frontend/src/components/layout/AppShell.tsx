import { useEffect, useState } from "react"
import { Outlet, useLocation } from "react-router-dom"
import { Sidebar } from "@/components/layout/Sidebar"
import { Header } from "@/components/layout/Header"
import { useAlertStream } from "@/hooks/useAlertStream"

/**
 * Layout principal das rotas autenticadas.
 *
 * Estrutura:
 *   ┌─────────────────────────────────────┐
 *   │ Sidebar │ Header                    │
 *   │         ├───────────────────────────┤
 *   │  (md+)  │                           │
 *   │         │ <Outlet />                │
 *   │         │                           │
 *   └─────────────────────────────────────┘
 *
 * Em mobile, a sidebar é off-canvas (drawer) controlada por estado local.
 *
 * Comportamentos do drawer mobile:
 *   - Inicia fechado
 *   - Hamburger no Header abre
 *   - Click no backdrop / botão X / Escape fecha
 *   - Mudança de rota fecha automaticamente
 */
export const AppShell = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)
    const location = useLocation()
    useAlertStream() // Mantém SSE de alertas ativo enquanto user autenticado

    // Fecha o drawer ao trocar de rota — sem isso, o user clica num link
    // do menu mobile e o drawer fica aberto sobre a página de destino.
    useEffect(() => {
        setIsSidebarOpen(false)
    }, [location.pathname])

    // Fecha com Escape — pareia com o resto da app
    useEffect(() => {
        if (!isSidebarOpen) return

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsSidebarOpen(false)
            }
        }

        document.addEventListener("keydown", handleEscape)
        return () => {
            document.removeEventListener("keydown", handleEscape)
        }
    }, [isSidebarOpen])

    return (
        <div className="flex h-screen bg-slate-50 dark:bg-slate-950">
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            <div className="flex flex-1 flex-col overflow-hidden">
                <Header onMenuClick={() => setIsSidebarOpen(true)} />

                <main className="flex-1 overflow-y-auto p-4 md:p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    )
}