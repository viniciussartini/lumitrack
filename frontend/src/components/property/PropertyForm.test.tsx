import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { render, screen, waitFor } from "@testing-library/react"
import { PropertyForm } from "@/components/property/PropertyForm"
import type { Property } from "@/types/property.types"
import type { Distributor } from "@/types/distributor.types"
import type { AclContract } from "@/types/acl-contract.types"

const mockDistributor1: Distributor = {
    id: "dist-1",
    name: "CEMIG Distribuição S.A.",
    cnpj: "06.981.180/0001-16",
    state: "MG",
    tusdPerKwh: 0.35,
    tePerKwh: 0.4,
    icmsRate: 0.18,
    pisRate: 0.0165,
    cofinsRate: 0.076,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const mockDistributor2: Distributor = {
    ...mockDistributor1,
    id: "dist-2",
    name: "ENEL São Paulo",
    cnpj: "61.695.227/0001-93",
}

const mockProperty: Property = {
    id: "prop-1",
    userId: "user-1",
    distributorId: "dist-1",
    name: "Casa Principal",
    address: "Rua das Flores, 100",
    city: "Belo Horizonte",
    state: "MG",
    zipCode: "30000-000",
    electricalSystem: "TRIPHASIC",
    billingClass: "B1",
    groupBModality: "CONVENTIONAL",
    receivesBillingDiscount: false,
    tariffGroup: "GROUP_B",
    contractingEnvironment: "ACR",
    tariffSubgroup: null,
    tariffModality: null,
    contractedDemandKw: null,
    contractedDemandPeakKw: null,
    contractedDemandOffPeakKw: null,
    publicLightingFeeBrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const renderForm = (props: Partial<React.ComponentProps<typeof PropertyForm>> = {}) =>
    render(
        <PropertyForm
            distributors={[mockDistributor1, mockDistributor2]}
            onSubmit={vi.fn()}
            onCancel={vi.fn()}
            {...props}
        />,
    )

beforeEach(() => {
    vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// Renderização básica
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyForm — renderização", () => {
    it("renderiza as quatro seções com headings", () => {
        renderForm()

        expect(
            screen.getByRole("heading", { level: 2, name: /identificação/i }),
        ).toBeInTheDocument()
        expect(
            screen.getByRole("heading", { level: 2, name: /distribuidora/i }),
        ).toBeInTheDocument()
        expect(screen.getByRole("heading", { level: 2, name: /faturamento/i })).toBeInTheDocument()
        expect(screen.getByRole("heading", { level: 2, name: /endereço/i })).toBeInTheDocument()
    })

    it("renderiza todos os campos do form", () => {
        renderForm()

        expect(screen.getByLabelText(/nome da propriedade/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/distribuidora vinculada/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/sistema elétrico/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/classe de faturamento/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/iluminação pública/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/logradouro/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/cep/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/cidade/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/uf/i)).toBeInTheDocument()
    })

    it("popula o select de distribuidora com as opções recebidas", () => {
        renderForm()

        expect(
            screen.getByRole("option", { name: /cemig distribuição s\.a\./i }),
        ).toBeInTheDocument()
        expect(screen.getByRole("option", { name: /enel são paulo/i })).toBeInTheDocument()
    })

    it("usa label de submit customizado quando passado", () => {
        renderForm({ submitLabel: "Criar propriedade" })

        expect(screen.getByRole("button", { name: /criar propriedade/i })).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Modo edição (com initialData)
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyForm — modo edição", () => {
    it("preenche todos os campos com os dados iniciais", () => {
        renderForm({ initialData: mockProperty })

        expect(screen.getByLabelText(/nome/i)).toHaveValue("Casa Principal")
        expect(screen.getByLabelText(/logradouro/i)).toHaveValue("Rua das Flores, 100")
        expect(screen.getByLabelText(/cep/i)).toHaveValue("30000-000")
        expect(screen.getByLabelText(/cidade/i)).toHaveValue("Belo Horizonte")
        expect(screen.getByLabelText(/sistema elétrico/i)).toHaveValue("TRIPHASIC")
        expect(screen.getByLabelText(/classe de faturamento/i)).toHaveValue("B1")
        expect(screen.getByLabelText(/^modalidade$/i)).toHaveValue("CONVENTIONAL")
    })

    it("converte campos null em string vazia sem quebrar", () => {
        const propertyWithNulls: Property = {
            ...mockProperty,
            address: null,
            city: null,
            state: null,
            zipCode: null,
        }

        renderForm({ initialData: propertyWithNulls })

        expect(screen.getByLabelText(/logradouro/i)).toHaveValue("")
        expect(screen.getByLabelText(/cidade/i)).toHaveValue("")
        expect(screen.getByLabelText(/cep/i)).toHaveValue("")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Validação
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyForm — validação", () => {
    it("exige nome ao tentar submeter vazio", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        renderForm({ onSubmit })

        await user.click(screen.getByRole("button", { name: /salvar/i }))

        expect(await screen.findByText(/nome é obrigatório/i)).toBeInTheDocument()
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it("exige distribuidora ao tentar submeter sem selecionar", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/nome/i), "Casa")
        await user.click(screen.getByRole("button", { name: /salvar/i }))

        expect(await screen.findByText(/selecione uma distribuidora/i)).toBeInTheDocument()
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it("rejeita CEP em formato inválido", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        renderForm({ onSubmit })

        const cepInput = screen.getByLabelText(/cep/i)
        await user.type(cepInput, "123") // 3 dígitos: sobrevive à máscara mas falha no regex 00000-000
        await user.tab() // dispara onBlur

        expect(await screen.findByText(/cep deve estar no formato/i)).toBeInTheDocument()
    })

    it("rejeita CEP com sequência repetida (00000-000)", async () => {
        const user = userEvent.setup()
        renderForm()

        const cepInput = screen.getByLabelText(/cep/i)
        await user.type(cepInput, "00000000")
        await user.tab()

        expect(await screen.findByText(/cep inválido/i)).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Máscara de CEP
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyForm — máscara de CEP", () => {
    it("aplica máscara enquanto digita", async () => {
        const user = userEvent.setup()
        renderForm()

        const cepInput = screen.getByLabelText(/cep/i) as HTMLInputElement
        await user.type(cepInput, "30000000")

        expect(cepInput.value).toBe("30000-000")
    })

    it("ignora caracteres não numéricos", async () => {
        const user = userEvent.setup()
        renderForm()

        const cepInput = screen.getByLabelText(/cep/i) as HTMLInputElement
        await user.type(cepInput, "30abc000def000")

        expect(cepInput.value).toBe("30000-000")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Submit feliz
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyForm — submit", () => {
    it("chama onSubmit com defaults de faturamento e endereço vazio→undefined", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/nome/i), "Casa Principal")
        await user.selectOptions(screen.getByLabelText(/distribuidora vinculada/i), "dist-1")

        await user.click(screen.getByRole("button", { name: /salvar/i }))

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))

        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "Casa Principal",
                distributorId: "dist-1",
                electricalSystem: "MONOPHASIC",
                billingClass: "B1",
                address: undefined,
                city: undefined,
                state: undefined,
                zipCode: undefined,
            }),
            expect.anything(), // RHF passa o SyntheticEvent como 2º arg
        )
    })

    it("envia campos preenchidos corretamente", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/nome/i), "Casa Principal")
        await user.selectOptions(screen.getByLabelText(/distribuidora vinculada/i), "dist-1")
        await user.selectOptions(screen.getByLabelText(/sistema elétrico/i), "TRIPHASIC")
        await user.selectOptions(screen.getByLabelText(/classe de faturamento/i), "B2")
        await user.type(screen.getByLabelText(/logradouro/i), "Rua das Flores, 100")
        await user.type(screen.getByLabelText(/cidade/i), "Belo Horizonte")
        await user.selectOptions(screen.getByLabelText(/uf/i), "MG")
        await user.type(screen.getByLabelText(/cep/i), "30000000")

        await user.click(screen.getByRole("button", { name: /salvar/i }))

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))

        expect(onSubmit).toHaveBeenCalledWith(
            {
                name: "Casa Principal",
                distributorId: "dist-1",
                electricalSystem: "TRIPHASIC",
                tariffGroup: "GROUP_B",
                contractingEnvironment: "ACR",
                billingClass: "B2",
                groupBModality: "CONVENTIONAL",
                receivesBillingDiscount: false,
                publicLightingFeeBrl: undefined,
                address: "Rua das Flores, 100",
                city: "Belo Horizonte",
                state: "MG",
                zipCode: "30000-000",
            },
            expect.anything(), // RHF passa o SyntheticEvent como 2º arg
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Cancelar
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Grupo A
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyForm — Grupo A", () => {
    // Regressão: uma propriedade Grupo A com groupBModality/receivesBillingDiscount
    // não-nulos (dado legado hipotético, ex.: backfill de migração) não pode
    // travar o submit — o form ignora esses dois campos por tariffGroup, não
    // por eles estarem nulos.
    it("edita uma propriedade Grupo A mesmo quando groupBModality/receivesBillingDiscount chegam com valor não-nulo", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        const legacyGroupAProperty: Property = {
            ...mockProperty,
            tariffGroup: "GROUP_A",
            billingClass: null,
            groupBModality: "CONVENTIONAL",
            receivesBillingDiscount: false,
            tariffSubgroup: "A4",
            tariffModality: "GREEN",
            contractedDemandKw: 200,
        }
        renderForm({ initialData: legacyGroupAProperty, onSubmit })

        await user.click(screen.getByRole("button", { name: /salvar/i }))

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({
                tariffGroup: "GROUP_A",
                groupBModality: undefined,
                receivesBillingDiscount: undefined,
            }),
            expect.anything(),
        )
    })

    it("mostra os campos do Grupo A e esconde a classe de faturamento ao trocar o grupo tarifário", async () => {
        const user = userEvent.setup()
        renderForm()

        expect(screen.getByLabelText(/classe de faturamento/i)).toBeInTheDocument()
        expect(screen.queryByLabelText(/^subgrupo/i)).not.toBeInTheDocument()

        await user.selectOptions(screen.getByLabelText(/grupo tarifário/i), "GROUP_A")

        expect(screen.queryByLabelText(/classe de faturamento/i)).not.toBeInTheDocument()
        expect(screen.getByLabelText(/^subgrupo/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/modalidade tarifária/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/demanda contratada/i)).toBeInTheDocument()
    })

    it("envia tariffGroup/tariffSubgroup/tariffModality/contractedDemandKw e omite billingClass", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/nome/i), "Metalúrgica")
        await user.selectOptions(screen.getByLabelText(/distribuidora vinculada/i), "dist-1")
        await user.selectOptions(screen.getByLabelText(/grupo tarifário/i), "GROUP_A")
        await user.selectOptions(screen.getByLabelText(/^subgrupo/i), "A4")
        await user.type(screen.getByLabelText(/demanda contratada/i), "200")

        await user.click(screen.getByRole("button", { name: /salvar/i }))

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))

        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({
                tariffGroup: "GROUP_A",
                tariffSubgroup: "A4",
                tariffModality: "GREEN",
                contractedDemandKw: 200,
                billingClass: undefined,
                groupBModality: undefined,
                receivesBillingDiscount: undefined,
            }),
            expect.anything(),
        )
    })

    it("exige subgrupo e demanda contratada ao submeter uma propriedade Grupo A incompleta", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/nome/i), "Metalúrgica")
        await user.selectOptions(screen.getByLabelText(/distribuidora vinculada/i), "dist-1")
        await user.selectOptions(screen.getByLabelText(/grupo tarifário/i), "GROUP_A")

        await user.click(screen.getByRole("button", { name: /salvar/i }))

        expect(
            await screen.findByText(/subgrupo é obrigatório para propriedades do grupo a/i),
        ).toBeInTheDocument()
        expect(
            screen.getByText(/demanda contratada é obrigatória para propriedades do grupo a/i),
        ).toBeInTheDocument()
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it("mostra as demandas de ponta e fora de ponta e esconde o campo único ao selecionar Azul", async () => {
        const user = userEvent.setup()
        renderForm()

        await user.selectOptions(screen.getByLabelText(/grupo tarifário/i), "GROUP_A")
        expect(screen.getByLabelText(/^demanda contratada · kw$/i)).toBeInTheDocument()

        await user.selectOptions(screen.getByLabelText(/modalidade tarifária/i), "BLUE")

        expect(screen.queryByLabelText(/^demanda contratada · kw$/i)).not.toBeInTheDocument()
        expect(screen.getByLabelText(/demanda contratada · ponta/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/demanda contratada · fora ponta/i)).toBeInTheDocument()
    })

    it("envia as duas demandas contratadas e omite a demanda única para Azul", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/nome/i), "Frigorífico")
        await user.selectOptions(screen.getByLabelText(/distribuidora vinculada/i), "dist-1")
        await user.selectOptions(screen.getByLabelText(/grupo tarifário/i), "GROUP_A")
        await user.selectOptions(screen.getByLabelText(/^subgrupo/i), "A4")
        await user.selectOptions(screen.getByLabelText(/modalidade tarifária/i), "BLUE")
        await user.type(screen.getByLabelText(/demanda contratada · ponta/i), "150")
        await user.type(screen.getByLabelText(/demanda contratada · fora ponta/i), "400")

        await user.click(screen.getByRole("button", { name: /salvar/i }))

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))

        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({
                tariffModality: "BLUE",
                contractedDemandKw: undefined,
                contractedDemandPeakKw: 150,
                contractedDemandOffPeakKw: 400,
            }),
            expect.anything(),
        )
    })

    it("exige as duas demandas contratadas ao submeter Azul sem preenchê-las", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/nome/i), "Frigorífico")
        await user.selectOptions(screen.getByLabelText(/distribuidora vinculada/i), "dist-1")
        await user.selectOptions(screen.getByLabelText(/grupo tarifário/i), "GROUP_A")
        await user.selectOptions(screen.getByLabelText(/^subgrupo/i), "A4")
        await user.selectOptions(screen.getByLabelText(/modalidade tarifária/i), "BLUE")

        await user.click(screen.getByRole("button", { name: /salvar/i }))

        expect(
            await screen.findByText(/demanda contratada na ponta é obrigatória/i),
        ).toBeInTheDocument()
        expect(
            screen.getByText(/demanda contratada fora de ponta é obrigatória/i),
        ).toBeInTheDocument()
        expect(onSubmit).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Tarifa Branca (Grupo B)
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyForm — Tarifa Branca", () => {
    it("modalidade Branca fica desabilitada para B2 (não elegível)", async () => {
        const user = userEvent.setup()
        renderForm()

        await user.selectOptions(screen.getByLabelText(/classe de faturamento/i), "B2")

        expect(screen.getByLabelText(/^modalidade$/i)).toBeDisabled()
        expect(screen.getByRole("option", { name: "Tarifa Branca" })).toBeDisabled()
    })

    it("modalidade Branca fica habilitada para B1 e B3", async () => {
        const user = userEvent.setup()
        renderForm()

        expect(screen.getByLabelText(/^modalidade$/i)).toBeEnabled() // default B1

        await user.selectOptions(screen.getByLabelText(/classe de faturamento/i), "B3")

        expect(screen.getByLabelText(/^modalidade$/i)).toBeEnabled()
    })

    it("envia groupBModality WHITE quando selecionado para uma classe elegível", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/nome/i), "Casa")
        await user.selectOptions(screen.getByLabelText(/distribuidora vinculada/i), "dist-1")
        await user.selectOptions(screen.getByLabelText(/^modalidade$/i), "WHITE")

        await user.click(screen.getByRole("button", { name: /salvar/i }))

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))

        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({ billingClass: "B1", groupBModality: "WHITE" }),
            expect.anything(),
        )
    })

    it("trocar para uma classe não elegível (B2) volta a modalidade para Convencional", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/nome/i), "Casa")
        await user.selectOptions(screen.getByLabelText(/distribuidora vinculada/i), "dist-1")
        await user.selectOptions(screen.getByLabelText(/^modalidade$/i), "WHITE")
        await user.selectOptions(screen.getByLabelText(/classe de faturamento/i), "B2")

        await user.click(screen.getByRole("button", { name: /salvar/i }))

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))

        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({ billingClass: "B2", groupBModality: "CONVENTIONAL" }),
            expect.anything(),
        )
    })

    it("marcar o desconto de faturamento volta a modalidade para Convencional", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/nome/i), "Casa")
        await user.selectOptions(screen.getByLabelText(/distribuidora vinculada/i), "dist-1")
        await user.selectOptions(screen.getByLabelText(/^modalidade$/i), "WHITE")
        await user.click(screen.getByLabelText(/recebe baixa renda/i))

        await user.click(screen.getByRole("button", { name: /salvar/i }))

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))

        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({
                groupBModality: "CONVENTIONAL",
                receivesBillingDiscount: true,
            }),
            expect.anything(),
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Mercado Livre (ACL)
// ─────────────────────────────────────────────────────────────────────────────

const mockAclContract: AclContract = {
    id: "contract-1",
    userId: "user-1",
    propertyId: "prop-1",
    retailerName: "Comerc Energia",
    submarket: "SOUTHEAST_CENTER_WEST",
    energySource: "CONVENTIONAL",
    energyPricePerMwh: 280,
    contractedVolumeMwh: 120,
    validFrom: "2026-01-01",
    validTo: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

describe("PropertyForm — Mercado Livre (ACL)", () => {
    it("só mostra o ambiente de contratação e o contrato ACL no Grupo A", async () => {
        const user = userEvent.setup()
        renderForm()

        expect(screen.queryByLabelText(/ambiente de contratação/i)).not.toBeInTheDocument()

        await user.selectOptions(screen.getByLabelText(/grupo tarifário/i), "GROUP_A")
        expect(screen.getByLabelText(/ambiente de contratação/i)).toBeInTheDocument()
        expect(screen.queryByLabelText(/comercializadora/i)).not.toBeInTheDocument()

        await user.selectOptions(screen.getByLabelText(/ambiente de contratação/i), "ACL")
        expect(screen.getByLabelText(/comercializadora/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/^submercado/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/preço da energia/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/volume contratado/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/fonte contratada/i)).toBeInTheDocument()
    })

    it("esconde o ambiente de contratação e o contrato ACL ao voltar para o Grupo B", async () => {
        const user = userEvent.setup()
        renderForm()

        await user.selectOptions(screen.getByLabelText(/grupo tarifário/i), "GROUP_A")
        await user.selectOptions(screen.getByLabelText(/ambiente de contratação/i), "ACL")
        expect(screen.getByLabelText(/comercializadora/i)).toBeInTheDocument()

        await user.selectOptions(screen.getByLabelText(/grupo tarifário/i), "GROUP_B")

        expect(screen.queryByLabelText(/ambiente de contratação/i)).not.toBeInTheDocument()
        expect(screen.queryByLabelText(/comercializadora/i)).not.toBeInTheDocument()
    })

    it("exige os 5 campos do contrato ao submeter em ACL sem preenchê-los", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/nome/i), "Indústria")
        await user.selectOptions(screen.getByLabelText(/distribuidora vinculada/i), "dist-1")
        await user.selectOptions(screen.getByLabelText(/grupo tarifário/i), "GROUP_A")
        await user.selectOptions(screen.getByLabelText(/^subgrupo/i), "A4")
        await user.type(screen.getByLabelText(/demanda contratada/i), "200")
        await user.selectOptions(screen.getByLabelText(/ambiente de contratação/i), "ACL")

        await user.click(screen.getByRole("button", { name: /salvar/i }))

        expect(
            await screen.findByText(/comercializadora é obrigatória no acl/i),
        ).toBeInTheDocument()
        expect(screen.getByText(/submercado é obrigatório no acl/i)).toBeInTheDocument()
        expect(screen.getByText(/fonte contratada é obrigatória no acl/i)).toBeInTheDocument()
        expect(screen.getByText(/preço da energia é obrigatório no acl/i)).toBeInTheDocument()
        expect(screen.getByText(/volume contratado é obrigatório no acl/i)).toBeInTheDocument()
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it("envia os campos do contrato ACL preenchidos", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        renderForm({ onSubmit })

        await user.type(screen.getByLabelText(/nome/i), "Indústria")
        await user.selectOptions(screen.getByLabelText(/distribuidora vinculada/i), "dist-1")
        await user.selectOptions(screen.getByLabelText(/grupo tarifário/i), "GROUP_A")
        await user.selectOptions(screen.getByLabelText(/^subgrupo/i), "A4")
        await user.type(screen.getByLabelText(/demanda contratada/i), "200")
        await user.selectOptions(screen.getByLabelText(/ambiente de contratação/i), "ACL")
        await user.type(screen.getByLabelText(/comercializadora/i), "Comerc Energia")
        await user.selectOptions(screen.getByLabelText(/^submercado/i), "SOUTHEAST_CENTER_WEST")
        await user.type(screen.getByLabelText(/preço da energia/i), "280")
        await user.type(screen.getByLabelText(/volume contratado/i), "120")
        await user.selectOptions(screen.getByLabelText(/fonte contratada/i), "CONVENTIONAL")

        await user.click(screen.getByRole("button", { name: /salvar/i }))

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))

        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({
                contractingEnvironment: "ACL",
                aclRetailerName: "Comerc Energia",
                aclSubmarket: "SOUTHEAST_CENTER_WEST",
                aclEnergyPricePerMwh: 280,
                aclContractedVolumeMwh: 120,
                aclEnergySource: "CONVENTIONAL",
            }),
            expect.anything(),
        )
    })

    it("preenche o contrato ACL a partir de initialAclContract em edição", () => {
        const aclProperty: Property = {
            ...mockProperty,
            tariffGroup: "GROUP_A",
            tariffSubgroup: "A4",
            tariffModality: "GREEN",
            contractedDemandKw: 200,
            billingClass: null,
            contractingEnvironment: "ACL",
        }
        renderForm({ initialData: aclProperty, initialAclContract: mockAclContract })

        expect(screen.getByLabelText(/ambiente de contratação/i)).toHaveValue("ACL")
        expect(screen.getByLabelText(/comercializadora/i)).toHaveValue("Comerc Energia")
        expect(screen.getByLabelText(/^submercado/i)).toHaveValue("SOUTHEAST_CENTER_WEST")
        expect(screen.getByLabelText(/preço da energia/i)).toHaveValue(280)
        expect(screen.getByLabelText(/volume contratado/i)).toHaveValue(120)
        expect(screen.getByLabelText(/fonte contratada/i)).toHaveValue("CONVENTIONAL")
    })
})

describe("PropertyForm — cancelar", () => {
    it("chama onCancel ao clicar em Cancelar", async () => {
        const user = userEvent.setup()
        const onCancel = vi.fn()
        renderForm({ onCancel })

        await user.click(screen.getByRole("button", { name: /cancelar/i }))

        expect(onCancel).toHaveBeenCalledTimes(1)
    })
})
