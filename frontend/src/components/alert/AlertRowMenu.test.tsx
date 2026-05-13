import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"
import type { ReactNode } from "react"
import { AlertRowMenu } from "@/components/alert/AlertRowMenu"
import { alertService } from "@/services/alert.service"
import type { Alert } from "@/types/alert.types"

vi.mock("@/services/alert.service", () => ({
    alertService: {
        listGlobal: vi.fn(),
        listByProperty: vi.fn(),
        listByArea: vi.fn(),
        listByDevice: vi.fn(),
        getById: vi.fn(),
        createForProperty: vi.fn(),
        createForArea: vi.fn(),
        createForDevice: vi.fn(),
        update: vi.fn(),
        markAsRead: vi.fn(),
        delete: vi.fn(),
    },
}))

vi.mock("@/services/api", () => ({
    api: {},
    extractErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : "Erro",
}))

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
    },
}))

const makeAlert = (overrides: Partial<Alert> = {}): Alert => ({
    id: "alert-1",
    userId: "user-1",
    targetType: "PROPERTY",
    propertyId: "prop-1",
    areaId: null,
    deviceId: null,
    thresholdKwh: 100,
    message: null,
    triggeredAt: null,
    readAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
})

const renderMenu = (ui: ReactNode) => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    return render(
        <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    )
}

beforeEach(() => vi.clearAllMocks())

// ─── Trigger ─────────────────────────────────────────────────────────────────

describe("AlertRowMenu — trigger", () => {
    it("renderiza apenas o trigger inicialmente (menu fechado)", () => {
        renderMenu(<AlertRowMenu alert={makeAlert()} onEdit={vi.fn()} />)

        expect(screen.getByTestId("alert-menu-trigger-alert-1")).toBeInTheDocument()
        expect(screen.queryByRole("menu")).toBeNull()
    })

    it("trigger tem aria-label com threshold formatado", () => {
        renderMenu(
            <AlertRowMenu alert={makeAlert({ thresholdKwh: 250 })} onEdit={vi.fn()} />,
        )

        expect(
            screen.getByTestId("alert-menu-trigger-alert-1"),
        ).toHaveAttribute("aria-label", expect.stringMatching(/250\s*kWh/i))
    })

    it("clicar no trigger abre o menu", async () => {
        const user = userEvent.setup()
        renderMenu(<AlertRowMenu alert={makeAlert()} onEdit={vi.fn()} />)

        await user.click(screen.getByTestId("alert-menu-trigger-alert-1"))

        expect(screen.getByRole("menu")).toBeInTheDocument()
    })

    it("aria-expanded reflete estado do menu", async () => {
        const user = userEvent.setup()
        renderMenu(<AlertRowMenu alert={makeAlert()} onEdit={vi.fn()} />)

        const trigger = screen.getByTestId("alert-menu-trigger-alert-1")
        expect(trigger).toHaveAttribute("aria-expanded", "false")

        await user.click(trigger)

        expect(trigger).toHaveAttribute("aria-expanded", "true")
    })
})

// ─── Marcar como lido ────────────────────────────────────────────────────────

describe("AlertRowMenu — 'Marcar como lido'", () => {
    it("ALERTA ATIVO: item NÃO aparece", async () => {
        const user = userEvent.setup()
        renderMenu(
            <AlertRowMenu
                alert={makeAlert({ triggeredAt: null, readAt: null })}
                onEdit={vi.fn()}
            />,
        )

        await user.click(screen.getByTestId("alert-menu-trigger-alert-1"))

        expect(screen.queryByTestId("alert-menu-mark-read-alert-1")).toBeNull()
    })

    it("ALERTA DISPARADO-NÃO-LIDO: item aparece", async () => {
        const user = userEvent.setup()
        renderMenu(
            <AlertRowMenu
                alert={makeAlert({ triggeredAt: "2025-11-10T12:00:00.000Z" })}
                onEdit={vi.fn()}
            />,
        )

        await user.click(screen.getByTestId("alert-menu-trigger-alert-1"))

        expect(
            screen.getByTestId("alert-menu-mark-read-alert-1"),
        ).toBeInTheDocument()
    })

    it("ALERTA LIDO: item NÃO aparece", async () => {
        const user = userEvent.setup()
        renderMenu(
            <AlertRowMenu
                alert={makeAlert({
                    triggeredAt: "2025-11-10T12:00:00.000Z",
                    readAt: "2025-11-11T08:30:00.000Z",
                })}
                onEdit={vi.fn()}
            />,
        )

        await user.click(screen.getByTestId("alert-menu-trigger-alert-1"))

        expect(screen.queryByTestId("alert-menu-mark-read-alert-1")).toBeNull()
    })

    it("clicar chama service.markAsRead", async () => {
        const user = userEvent.setup()
        vi.mocked(alertService.markAsRead).mockResolvedValue(
            makeAlert({ triggeredAt: "2025-11-10T12:00:00.000Z", readAt: new Date().toISOString() }),
        )

        renderMenu(
            <AlertRowMenu
                alert={makeAlert({ triggeredAt: "2025-11-10T12:00:00.000Z" })}
                onEdit={vi.fn()}
            />,
        )

        await user.click(screen.getByTestId("alert-menu-trigger-alert-1"))
        await user.click(screen.getByTestId("alert-menu-mark-read-alert-1"))

        await waitFor(() =>
            expect(alertService.markAsRead).toHaveBeenCalledWith("alert-1"),
        )
    })

    it("erro dispara toast.error", async () => {
        const user = userEvent.setup()
        vi.mocked(alertService.markAsRead).mockRejectedValue(new Error("Conflict"))

        renderMenu(
            <AlertRowMenu
                alert={makeAlert({ triggeredAt: "2025-11-10T12:00:00.000Z" })}
                onEdit={vi.fn()}
            />,
        )

        await user.click(screen.getByTestId("alert-menu-trigger-alert-1"))
        await user.click(screen.getByTestId("alert-menu-mark-read-alert-1"))

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith(
                "Erro ao marcar como lido",
                expect.objectContaining({
                    description: expect.stringMatching(/conflict/i),
                }),
            ),
        )
    })
})

// ─── Editar e dica de rearme ──────────────────────────────────────────────────

describe("AlertRowMenu — 'Editar' e dica de rearme", () => {
    it("ALERTA ATIVO + onEdit: 'Editar' aparece", async () => {
        const user = userEvent.setup()
        renderMenu(
            <AlertRowMenu alert={makeAlert({ triggeredAt: null })} onEdit={vi.fn()} />,
        )

        await user.click(screen.getByTestId("alert-menu-trigger-alert-1"))

        expect(screen.getByTestId("alert-menu-edit-alert-1")).toBeInTheDocument()
    })

    it("ALERTA ATIVO sem onEdit: 'Editar' NÃO aparece", async () => {
        const user = userEvent.setup()
        renderMenu(<AlertRowMenu alert={makeAlert({ triggeredAt: null })} />)

        await user.click(screen.getByTestId("alert-menu-trigger-alert-1"))

        expect(screen.queryByTestId("alert-menu-edit-alert-1")).toBeNull()
    })

    it("ALERTA DISPARADO: 'Editar' NÃO aparece (one-shot)", async () => {
        const user = userEvent.setup()
        renderMenu(
            <AlertRowMenu
                alert={makeAlert({ triggeredAt: "2025-11-10T12:00:00.000Z" })}
                onEdit={vi.fn()}
            />,
        )

        await user.click(screen.getByTestId("alert-menu-trigger-alert-1"))

        expect(screen.queryByTestId("alert-menu-edit-alert-1")).toBeNull()
    })

    it("ALERTA DISPARADO + onEdit: aparece dica de rearme", async () => {
        const user = userEvent.setup()
        renderMenu(
            <AlertRowMenu
                alert={makeAlert({ triggeredAt: "2025-11-10T12:00:00.000Z" })}
                onEdit={vi.fn()}
            />,
        )

        await user.click(screen.getByTestId("alert-menu-trigger-alert-1"))

        expect(
            screen.getByTestId("alert-menu-rearm-hint-alert-1"),
        ).toHaveTextContent(/exclua e crie outro/i)
    })

    it("clicar em 'Editar' chama onEdit e fecha o menu", async () => {
        const user = userEvent.setup()
        const onEdit = vi.fn()
        renderMenu(<AlertRowMenu alert={makeAlert()} onEdit={onEdit} />)

        await user.click(screen.getByTestId("alert-menu-trigger-alert-1"))
        await user.click(screen.getByTestId("alert-menu-edit-alert-1"))

        expect(onEdit).toHaveBeenCalled()
        expect(screen.queryByRole("menu")).toBeNull()
    })
})

// ─── Excluir + ConfirmDialog ──────────────────────────────────────────────────

describe("AlertRowMenu — 'Excluir' + ConfirmDialog", () => {
    it("clicar em 'Excluir' abre o ConfirmDialog", async () => {
        const user = userEvent.setup()
        renderMenu(<AlertRowMenu alert={makeAlert()} onEdit={vi.fn()} />)

        await user.click(screen.getByTestId("alert-menu-trigger-alert-1"))
        await user.click(screen.getByTestId("alert-menu-delete-alert-1"))

        expect(screen.queryByRole("menu")).toBeNull()
        expect(screen.getByRole("dialog")).toBeInTheDocument()
    })

    it("ConfirmDialog menciona o threshold", async () => {
        const user = userEvent.setup()
        renderMenu(
            <AlertRowMenu alert={makeAlert({ thresholdKwh: 250.5 })} onEdit={vi.fn()} />,
        )

        await user.click(screen.getByTestId("alert-menu-trigger-alert-1"))
        await user.click(screen.getByTestId("alert-menu-delete-alert-1"))

        expect(screen.getByRole("dialog")).toHaveTextContent(/250,5\s*kWh/)
    })

    it("'Excluir' sempre aparece (qualquer status)", async () => {
        const user = userEvent.setup()
        renderMenu(
            <AlertRowMenu
                alert={makeAlert({ triggeredAt: "2025-11-10T12:00:00.000Z" })}
                onEdit={vi.fn()}
            />,
        )

        await user.click(screen.getByTestId("alert-menu-trigger-alert-1"))
        expect(screen.getByTestId("alert-menu-delete-alert-1")).toBeInTheDocument()
    })

    it("confirmar delete chama service.delete", async () => {
        const user = userEvent.setup()
        vi.mocked(alertService.delete).mockResolvedValue(undefined)

        renderMenu(<AlertRowMenu alert={makeAlert()} onEdit={vi.fn()} />)

        await user.click(screen.getByTestId("alert-menu-trigger-alert-1"))
        await user.click(screen.getByTestId("alert-menu-delete-alert-1"))
        await user.click(screen.getByRole("button", { name: /^excluir$/i }))

        await waitFor(() =>
            expect(alertService.delete).toHaveBeenCalledWith("alert-1"),
        )
    })

    it("chama onAfterDelete em sucesso", async () => {
        const user = userEvent.setup()
        const onAfterDelete = vi.fn()
        vi.mocked(alertService.delete).mockResolvedValue(undefined)

        renderMenu(
            <AlertRowMenu
                alert={makeAlert()}
                onEdit={vi.fn()}
                onAfterDelete={onAfterDelete}
            />,
        )

        await user.click(screen.getByTestId("alert-menu-trigger-alert-1"))
        await user.click(screen.getByTestId("alert-menu-delete-alert-1"))
        await user.click(screen.getByRole("button", { name: /^excluir$/i }))

        await waitFor(() => expect(onAfterDelete).toHaveBeenCalled())
    })

    it("erro em delete dispara toast.error e mantém dialog aberto", async () => {
        const user = userEvent.setup()
        vi.mocked(alertService.delete).mockRejectedValue(new Error("Conflict"))

        renderMenu(<AlertRowMenu alert={makeAlert()} onEdit={vi.fn()} />)

        await user.click(screen.getByTestId("alert-menu-trigger-alert-1"))
        await user.click(screen.getByTestId("alert-menu-delete-alert-1"))
        await user.click(screen.getByRole("button", { name: /^excluir$/i }))

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith(
                "Erro ao excluir alerta",
                expect.objectContaining({
                    description: expect.stringMatching(/conflict/i),
                }),
            ),
        )

        expect(screen.getByRole("dialog")).toBeInTheDocument()
    })
})