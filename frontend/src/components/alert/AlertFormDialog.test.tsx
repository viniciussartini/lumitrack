import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"
import type { ReactNode } from "react"
import { AlertFormDialog } from "@/components/alert/AlertFormDialog"
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

const renderDialog = (ui: ReactNode) => {
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

beforeEach(() => {
    vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// Render / Visibilidade
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertFormDialog — visibilidade", () => {
    it("não renderiza o conteúdo quando isOpen=false", () => {
        renderDialog(
            <AlertFormDialog
                isOpen={false}
                onClose={vi.fn()}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "create" }}
            />,
        )

        expect(screen.queryByTestId("alert-form-dialog")).toBeNull()
    })

    it("renderiza quando isOpen=true", () => {
        renderDialog(
            <AlertFormDialog
                isOpen={true}
                onClose={vi.fn()}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "create" }}
            />,
        )

        expect(screen.getByTestId("alert-form-dialog")).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Header (title + description por modo)
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertFormDialog — header", () => {
    it("CREATE: título 'Criar alerta' + descrição apropriada", () => {
        renderDialog(
            <AlertFormDialog
                isOpen={true}
                onClose={vi.fn()}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "create" }}
            />,
        )

        expect(
            screen.getByRole("heading", { name: /criar alerta/i }),
        ).toBeInTheDocument()
        expect(
            screen.getByText(/defina um limite/i),
        ).toBeInTheDocument()
    })

    it("EDIT: título 'Editar alerta' + descrição apropriada", () => {
        renderDialog(
            <AlertFormDialog
                isOpen={true}
                onClose={vi.fn()}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "edit", alert: makeAlert() }}
            />,
        )

        expect(
            screen.getByRole("heading", { name: /editar alerta/i }),
        ).toBeInTheDocument()
        expect(
            screen.getByText(/atualize o limite/i),
        ).toBeInTheDocument()
    })

    it("CREATE: botão de submit é 'Criar alerta'", () => {
        renderDialog(
            <AlertFormDialog
                isOpen={true}
                onClose={vi.fn()}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "create" }}
            />,
        )

        expect(
            screen.getByRole("button", { name: /criar alerta/i }),
        ).toBeInTheDocument()
    })

    it("EDIT: botão de submit é 'Salvar alterações'", () => {
        renderDialog(
            <AlertFormDialog
                isOpen={true}
                onClose={vi.fn()}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "edit", alert: makeAlert() }}
            />,
        )

        expect(
            screen.getByRole("button", { name: /salvar alterações/i }),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// CREATE — orquestração por target
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertFormDialog — CREATE chama mutation correta por target", () => {
    it("target=property → chama createForProperty", async () => {
        const user = userEvent.setup()
        vi.mocked(alertService.createForProperty).mockResolvedValue(
            makeAlert(),
        )

        renderDialog(
            <AlertFormDialog
                isOpen={true}
                onClose={vi.fn()}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "create" }}
            />,
        )

        await user.type(screen.getByLabelText(/limite de consumo/i), "100")
        await user.click(
            screen.getByRole("button", { name: /criar alerta/i }),
        )

        await waitFor(() => {
            expect(alertService.createForProperty).toHaveBeenCalledWith(
                "prop-1",
                { thresholdKwh: 100 },
            )
        })
        expect(alertService.createForArea).not.toHaveBeenCalled()
        expect(alertService.createForDevice).not.toHaveBeenCalled()
    })

    it("target=area → chama createForArea", async () => {
        const user = userEvent.setup()
        vi.mocked(alertService.createForArea).mockResolvedValue(
            makeAlert({
                targetType: "AREA",
                propertyId: null,
                areaId: "area-1",
            }),
        )

        renderDialog(
            <AlertFormDialog
                isOpen={true}
                onClose={vi.fn()}
                target={{
                    type: "area",
                    propertyId: "prop-1",
                    areaId: "area-1",
                }}
                mode={{ kind: "create" }}
            />,
        )

        await user.type(screen.getByLabelText(/limite de consumo/i), "50")
        await user.click(
            screen.getByRole("button", { name: /criar alerta/i }),
        )

        await waitFor(() => {
            expect(alertService.createForArea).toHaveBeenCalledWith(
                "prop-1",
                "area-1",
                { thresholdKwh: 50 },
            )
        })
    })

    it("target=device → chama createForDevice", async () => {
        const user = userEvent.setup()
        vi.mocked(alertService.createForDevice).mockResolvedValue(
            makeAlert({
                targetType: "DEVICE",
                propertyId: null,
                areaId: null,
                deviceId: "dev-1",
            }),
        )

        renderDialog(
            <AlertFormDialog
                isOpen={true}
                onClose={vi.fn()}
                target={{
                    type: "device",
                    propertyId: "prop-1",
                    areaId: "area-1",
                    deviceId: "dev-1",
                }}
                mode={{ kind: "create" }}
            />,
        )

        await user.type(screen.getByLabelText(/limite de consumo/i), "5")
        await user.click(
            screen.getByRole("button", { name: /criar alerta/i }),
        )

        await waitFor(() => {
            expect(alertService.createForDevice).toHaveBeenCalledWith(
                "prop-1",
                "area-1",
                "dev-1",
                { thresholdKwh: 5 },
            )
        })
    })

    it("inclui message no payload quando preenchida", async () => {
        const user = userEvent.setup()
        vi.mocked(alertService.createForProperty).mockResolvedValue(
            makeAlert(),
        )

        renderDialog(
            <AlertFormDialog
                isOpen={true}
                onClose={vi.fn()}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "create" }}
            />,
        )

        await user.type(screen.getByLabelText(/limite de consumo/i), "100")
        await user.type(
            screen.getByLabelText(/mensagem/i),
            "Cuidar com a geladeira",
        )
        await user.click(
            screen.getByRole("button", { name: /criar alerta/i }),
        )

        await waitFor(() => {
            expect(alertService.createForProperty).toHaveBeenCalledWith(
                "prop-1",
                { thresholdKwh: 100, message: "Cuidar com a geladeira" },
            )
        })
    })

    it("OMITE message do payload quando vazia", async () => {
        const user = userEvent.setup()
        vi.mocked(alertService.createForProperty).mockResolvedValue(
            makeAlert(),
        )

        renderDialog(
            <AlertFormDialog
                isOpen={true}
                onClose={vi.fn()}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "create" }}
            />,
        )

        await user.type(screen.getByLabelText(/limite de consumo/i), "100")
        await user.click(
            screen.getByRole("button", { name: /criar alerta/i }),
        )

        await waitFor(() => {
            expect(alertService.createForProperty).toHaveBeenCalledWith(
                "prop-1",
                { thresholdKwh: 100 }, // sem message
            )
        })
    })

    it("fecha o dialog após sucesso", async () => {
        const user = userEvent.setup()
        const onClose = vi.fn()
        vi.mocked(alertService.createForProperty).mockResolvedValue(
            makeAlert(),
        )

        renderDialog(
            <AlertFormDialog
                isOpen={true}
                onClose={onClose}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "create" }}
            />,
        )

        await user.type(screen.getByLabelText(/limite de consumo/i), "100")
        await user.click(
            screen.getByRole("button", { name: /criar alerta/i }),
        )

        await waitFor(() => expect(onClose).toHaveBeenCalled())
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// EDIT — orquestração
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertFormDialog — EDIT chama service.update", () => {
    it("envia thresholdKwh atualizado", async () => {
        const user = userEvent.setup()
        vi.mocked(alertService.update).mockResolvedValue(
            makeAlert({ thresholdKwh: 200 }),
        )

        renderDialog(
            <AlertFormDialog
                isOpen={true}
                onClose={vi.fn()}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{
                    kind: "edit",
                    alert: makeAlert({ thresholdKwh: 100 }),
                }}
            />,
        )

        const thresholdInput = screen.getByLabelText(/limite de consumo/i)
        await user.clear(thresholdInput)
        await user.type(thresholdInput, "200")
        await user.click(
            screen.getByRole("button", { name: /salvar alterações/i }),
        )

        await waitFor(() => {
            expect(alertService.update).toHaveBeenCalledWith("alert-1", {
                thresholdKwh: 200,
            })
        })
    })

    it("envia message atualizada", async () => {
        const user = userEvent.setup()
        vi.mocked(alertService.update).mockResolvedValue(makeAlert())

        renderDialog(
            <AlertFormDialog
                isOpen={true}
                onClose={vi.fn()}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{
                    kind: "edit",
                    alert: makeAlert({ message: "Antiga" }),
                }}
            />,
        )

        const messageInput = screen.getByLabelText(/mensagem/i)
        await user.clear(messageInput)
        await user.type(messageInput, "Nova mensagem")
        await user.click(
            screen.getByRole("button", { name: /salvar alterações/i }),
        )

        await waitFor(() => {
            expect(alertService.update).toHaveBeenCalledWith("alert-1", {
                thresholdKwh: 100,
                message: "Nova mensagem",
            })
        })
    })

    it("fecha o dialog após sucesso", async () => {
        const user = userEvent.setup()
        const onClose = vi.fn()
        vi.mocked(alertService.update).mockResolvedValue(makeAlert())

        renderDialog(
            <AlertFormDialog
                isOpen={true}
                onClose={onClose}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "edit", alert: makeAlert() }}
            />,
        )

        const thresholdInput = screen.getByLabelText(/limite de consumo/i)
        await user.clear(thresholdInput)
        await user.type(thresholdInput, "200")
        await user.click(
            screen.getByRole("button", { name: /salvar alterações/i }),
        )

        await waitFor(() => expect(onClose).toHaveBeenCalled())
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertFormDialog — erros", () => {
    it("CREATE: erro dispara toast.error e NÃO fecha o dialog", async () => {
        const user = userEvent.setup()
        const onClose = vi.fn()
        vi.mocked(alertService.createForProperty).mockRejectedValue(
            new Error("Validation failed"),
        )

        renderDialog(
            <AlertFormDialog
                isOpen={true}
                onClose={onClose}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "create" }}
            />,
        )

        await user.type(screen.getByLabelText(/limite de consumo/i), "100")
        await user.click(
            screen.getByRole("button", { name: /criar alerta/i }),
        )

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(
                "Erro ao criar alerta",
                expect.objectContaining({
                    description: expect.stringMatching(/validation failed/i),
                }),
            )
        })
        expect(onClose).not.toHaveBeenCalled()
    })

    it("EDIT: erro dispara toast.error e NÃO fecha o dialog", async () => {
        const user = userEvent.setup()
        const onClose = vi.fn()
        vi.mocked(alertService.update).mockRejectedValue(new Error("Forbidden"))

        renderDialog(
            <AlertFormDialog
                isOpen={true}
                onClose={onClose}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "edit", alert: makeAlert() }}
            />,
        )

        const thresholdInput = screen.getByLabelText(/limite de consumo/i)
        await user.clear(thresholdInput)
        await user.type(thresholdInput, "200")
        await user.click(
            screen.getByRole("button", { name: /salvar alterações/i }),
        )

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(
                "Erro ao atualizar alerta",
                expect.objectContaining({
                    description: expect.stringMatching(/forbidden/i),
                }),
            )
        })
        expect(onClose).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Cancel
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertFormDialog — cancel", () => {
    it("clicar em Cancelar dispara onClose", async () => {
        const user = userEvent.setup()
        const onClose = vi.fn()

        renderDialog(
            <AlertFormDialog
                isOpen={true}
                onClose={onClose}
                target={{ type: "property", propertyId: "prop-1" }}
                mode={{ kind: "create" }}
            />,
        )

        await user.click(screen.getByRole("button", { name: /cancelar/i }))

        expect(onClose).toHaveBeenCalled()
    })
})