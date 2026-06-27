export type UserType = "INDIVIDUAL" | "COMPANY"
export type TokenChannel = "WEB" | "MOBILE"

// Usuário completo (vem de GET /api/auth/me ou GET /api/users/:id)
export interface User {
    id: string
    email: string
    userType: UserType
    createdAt: string
    updatedAt: string

    // Campos PF
    firstName?: string | null
    lastName?: string | null
    cpf?: string | null

    // Campos PJ
    companyName?: string | null
    cnpj?: string | null
    tradeName?: string | null
}

// Input do form de login
export interface LoginInput {
    email: string
    password: string
}

// Resposta crua do backend para o canal WEB — o JWT viaja só no cookie
// httpOnly, nunca no body (ver backend/modules/auth/auth.controller.ts).
export type LoginResponse = Record<string, never>

// Registro
interface BaseRegisterInput {
    email: string
    password: string
    // Aceite explícito da Política de Privacidade e dos Termos de Uso (LGPD Art. 7º/8º)
    acceptedTerms: true
}

export interface IndividualRegisterInput extends BaseRegisterInput {
    userType: "INDIVIDUAL"
    firstName: string
    lastName: string
    cpf: string
}

export interface CompanyRegisterInput extends BaseRegisterInput {
    userType: "COMPANY"
    companyName: string
    cnpj: string
    tradeName?: string
}

export type RegisterInput = IndividualRegisterInput | CompanyRegisterInput
