import { describe, it, expect, beforeEach, vi } from "vitest"
import { authService } from "@/services/auth.service"
import type { IndividualRegisterInput, User } from "@/types/auth.types"

// Mock do módulo api — substitui a instância real por um espião
vi.mock("@/services/api", () => ({
    api: {
        post: vi.fn(),
        get: vi.fn(),
    },
    extractErrorMessage: vi.fn(),
}))

import { api } from "@/services/api"

const mockUser: User = {
    id: "user-123",
    email: "test@example.com",
    userType: "INDIVIDUAL",
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("authService.login", () => {
    it("envia credenciais com channel='WEB' (cookies httpOnly setados pelo backend)", async () => {
        vi.mocked(api.post).mockResolvedValueOnce({
            data: { status: "success", data: {} },
        })
        vi.mocked(api.get).mockResolvedValueOnce({
            data: { status: "success", data: mockUser },
        })

        await authService.login({
            email: "test@example.com",
            password: "Senha@123",
        })

        expect(api.post).toHaveBeenCalledWith("/auth/login", {
            email: "test@example.com",
            password: "Senha@123",
            channel: "WEB",
        })
    })

    it("busca o usuário completo via /auth/me após o login e o retorna", async () => {
        vi.mocked(api.post).mockResolvedValueOnce({
            data: { status: "success", data: {} },
        })
        vi.mocked(api.get).mockResolvedValueOnce({
            data: { status: "success", data: mockUser },
        })

        const user = await authService.login({
            email: "test@example.com",
            password: "Senha@123",
        })

        expect(api.get).toHaveBeenCalledWith("/auth/me")
        expect(user).toEqual(mockUser)
    })

    it("propaga o erro quando o backend retorna 401 (sem chamar /auth/me)", async () => {
        vi.mocked(api.post).mockRejectedValueOnce(
            new Error("Credenciais inválidas"),
        )

        await expect(
            authService.login({
                email: "x@x.com",
                password: "errada",
            }),
        ).rejects.toThrow("Credenciais inválidas")

        expect(api.get).not.toHaveBeenCalled()
    })
})

describe("authService.logout", () => {
    it("chama o endpoint de logout", async () => {
        vi.mocked(api.post).mockResolvedValueOnce({ data: {} })

        await authService.logout()

        expect(api.post).toHaveBeenCalledWith("/auth/logout")
    })

    it("não propaga erro se o backend falhar (rede caiu)", async () => {
        vi.mocked(api.post).mockRejectedValueOnce(new Error("Network error"))

        await expect(authService.logout()).resolves.toBeUndefined()
    })
})

describe("authService.getCurrentUser", () => {
    it("retorna o usuário quando há sessão ativa", async () => {
        vi.mocked(api.get).mockResolvedValueOnce({
            data: { status: "success", data: mockUser },
        })

        const user = await authService.getCurrentUser()

        expect(api.get).toHaveBeenCalledWith("/auth/me")
        expect(user).toEqual(mockUser)
    })

    it("retorna null quando não há sessão (401)", async () => {
        vi.mocked(api.get).mockRejectedValueOnce(new Error("401"))

        const user = await authService.getCurrentUser()

        expect(user).toBeNull()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Register
// ─────────────────────────────────────────────────────────────────────────────

const validIndividualInput: IndividualRegisterInput = {
    userType: "INDIVIDUAL",
    email: "joao@example.com",
    password: "Senha@123",
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
}

const mockCreatedUser: User = {
    id: "user-new",
    email: "joao@example.com",
    userType: "INDIVIDUAL",
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

describe("authService.register", () => {
    it("envia o input para POST /users e retorna o User criado", async () => {
        vi.mocked(api.post).mockResolvedValueOnce({
            data: { status: "success", data: mockCreatedUser },
        })

        const user = await authService.register(validIndividualInput)

        expect(api.post).toHaveBeenCalledWith("/users", validIndividualInput)
        expect(user.id).toBe("user-new")
        expect(user.email).toBe("joao@example.com")
    })

    it("NÃO faz login (não chama /auth/login nem /auth/me)", async () => {
        vi.mocked(api.post).mockResolvedValueOnce({
            data: { status: "success", data: mockCreatedUser },
        })

        await authService.register(validIndividualInput)

        expect(api.post).not.toHaveBeenCalledWith(
            "/auth/login",
            expect.anything(),
        )
        expect(api.get).not.toHaveBeenCalled()
    })

    it("propaga erro 409 (email duplicado)", async () => {
        vi.mocked(api.post).mockRejectedValueOnce(
            new Error("E-mail já cadastrado"),
        )

        await expect(authService.register(validIndividualInput)).rejects.toThrow(
            "E-mail já cadastrado",
        )
    })

    it("propaga erro 422 (validação)", async () => {
        vi.mocked(api.post).mockRejectedValueOnce(
            new Error("Dados inválidos"),
        )

        await expect(authService.register(validIndividualInput)).rejects.toThrow(
            "Dados inválidos",
        )
    })
})
