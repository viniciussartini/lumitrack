import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import userEvent from "@testing-library/user-event"
import { render, screen, waitFor } from "@testing-library/react"
import { AlertRowMenu } from "@/components/alert/AlertRowMenu"
import { alertService } from "@/services/alert.service"
import type { AlertWithStatus } from "@/types/alert.types"

vi.mock("@/services/alert.service", () => ({
    alertService: {
        list: vi.fn(),
        firing: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        patchEnabled: vi.fn(),
        delete: vi.fn(),
    },
}))

const mockAlert: AlertWithStatus = {
    id: "alert-1",
    userId: "user-1",
    meterId: "meter-1",
    name: "Geladeira fora da faixa",
    referencePowerKw: 10,
    tolerancePercent: 2,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "normal",
    target: null,
}

const createTestQueryClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })

/**
 * Reproduz a estrutura real de `AlertTable.tsx`: o menu vive dentro de um
 * `<div className="overflow-x-auto">` com altura curta o bastante pra o
 * menu (várias linhas de `role="menuitem"`) estourar a caixa. Sem isso, o
 * teste não reproduziria o bug: um wrapper alto o suficiente nunca
 * precisaria clipar/rolar nada.
 */
const renderInsideScrollableAncestor = (onEdit?: () => void) => {
    const queryClient = createTestQueryClient()
    return render(
        <QueryClientProvider client={queryClient}>
            <div data-testid="scrollable-ancestor" style={{ overflowX: "auto", height: "40px" }}>
                <AlertRowMenu alert={mockAlert} onEdit={onEdit} />
            </div>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("AlertRowMenu — sobreposição", () => {
    it("o menu é portalado pra fora do ancestral com overflow — não é descendente dele no DOM", async () => {
        const user = userEvent.setup()
        renderInsideScrollableAncestor()

        await user.click(screen.getByTestId("alert-menu-trigger-alert-1"))

        const menu = await screen.findByTestId("alert-menu-alert-1")
        const ancestor = screen.getByTestId("scrollable-ancestor")

        // `.contains` é `false` pra nós que não são descendentes no DOM —
        // se o menu ainda estivesse dentro do wrapper, isso seria `true` e
        // o CSS overflow do ancestral voltaria a clipar/rolar o menu.
        expect(ancestor.contains(menu)).toBe(false)
    })

    it("usa position: fixed com coordenadas medidas do trigger, não position: absolute herdado do ancestral", async () => {
        const user = userEvent.setup()
        renderInsideScrollableAncestor()

        const trigger = screen.getByTestId("alert-menu-trigger-alert-1")
        vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
            top: 100,
            bottom: 120,
            left: 200,
            right: 240,
            width: 40,
            height: 20,
            x: 200,
            y: 100,
            toJSON: () => ({}),
        })

        await user.click(trigger)

        const menu = await screen.findByTestId("alert-menu-alert-1")
        expect(menu.style.position).toBe("fixed")
        expect(menu.style.top).toBe("124px")
    })

    it("fecha o menu ao rolar (a posição medida fica obsoleta)", async () => {
        const user = userEvent.setup()
        renderInsideScrollableAncestor()

        await user.click(screen.getByTestId("alert-menu-trigger-alert-1"))
        await screen.findByTestId("alert-menu-alert-1")

        window.dispatchEvent(new Event("scroll"))

        // O listener é um `addEventListener` nativo fora do ciclo de evento
        // sintético do React — a atualização de estado não flusha
        // sincronamente com `dispatchEvent`, por isso `waitFor`.
        await waitFor(() => {
            expect(screen.queryByTestId("alert-menu-alert-1")).not.toBeInTheDocument()
        })
    })
})

describe("AlertRowMenu — comportamento (sem regressão)", () => {
    it("clicar em Editar chama onEdit e fecha o menu", async () => {
        const onEdit = vi.fn()
        const user = userEvent.setup()
        renderInsideScrollableAncestor(onEdit)

        await user.click(screen.getByTestId("alert-menu-trigger-alert-1"))
        await user.click(await screen.findByTestId("alert-menu-edit-alert-1"))

        expect(onEdit).toHaveBeenCalledTimes(1)
        expect(screen.queryByTestId("alert-menu-alert-1")).not.toBeInTheDocument()
    })

    it("clicar fora do trigger e do menu portalado fecha o menu", async () => {
        const user = userEvent.setup()
        renderInsideScrollableAncestor()

        await user.click(screen.getByTestId("alert-menu-trigger-alert-1"))
        await screen.findByTestId("alert-menu-alert-1")

        await user.click(document.body)

        expect(screen.queryByTestId("alert-menu-alert-1")).not.toBeInTheDocument()
    })

    it("clicar dentro do menu portalado não conta como clique fora", async () => {
        const user = userEvent.setup()
        vi.mocked(alertService.patchEnabled).mockResolvedValue({ ...mockAlert, enabled: false })
        renderInsideScrollableAncestor()

        await user.click(screen.getByTestId("alert-menu-trigger-alert-1"))
        await user.click(await screen.findByTestId("alert-menu-toggle-enabled-alert-1"))

        expect(alertService.patchEnabled).toHaveBeenCalledWith("alert-1", false)
    })

    it("sem onEdit, o item Editar não aparece", async () => {
        const user = userEvent.setup()
        renderInsideScrollableAncestor(undefined)

        await user.click(screen.getByTestId("alert-menu-trigger-alert-1"))
        await screen.findByTestId("alert-menu-alert-1")

        expect(screen.queryByTestId("alert-menu-edit-alert-1")).not.toBeInTheDocument()
    })
})

describe("AlertRowMenu — acessibilidade por teclado", () => {
    it("ao abrir, move o foco pro primeiro item — o portal tira o menu do fluxo de Tab do trigger", async () => {
        const onEdit = vi.fn()
        const user = userEvent.setup()
        renderInsideScrollableAncestor(onEdit)

        await user.click(screen.getByTestId("alert-menu-trigger-alert-1"))
        const editItem = await screen.findByTestId("alert-menu-edit-alert-1")

        expect(editItem).toHaveFocus()
    })

    it("Escape fecha o menu e devolve o foco ao trigger", async () => {
        const user = userEvent.setup()
        renderInsideScrollableAncestor()

        const trigger = screen.getByTestId("alert-menu-trigger-alert-1")
        await user.click(trigger)
        await screen.findByTestId("alert-menu-alert-1")

        await user.keyboard("{Escape}")

        expect(screen.queryByTestId("alert-menu-alert-1")).not.toBeInTheDocument()
        expect(trigger).toHaveFocus()
    })

    it("inverte pra cima quando o menu estouraria a viewport embaixo do trigger", async () => {
        const user = userEvent.setup()
        renderInsideScrollableAncestor()

        vi.spyOn(window, "innerHeight", "get").mockReturnValue(800)
        const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
            this: HTMLElement,
        ) {
            if (this.getAttribute("data-testid") === "alert-menu-trigger-alert-1") {
                return {
                    top: 700,
                    bottom: 720,
                    left: 200,
                    right: 240,
                    width: 40,
                    height: 20,
                    x: 200,
                    y: 700,
                    toJSON: () => ({}),
                }
            }
            if (this.getAttribute("role") === "menu") {
                // Alto o bastante pra estourar `innerHeight` (800) partindo
                // de `top: 724` (bottom do trigger + 4).
                return {
                    top: 724,
                    bottom: 900,
                    left: 100,
                    right: 300,
                    width: 200,
                    height: 176,
                    x: 100,
                    y: 724,
                    toJSON: () => ({}),
                }
            }
            return originalGetBoundingClientRect.call(this)
        })

        await user.click(screen.getByTestId("alert-menu-trigger-alert-1"))

        const menu = await screen.findByTestId("alert-menu-alert-1")
        // 800 (innerHeight) - 700 (topo do trigger) + 4 = 104.
        expect(menu.style.bottom).toBe("104px")
        expect(menu.style.top).toBe("")
    })
})
