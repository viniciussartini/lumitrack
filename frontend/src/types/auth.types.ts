export type UserType = "INDIVIDUAL" | "COMPANY"
export type TokenChannel = "WEB" | "MOBILE"

// Payload do JWT (vem do backend, decodificado pelo jwt-decode)
export interface JwtPayload {
    id: string
    email: string
    userType: UserType
    iat: number
    exp?: number  // opcional — tokens MOBILE não têm exp
}

// Usuário completo (vem de GET /api/users/:id)
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

// Resposta crua do backend
export interface LoginResponse {
    token: string
}

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
