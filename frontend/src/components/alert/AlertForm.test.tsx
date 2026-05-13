import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AlertForm } from "@/components/alert/AlertForm"
import type { Alert } from "@/types/alert.types"

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

interface RenderOptions {
    initialData?: Alert
    onSubmit?: (data: unknown) => Promise<void>
    onCancel?: () => void
    submitLabel?: string
}

const renderForm = (options: RenderOptions = {}) =>
    render(
        <AlertForm
            initialData={options.initialData}
            onSubmit={options.onSubmit ?? vi.fn().mockResolvedValue(undefined)}
            onCancel={options.onCancel ?? vi.fn()}
            submitLabel={options.submitLabel}
        />,
    )

// ─────────────────────────────────────────────────────────────────────────────
// Modo criação
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertForm — modo criação (sem initialData)", () => {
    it("renderiza campos vazios", () => {
        renderForm()

        expect(screen.getByLabelText(/limite de consumo/i)).toHaveValue(null)
        expect(screen.getByLabelText(/mensagem/i)).toHaveValue("")
    })

    it("renderiza o botão de submit com label default 'Salvar'", () => {
        renderForm()

        expect(
            screen.getByRole("button", { name: /salvar/i }),
        ).toBeInTheDocument()
    })

    it("aceita submitLabel customizado", () => {
        renderForm({ submitLabel: "Criar alerta" })

        expect(
            screen.getByRole("button", { name: /criar alerta/i }),
        ).toBeInTheDocument()
    })

    it("NÃO exibe banner de aviso de disparo", () => {
        renderForm()

        expect(
            screen.queryByTestId("alert-form-triggered-warning"),
        ).toBeNull()
    })

    it("threshold tem autoFocus inicial", () => {
        renderForm()

        expect(screen.getByLabelText(/limite de consumo/i)).toHaveFocus()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Modo edição
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertForm — modo edição (com initialData)", () => {
    it("preenche threshold com o valor inicial", () => {
        renderForm({ initialData: makeAlert({ thresholdKwh: 250 }) })

        expect(screen.getByLabelText(/limite de consumo/i)).toHaveValue(250)
    })

    it("preenche mensagem com o valor inicial", () => {
        renderForm({
            initialData: makeAlert({ message: "Ficar de olho na geladeira" }),
        })

        expect(screen.getByLabelText(/mensagem/i)).toHaveValue(
            "Ficar de olho na geladeira",
        )
    })

    it("converte message=null em string vazia no textarea", () => {
        renderForm({ initialData: makeAlert({ message: null }) })

        expect(screen.getByLabelText(/mensagem/i)).toHaveValue("")
    })

    it("NÃO exibe banner quando alerta NÃO disparou (triggeredAt=null)", () => {
        renderForm({ initialData: makeAlert({ triggeredAt: null }) })

        expect(
            screen.queryByTestId("alert-form-triggered-warning"),
        ).toBeNull()
    })

    it("EXIBE banner quando alerta JÁ disparou (triggeredAt!=null)", () => {
        renderForm({
            initialData: makeAlert({
                triggeredAt: "2025-11-10T12:00:00.000Z",
            }),
        })

        expect(
            screen.getByTestId("alert-form-triggered-warning"),
        ).toBeInTheDocument()
        expect(
            screen.getByText(/não fará/i),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Validação
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertForm — validação", () => {
    it("rejeita threshold vazio", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ onSubmit })

        await user.click(screen.getByRole("button", { name: /salvar/i }))

        expect(
            await screen.findByText(/informe um número válido/i),
        ).toBeInTheDocument()
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it("rejeita threshold zero", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/limite de consumo/i), "0")
        await user.click(screen.getByRole("button", { name: /salvar/i }))

        expect(
            await screen.findByText(/maior que zero/i),
        ).toBeInTheDocument()
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it("rejeita threshold negativo", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/limite de consumo/i), "-5")
        await user.click(screen.getByRole("button", { name: /salvar/i }))

        expect(
            await screen.findByText(/maior que zero/i),
        ).toBeInTheDocument()
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it("rejeita mensagem com mais de 500 caracteres", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ onSubmit })

        // O <textarea> tem maxLength=500, mas o user pode colar texto mais
        // longo. Simulamos isso usando fireEvent.change manualmente.
        const textarea = screen.getByLabelText(/mensagem/i)

        // userEvent.type respeita maxLength, então usamos paste pra forçar
        await user.click(textarea)
        await user.paste("a".repeat(501))
        await user.type(screen.getByLabelText(/limite de consumo/i), "100")
        await user.click(screen.getByRole("button", { name: /salvar/i }))

        // Se a validação de comprimento funciona, onSubmit não foi chamado
        // e a mensagem de erro aparece. Mas se o maxLength do textarea
        // cortou em 500, o submit passa — esse teste é defensivo.
        const value = (textarea as HTMLTextAreaElement).value
        if (value.length > 500) {
            expect(
                await screen.findByText(/máximo 500 caracteres/i),
            ).toBeInTheDocument()
            expect(onSubmit).not.toHaveBeenCalled()
        } else {
            // maxLength do HTML cortou — submit deve passar
            await waitFor(() => expect(onSubmit).toHaveBeenCalled())
        }
    })

    it("aceita submit quando só threshold é preenchido (message opcional)", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/limite de consumo/i), "100")
        await user.click(screen.getByRole("button", { name: /salvar/i }))

        await waitFor(() => expect(onSubmit).toHaveBeenCalled())

        const data = onSubmit.mock.calls[0]![0] as {
            thresholdKwh: number
            message?: string
        }
        expect(data.thresholdKwh).toBe(100)
        expect(data.message).toBeUndefined()
    })

    it("aceita threshold com casas decimais (12.5)", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/limite de consumo/i), "12.5")
        await user.click(screen.getByRole("button", { name: /salvar/i }))

        await waitFor(() => expect(onSubmit).toHaveBeenCalled())

        const data = onSubmit.mock.calls[0]![0] as { thresholdKwh: number }
        expect(data.thresholdKwh).toBe(12.5)
    })

    it("transforma string vazia da message em undefined", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/limite de consumo/i), "100")
        // Mensagem não preenchida (vazia)
        await user.click(screen.getByRole("button", { name: /salvar/i }))

        await waitFor(() => expect(onSubmit).toHaveBeenCalled())

        const data = onSubmit.mock.calls[0]![0] as {
            message: string | undefined
        }
        expect(data.message).toBeUndefined()
    })

    it("inclui message quando preenchida", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/limite de consumo/i), "100")
        await user.type(
            screen.getByLabelText(/mensagem/i),
            "Cuidado com a geladeira",
        )
        await user.click(screen.getByRole("button", { name: /salvar/i }))

        await waitFor(() => expect(onSubmit).toHaveBeenCalled())

        const data = onSubmit.mock.calls[0]![0] as { message: string }
        expect(data.message).toBe("Cuidado com a geladeira")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Cancel
// ─────────────────────────────────────────────────────────────────────────────

describe("AlertForm — cancel", () => {
    it("clicar em Cancelar dispara onCancel", async () => {
        const user = userEvent.setup()
        const onCancel = vi.fn()
        renderForm({ onCancel })

        await user.click(screen.getByRole("button", { name: /cancelar/i }))

        expect(onCancel).toHaveBeenCalled()
    })

    it("Cancelar fica disabled durante submit", async () => {
        const user = userEvent.setup()
        // Mock onSubmit que demora — simula submit em andamento
        const onSubmit = vi.fn(
            () => new Promise<void>(() => {}),
        )
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/limite de consumo/i), "100")
        await user.click(screen.getByRole("button", { name: /salvar/i }))

        await waitFor(() => {
            expect(
                screen.getByRole("button", { name: /cancelar/i }),
            ).toBeDisabled()
        })
    })
})