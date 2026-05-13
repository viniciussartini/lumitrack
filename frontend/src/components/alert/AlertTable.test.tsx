import { describe, it, expect, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { AlertTable } from "@/components/alert/AlertTable"
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
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

// AlertRowMenu usa hooks de mutation → precisa de QueryClientProvider
const renderWithClient = (ui: ReactNode) => {
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

// ─────────────────────────────────────────────────────────────────────────────
// Estrutura (nested — sem showTarget)
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertTable — estrutura (nested, sem showTarget)", () => {
    it("renderiza header com colunas Limite, Status e Disparado em", () => {
        render(<AlertTable alerts={[]} />)

        expect(
            screen.getByRole("columnheader", { name: /limite/i }),
        ).toBeInTheDocument()
        expect(
            screen.getByRole("columnheader", { name: /status/i }),
        ).toBeInTheDocument()
        expect(
            screen.getByRole("columnheader", { name: /disparado em/i }),
        ).toBeInTheDocument()
    })

    it("NÃO renderiza coluna 'Alvo' por default", () => {
        render(<AlertTable alerts={[]} />)

        expect(
            screen.queryByRole("columnheader", { name: /alvo/i }),
        ).toBeNull()
    })

    it("renderiza tabela vazia (só o header) quando alerts=[]", () => {
        render(<AlertTable alerts={[]} />)

        expect(screen.getByTestId("alert-table")).toBeInTheDocument()
        expect(screen.queryByTestId(/^alert-row-/)).toBeNull()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Linhas
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertTable — linhas (nested)", () => {
    it("renderiza uma linha por alerta com testid baseado no id", () => {
        const alerts = [
            makeAlert({ id: "alert-1" }),
            makeAlert({ id: "alert-2" }),
        ]
        render(<AlertTable alerts={alerts} />)

        expect(screen.getByTestId("alert-row-alert-1")).toBeInTheDocument()
        expect(screen.getByTestId("alert-row-alert-2")).toBeInTheDocument()
    })

    it("renderiza threshold formatado com sufixo 'kWh'", () => {
        render(<AlertTable alerts={[makeAlert({ thresholdKwh: 100.5 })]} />)

        const row = screen.getByTestId("alert-row-alert-1")
        // pt-BR usa vírgula como separador decimal
        expect(within(row).getByText(/100,5\s*kWh/)).toBeInTheDocument()
    })

    it("renderiza '—' em 'Disparado em' quando triggeredAt é null", () => {
        render(<AlertTable alerts={[makeAlert()]} />)

        const row = screen.getByTestId("alert-row-alert-1")
        expect(within(row).getByText("—")).toBeInTheDocument()
    })

    it("renderiza data formatada em 'Disparado em' quando triggeredAt está preenchido", () => {
        render(
            <AlertTable
                alerts={[
                    makeAlert({ triggeredAt: "2025-11-15T14:30:00.000Z" }),
                ]}
            />,
        )

        const row = screen.getByTestId("alert-row-alert-1")
        // Aceita qualquer formato pt-BR com data + hora (timezone local)
        expect(
            within(row).getByText(/15\/11\/2025[,\s]+\d{2}:\d{2}/),
        ).toBeInTheDocument()
    })

    it("renderiza o AlertStatusBadge na linha", () => {
        render(<AlertTable alerts={[makeAlert()]} />)

        expect(
            screen.getByTestId("alert-status-badge-alert-1"),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// showTarget (modo global — AlertsPage)
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertTable — showTarget (modo global)", () => {
    it("renderiza coluna 'Alvo' quando showTarget=true", () => {
        render(<AlertTable alerts={[]} showTarget />)

        expect(
            screen.getByRole("columnheader", { name: /alvo/i }),
        ).toBeInTheDocument()
    })

    it("renderiza fallback com ID curto quando targetLookup não fornece a entrada", () => {
        // propertyId longo — formatAlertTarget pega os primeiros 8 chars
        const alert = makeAlert({
            propertyId: "7c4a1b2e-1234-5678-90ab-cdef12345678",
        })
        render(<AlertTable alerts={[alert]} showTarget />)

        const row = screen.getByTestId("alert-row-alert-1")
        expect(
            within(row).getByText(/Propriedade · 7c4a1b2e/),
        ).toBeInTheDocument()
    })

    it("resolve o nome humano quando targetLookup fornece a entrada (PROPERTY)", () => {
        const alert = makeAlert({ propertyId: "prop-1" })
        render(
            <AlertTable
                alerts={[alert]}
                showTarget
                targetLookup={{
                    properties: { "prop-1": { name: "Casa Principal" } },
                }}
            />,
        )

        const row = screen.getByTestId("alert-row-alert-1")
        expect(within(row).getByText("Casa Principal")).toBeInTheDocument()
    })

    it("resolve hierarquia 'propriedade · área · dispositivo' (DEVICE)", () => {
        const alert = makeAlert({
            targetType: "DEVICE",
            propertyId: null,
            areaId: null,
            deviceId: "dev-1",
        })
        render(
            <AlertTable
                alerts={[alert]}
                showTarget
                targetLookup={{
                    devices: {
                        "dev-1": {
                            name: "Geladeira",
                            areaName: "Cozinha",
                            propertyName: "Casa Principal",
                        },
                    },
                }}
            />,
        )

        const row = screen.getByTestId("alert-row-alert-1")
        expect(
            within(row).getByText("Casa Principal · Cozinha · Geladeira"),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Coluna de ações (com onEdit)
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertTable — coluna de ações (com onEdit)", () => {
    it("não renderiza coluna 'Ações' quando onEdit é omitido", () => {
        renderWithClient(<AlertTable alerts={[]} />)

        expect(
            screen.queryByRole("columnheader", { name: /ações/i }),
        ).toBeNull()
    })

    it("renderiza coluna 'Ações' quando onEdit é fornecido", () => {
        renderWithClient(<AlertTable alerts={[]} onEdit={vi.fn()} />)

        expect(
            screen.getByRole("columnheader", { name: /ações/i }),
        ).toBeInTheDocument()
    })

    it("renderiza AlertRowMenu em cada linha quando coluna de ações ativa", () => {
        renderWithClient(
            <AlertTable
                alerts={[
                    makeAlert({ id: "alert-1" }),
                    makeAlert({ id: "alert-2" }),
                ]}
                onEdit={vi.fn()}
            />,
        )

        // Testid do trigger segue padrão alert-menu-trigger-{id}
        expect(
            screen.getByTestId("alert-menu-trigger-alert-1"),
        ).toBeInTheDocument()
        expect(
            screen.getByTestId("alert-menu-trigger-alert-2"),
        ).toBeInTheDocument()
    })

    it("clicar em 'Editar' chama onEdit com o alert da linha", async () => {
        const user = userEvent.setup()
        const onEdit = vi.fn()

        renderWithClient(
            <AlertTable
                alerts={[
                    makeAlert({ id: "alert-1" }),
                    makeAlert({ id: "alert-2", thresholdKwh: 50 }),
                ]}
                onEdit={onEdit}
            />,
        )

        await user.click(screen.getByTestId("alert-menu-trigger-alert-2"))
        await user.click(screen.getByTestId("alert-menu-edit-alert-2"))

        expect(onEdit).toHaveBeenCalledWith(
            expect.objectContaining({ id: "alert-2", thresholdKwh: 50 }),
        )
    })
})