import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"
import type { ReactNode } from "react"
import { ConsumptionRowMenu } from "@/components/consumption/ConsumptionRowMenu"
import { consumptionService } from "@/services/consumption.service"
import type { ConsumptionRecord } from "@/types/consumption.types"

vi.mock("@/services/consumption.service", () => ({
    consumptionService: {
        listByProperty: vi.fn(),
        listByArea: vi.fn(),
        listByDevice: vi.fn(),
        getById: vi.fn(),
        createForProperty: vi.fn(),
        createForArea: vi.fn(),
        createForDevice: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
}))

vi.mock("sonner", () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/services/api", () => ({
    api: {},
    extractErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : "Erro desconhecido",
}))

const baseRecord: ConsumptionRecord = {
    id: "rec-1",
    propertyId: "prop-1",
    areaId: null,
    deviceId: null,
    period: "DAILY",
    referenceDate: "2025-01-15T12:00:00.000Z",
    kwhConsumed: 12.5,
    costBrl: 9.375,
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const renderMenu = (
    ui: ReactNode,
): { unmount: () => void } => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    const { unmount } = render(
        <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    )
    return { unmount }
}

beforeEach(() => {
    vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// Trigger e abertura/fechamento
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionRowMenu — trigger", () => {
    it("renderiza o trigger com aria-label dinâmico baseado na data formatada", () => {
        renderMenu(
            <ConsumptionRowMenu
                record={baseRecord}
                propertyId="prop-1"
                onEdit={vi.fn()}
            />,
        )

        // baseRecord é DAILY com referenceDate 15/01/2025
        expect(
            screen.getByRole("button", {
                name: /opções do registro de 15\/01\/2025/i,
            }),
        ).toBeInTheDocument()
    })

    it("aria-label adapta-se ao period (MONTHLY → 'Janeiro de 2025')", () => {
        const monthlyRecord: ConsumptionRecord = {
            ...baseRecord,
            period: "MONTHLY",
            referenceDate: "2025-01-01T12:00:00.000Z",
        }
        renderMenu(
            <ConsumptionRowMenu
                record={monthlyRecord}
                propertyId="prop-1"
                onEdit={vi.fn()}
            />,
        )

        expect(
            screen.getByRole("button", {
                name: /opções do registro de janeiro de 2025/i,
            }),
        ).toBeInTheDocument()
    })

    it("menu fica fechado por padrão", () => {
        renderMenu(
            <ConsumptionRowMenu
                record={baseRecord}
                propertyId="prop-1"
                onEdit={vi.fn()}
            />,
        )

        expect(screen.queryByRole("menu")).toBeNull()
    })

    it("clicar no trigger abre o menu", async () => {
        const user = userEvent.setup()
        renderMenu(
            <ConsumptionRowMenu
                record={baseRecord}
                propertyId="prop-1"
                onEdit={vi.fn()}
            />,
        )

        await user.click(
            screen.getByTestId("consumption-row-rec-1-menu-trigger"),
        )

        expect(screen.getByRole("menu")).toBeInTheDocument()
    })

    it("trigger reflete estado em aria-expanded", async () => {
        const user = userEvent.setup()
        renderMenu(
            <ConsumptionRowMenu
                record={baseRecord}
                propertyId="prop-1"
                onEdit={vi.fn()}
            />,
        )

        const trigger = screen.getByTestId("consumption-row-rec-1-menu-trigger")
        expect(trigger).toHaveAttribute("aria-expanded", "false")

        await user.click(trigger)

        expect(trigger).toHaveAttribute("aria-expanded", "true")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Item "Editar"
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionRowMenu — item Editar", () => {
    it("renderiza item 'Editar' quando onEdit é fornecido e showEdit=true (default)", async () => {
        const user = userEvent.setup()
        renderMenu(
            <ConsumptionRowMenu
                record={baseRecord}
                propertyId="prop-1"
                onEdit={vi.fn()}
            />,
        )

        await user.click(
            screen.getByTestId("consumption-row-rec-1-menu-trigger"),
        )

        expect(
            screen.getByRole("menuitem", { name: /editar/i }),
        ).toBeInTheDocument()
    })

    it("OMITE 'Editar' quando showEdit=false", async () => {
        const user = userEvent.setup()
        renderMenu(
            <ConsumptionRowMenu
                record={baseRecord}
                propertyId="prop-1"
                onEdit={vi.fn()}
                showEdit={false}
            />,
        )

        await user.click(
            screen.getByTestId("consumption-row-rec-1-menu-trigger"),
        )

        expect(
            screen.queryByRole("menuitem", { name: /editar/i }),
        ).toBeNull()
    })

    it("OMITE 'Editar' quando onEdit não é fornecido", async () => {
        const user = userEvent.setup()
        renderMenu(
            <ConsumptionRowMenu
                record={baseRecord}
                propertyId="prop-1"
            />,
        )

        await user.click(
            screen.getByTestId("consumption-row-rec-1-menu-trigger"),
        )

        expect(
            screen.queryByRole("menuitem", { name: /editar/i }),
        ).toBeNull()
    })

    it("clicar em 'Editar' chama onEdit e fecha o menu", async () => {
        const user = userEvent.setup()
        const onEdit = vi.fn()
        renderMenu(
            <ConsumptionRowMenu
                record={baseRecord}
                propertyId="prop-1"
                onEdit={onEdit}
            />,
        )

        await user.click(
            screen.getByTestId("consumption-row-rec-1-menu-trigger"),
        )
        await user.click(
            screen.getByTestId("consumption-row-rec-1-menu-edit"),
        )

        expect(onEdit).toHaveBeenCalled()
        expect(screen.queryByRole("menu")).toBeNull()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Item "Excluir" + ConfirmDialog
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionRowMenu — item Excluir", () => {
    it("clicar em 'Excluir' abre o ConfirmDialog e fecha o menu", async () => {
        const user = userEvent.setup()
        renderMenu(
            <ConsumptionRowMenu
                record={baseRecord}
                propertyId="prop-1"
                onEdit={vi.fn()}
            />,
        )

        await user.click(
            screen.getByTestId("consumption-row-rec-1-menu-trigger"),
        )
        await user.click(
            screen.getByTestId("consumption-row-rec-1-menu-delete"),
        )

        // Menu fecha
        expect(screen.queryByRole("menu")).toBeNull()
        // ConfirmDialog abre
        expect(screen.getByRole("dialog")).toBeInTheDocument()
    })

    it("ConfirmDialog menciona a data formatada do registro", async () => {
        const user = userEvent.setup()
        renderMenu(
            <ConsumptionRowMenu
                record={baseRecord}
                propertyId="prop-1"
                onEdit={vi.fn()}
            />,
        )

        await user.click(
            screen.getByTestId("consumption-row-rec-1-menu-trigger"),
        )
        await user.click(
            screen.getByTestId("consumption-row-rec-1-menu-delete"),
        )

        const dialog = screen.getByRole("dialog")
        expect(dialog).toHaveTextContent(/15\/01\/2025/)
        expect(dialog).toHaveTextContent(/não pode ser desfeita/i)
    })

    it("confirmar exclusão chama service.delete e dispara onAfterDelete", async () => {
        const user = userEvent.setup()
        const onAfterDelete = vi.fn()
        vi.mocked(consumptionService.delete).mockResolvedValue(undefined)

        renderMenu(
            <ConsumptionRowMenu
                record={baseRecord}
                propertyId="prop-1"
                onEdit={vi.fn()}
                onAfterDelete={onAfterDelete}
            />,
        )

        await user.click(
            screen.getByTestId("consumption-row-rec-1-menu-trigger"),
        )
        await user.click(
            screen.getByTestId("consumption-row-rec-1-menu-delete"),
        )

        await user.click(
            screen.getAllByRole("button", { name: /^excluir$/i })[0]!,
        )

        await waitFor(() => {
            expect(consumptionService.delete).toHaveBeenCalledWith(
                "prop-1",
                "rec-1",
            )
        })
        expect(onAfterDelete).toHaveBeenCalled()
    })

    it("usa o propertyId da PROP, não do record (registros de device têm propertyId=null)", async () => {
        const user = userEvent.setup()
        const deviceRecord: ConsumptionRecord = {
            ...baseRecord,
            id: "rec-d1",
            propertyId: null, // ← null em registros de device
            deviceId: "dev-1",
        }
        vi.mocked(consumptionService.delete).mockResolvedValue(undefined)

        renderMenu(
            <ConsumptionRowMenu
                record={deviceRecord}
                propertyId="prop-1" // ← prop separada
                onEdit={vi.fn()}
            />,
        )

        await user.click(
            screen.getByTestId("consumption-row-rec-d1-menu-trigger"),
        )
        await user.click(
            screen.getByTestId("consumption-row-rec-d1-menu-delete"),
        )
        await user.click(
            screen.getAllByRole("button", { name: /^excluir$/i })[0]!,
        )

        await waitFor(() => {
            // Backend usa /properties/prop-1/consumption/rec-d1
            expect(consumptionService.delete).toHaveBeenCalledWith(
                "prop-1",
                "rec-d1",
            )
        })
    })

    it("erro no delete dispara toast.error e NÃO chama onAfterDelete", async () => {
        const user = userEvent.setup()
        const onAfterDelete = vi.fn()
        vi.mocked(consumptionService.delete).mockRejectedValue(
            new Error("403 Forbidden"),
        )

        renderMenu(
            <ConsumptionRowMenu
                record={baseRecord}
                propertyId="prop-1"
                onEdit={vi.fn()}
                onAfterDelete={onAfterDelete}
            />,
        )

        await user.click(
            screen.getByTestId("consumption-row-rec-1-menu-trigger"),
        )
        await user.click(
            screen.getByTestId("consumption-row-rec-1-menu-delete"),
        )
        await user.click(
            screen.getAllByRole("button", { name: /^excluir$/i })[0]!,
        )

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(
                "Erro ao excluir registro",
                expect.objectContaining({
                    description: expect.stringMatching(/forbidden/i),
                }),
            )
        })
        expect(onAfterDelete).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Click outside fecha o menu
// ─────────────────────────────────────────────────────────────────────────────

describe("ConsumptionRowMenu — click outside", () => {
    it("clicar fora fecha o menu", async () => {
        const user = userEvent.setup()
        renderMenu(
            <div>
                <button data-testid="outside">Fora</button>
                <ConsumptionRowMenu
                    record={baseRecord}
                    propertyId="prop-1"
                    onEdit={vi.fn()}
                />
            </div>,
        )

        await user.click(
            screen.getByTestId("consumption-row-rec-1-menu-trigger"),
        )
        expect(screen.getByRole("menu")).toBeInTheDocument()

        await user.click(screen.getByTestId("outside"))
        expect(screen.queryByRole("menu")).toBeNull()
    })
})