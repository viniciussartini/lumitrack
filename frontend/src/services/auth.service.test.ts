import { describe, it, expect, beforeEach, vi } from "vitest"
import { authService } from "@/services/auth.service"
import { storage, STORAGE_KEYS } from "@/lib/storage"
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

const VALID_TOKEN_WEB =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
    "eyJpZCI6InVzZXItMTIzIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwidXNlclR5cGUiOiJJTkRJVklEVUFMIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjk5OTk5OTk5OTl9." +
    "fake-signature"

const EXPIRED_TOKEN =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
    "eyJpZCI6InVzZXItMTIzIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwidXNlclR5cGUiOiJJTkRJVklEVUFMIiwiaWF0IjoxNTAwMDAwMDAwLCJleHAiOjE1MDAwMDAwMDB9." +
    "fake-signature"

beforeEach(() => {
    vi.clearAllMocks()
    storage.remove(STORAGE_KEYS.TOKEN)
})

describe("authService.login", () => {
    it("envia credenciais com channel='WEB' e persiste o token", async () => {
        vi.mocked(api.post).mockResolvedValueOnce({
            data: { status: "success", data: { token: VALID_TOKEN_WEB } },
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
        expect(storage.get(STORAGE_KEYS.TOKEN)).toBe(VALID_TOKEN_WEB)
    })

    it("retorna o payload decodificado do JWT", async () => {
        vi.mocked(api.post).mockResolvedValueOnce({
            data: { status: "success", data: { token: VALID_TOKEN_WEB } },
        })

        const payload = await authService.login({
            email: "test@example.com",
            password: "Senha@123",
        })

        expect(payload.id).toBe("user-123")
        expect(payload.email).toBe("test@example.com")
        expect(payload.userType).toBe("INDIVIDUAL")
    })

    it("propaga o erro quando o backend retorna 401", async () => {
        vi.mocked(api.post).mockRejectedValueOnce(
            new Error("Credenciais inválidas"),
        )

        await expect(
            authService.login({
                email: "x@x.com",
                password: "errada",
            }),
        ).rejects.toThrow("Credenciais inválidas")

        expect(storage.get(STORAGE_KEYS.TOKEN)).toBeNull()
    })
})

describe("authService.logout", () => {
    it("chama o endpoint e limpa o storage", async () => {
        storage.set(STORAGE_KEYS.TOKEN, VALID_TOKEN_WEB)
        vi.mocked(api.post).mockResolvedValueOnce({ data: {} })

        await authService.logout()

        expect(api.post).toHaveBeenCalledWith("/auth/logout")
        expect(storage.get(STORAGE_KEYS.TOKEN)).toBeNull()
    })

    it("limpa o storage mesmo se o backend falhar", async () => {
        storage.set(STORAGE_KEYS.TOKEN, VALID_TOKEN_WEB)
        vi.mocked(api.post).mockRejectedValueOnce(new Error("Network error"))

        await authService.logout()

        expect(storage.get(STORAGE_KEYS.TOKEN)).toBeNull()
    })
})

describe("authService.getStoredSession", () => {
    it("retorna null quando não há token", () => {
        expect(authService.getStoredSession()).toBeNull()
    })

    it("retorna o payload decodificado para token válido", () => {
        storage.set(STORAGE_KEYS.TOKEN, VALID_TOKEN_WEB)

        const session = authService.getStoredSession()

        expect(session).not.toBeNull()
        expect(session?.email).toBe("test@example.com")
    })

    it("descarta token expirado e retorna null", () => {
        storage.set(STORAGE_KEYS.TOKEN, EXPIRED_TOKEN)

        const session = authService.getStoredSession()

        expect(session).toBeNull()
        expect(storage.get(STORAGE_KEYS.TOKEN)).toBeNull()
    })

    it("descarta token corrompido e retorna null", () => {
        storage.set(STORAGE_KEYS.TOKEN, "isso-nao-e-um-jwt")

        const session = authService.getStoredSession()

        expect(session).toBeNull()
        expect(storage.get(STORAGE_KEYS.TOKEN)).toBeNull()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Register (novo)
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

    it("NÃO persiste token (não faz login)", async () => {
        vi.mocked(api.post).mockResolvedValueOnce({
            data: { status: "success", data: mockCreatedUser },
        })

        await authService.register(validIndividualInput)

        expect(storage.get(STORAGE_KEYS.TOKEN)).toBeNull()
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