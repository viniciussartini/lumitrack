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
    mfaEnabled: false,
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

        const result = await authService.login({
            email: "test@example.com",
            password: "Senha@123",
        })

        expect(api.get).toHaveBeenCalledWith("/auth/me")
        expect(result).toEqual({ user: mockUser })
    })

    it("propaga o erro quando o backend retorna 401 (sem chamar /auth/me)", async () => {
        vi.mocked(api.post).mockRejectedValueOnce(new Error("Credenciais inválidas"))

        await expect(
            authService.login({
                email: "x@x.com",
                password: "errada",
            }),
        ).rejects.toThrow("Credenciais inválidas")

        expect(api.get).not.toHaveBeenCalled()
    })

    it("retorna mfaRequired + mfaToken sem chamar /auth/me quando a conta tem MFA habilitado", async () => {
        vi.mocked(api.post).mockResolvedValueOnce({
            data: {
                status: "success",
                data: { mfaRequired: true, mfaToken: "mfa-token-123" },
            },
        })

        const result = await authService.login({
            email: "test@example.com",
            password: "Senha@123",
        })

        expect(result).toEqual({ mfaRequired: true, mfaToken: "mfa-token-123" })
        expect(api.get).not.toHaveBeenCalled()
    })
})

// Issue #179: sem e-mail/senha no cliente — só o profile e o channel fixo.
describe("authService.demoLogin", () => {
    it("envia só profile + channel='WEB', sem nenhuma credencial", async () => {
        vi.mocked(api.post).mockResolvedValueOnce({
            data: { status: "success", data: {} },
        })
        vi.mocked(api.get).mockResolvedValueOnce({
            data: { status: "success", data: mockUser },
        })

        await authService.demoLogin("residential")

        expect(api.post).toHaveBeenCalledWith("/auth/demo-login", {
            profile: "residential",
            channel: "WEB",
        })
    })

    it("busca o usuário completo via /auth/me após o login demo e o retorna", async () => {
        vi.mocked(api.post).mockResolvedValueOnce({
            data: { status: "success", data: {} },
        })
        vi.mocked(api.get).mockResolvedValueOnce({
            data: { status: "success", data: mockUser },
        })

        const result = await authService.demoLogin("commercial")

        expect(api.get).toHaveBeenCalledWith("/auth/me")
        expect(result).toEqual({ user: mockUser })
    })

    it("propaga o erro quando o backend recusa (ex.: DEMO_LOGIN_ENABLED desligado)", async () => {
        vi.mocked(api.post).mockRejectedValueOnce(new Error("Acesso negado"))

        await expect(authService.demoLogin("residential")).rejects.toThrow("Acesso negado")
        expect(api.get).not.toHaveBeenCalled()
    })

    it("retorna mfaRequired + mfaToken sem chamar /auth/me quando a conta demo tem MFA (defesa em profundidade)", async () => {
        vi.mocked(api.post).mockResolvedValueOnce({
            data: {
                status: "success",
                data: { mfaRequired: true, mfaToken: "mfa-token-demo" },
            },
        })

        const result = await authService.demoLogin("residential")

        expect(result).toEqual({ mfaRequired: true, mfaToken: "mfa-token-demo" })
        expect(api.get).not.toHaveBeenCalled()
    })
})

describe("authService.verifyMfaLogin", () => {
    it("envia mfaToken + code e busca o usuário completo via /auth/me", async () => {
        vi.mocked(api.post).mockResolvedValueOnce({
            data: { status: "success", data: {} },
        })
        vi.mocked(api.get).mockResolvedValueOnce({
            data: { status: "success", data: mockUser },
        })

        const user = await authService.verifyMfaLogin({
            mfaToken: "mfa-token-123",
            code: "123456",
        })

        expect(api.post).toHaveBeenCalledWith("/auth/login/mfa", {
            mfaToken: "mfa-token-123",
            code: "123456",
        })
        expect(api.get).toHaveBeenCalledWith("/auth/me")
        expect(user).toEqual(mockUser)
    })

    it("propaga o erro quando o código é inválido (sem chamar /auth/me)", async () => {
        vi.mocked(api.post).mockRejectedValueOnce(new Error("Código inválido"))

        await expect(
            authService.verifyMfaLogin({ mfaToken: "mfa-token-123", code: "000000" }),
        ).rejects.toThrow("Código inválido")

        expect(api.get).not.toHaveBeenCalled()
    })
})

describe("authService.mfaSetup", () => {
    it("busca o secret e o QR code em POST /auth/mfa/setup", async () => {
        vi.mocked(api.post).mockResolvedValueOnce({
            data: {
                status: "success",
                data: { secret: "ABC123", qrCodeDataUrl: "data:image/png;base64,xyz" },
            },
        })

        const result = await authService.mfaSetup()

        expect(api.post).toHaveBeenCalledWith("/auth/mfa/setup")
        expect(result).toEqual({ secret: "ABC123", qrCodeDataUrl: "data:image/png;base64,xyz" })
    })
})

describe("authService.mfaVerifySetup", () => {
    it("envia secret + code e retorna os backup codes", async () => {
        const backupCodes = Array.from({ length: 10 }, (_, i) => `CODE${i}-CODE${i}`)
        vi.mocked(api.post).mockResolvedValueOnce({
            data: { status: "success", data: { backupCodes } },
        })

        const result = await authService.mfaVerifySetup({
            secret: "ABC123",
            code: "123456",
        })

        expect(api.post).toHaveBeenCalledWith("/auth/mfa/verify-setup", {
            secret: "ABC123",
            code: "123456",
        })
        expect(result.backupCodes).toEqual(backupCodes)
    })
})

describe("authService.mfaDisable", () => {
    it("envia senha + code para POST /auth/mfa/disable", async () => {
        vi.mocked(api.post).mockResolvedValueOnce({ data: { status: "success" } })

        await authService.mfaDisable({ password: "Senha@123", code: "123456" })

        expect(api.post).toHaveBeenCalledWith("/auth/mfa/disable", {
            password: "Senha@123",
            code: "123456",
        })
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
    acceptedTerms: true,
}

const mockCreatedUser: User = {
    id: "user-new",
    email: "joao@example.com",
    userType: "INDIVIDUAL",
    mfaEnabled: false,
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

        expect(api.post).not.toHaveBeenCalledWith("/auth/login", expect.anything())
        expect(api.get).not.toHaveBeenCalled()
    })

    it("propaga erro 409 (email duplicado)", async () => {
        vi.mocked(api.post).mockRejectedValueOnce(new Error("E-mail já cadastrado"))

        await expect(authService.register(validIndividualInput)).rejects.toThrow(
            "E-mail já cadastrado",
        )
    })

    it("propaga erro 422 (validação)", async () => {
        vi.mocked(api.post).mockRejectedValueOnce(new Error("Dados inválidos"))

        await expect(authService.register(validIndividualInput)).rejects.toThrow("Dados inválidos")
    })
})

// Issue #178: efetiva a troca de e-mail pedida em Perfil.
describe("authService.confirmEmailChange", () => {
    it("faz POST em /auth/confirm-email-change com o token", async () => {
        vi.mocked(api.post).mockResolvedValueOnce({ data: { status: "success" } })

        await authService.confirmEmailChange("token-de-confirmacao")

        expect(api.post).toHaveBeenCalledWith("/auth/confirm-email-change", {
            token: "token-de-confirmacao",
        })
    })

    it("propaga erro quando o token é inválido/expirado/já usado", async () => {
        vi.mocked(api.post).mockRejectedValueOnce(
            new Error("Token de confirmação inválido ou expirado"),
        )

        await expect(authService.confirmEmailChange("token-ruim")).rejects.toThrow(
            "Token de confirmação inválido ou expirado",
        )
    })
})
