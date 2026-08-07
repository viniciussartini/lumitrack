export type UserType = "INDIVIDUAL" | "COMPANY"
export type TokenChannel = "WEB" | "MOBILE"

// Usuário completo (vem de GET /api/auth/me ou GET /api/users/:id)
export interface User {
    id: string
    email: string
    userType: UserType
    createdAt: string
    updatedAt: string
    // MFA (TOTP) — ver Seção "MFA" abaixo. Nunca inclui o secret, só a flag.
    mfaEnabled: boolean

    // Campos PF
    firstName?: string | null
    lastName?: string | null
    cpf?: string | null

    // Campos PJ
    companyName?: string | null
    cnpj?: string | null
    tradeName?: string | null
}

// Input de PUT /api/users/:id — espelha updateUserSchema do backend.
// Todos os campos opcionais; nunca inclui cpf/cnpj (o backend já não os
// aceita na atualização — imutáveis após o cadastro).
export interface UpdateUserInput {
    email?: string
    firstName?: string
    lastName?: string
    companyName?: string
    tradeName?: string
}

// Input do form de login
export interface LoginInput {
    email: string
    password: string
}

// Resposta crua de POST /auth/login. Canal WEB: o JWT viaja só no cookie
// httpOnly, nunca no body. Quando a conta tem MFA habilitado, o backend não
// emite sessão ainda — retorna um mfaToken de curta duração (5min) que deve
// ser trocado em POST /auth/login/mfa.
export interface LoginResponse {
    mfaRequired?: boolean
    mfaToken?: string
}

// Resultado do login já processado pelo authService/AuthContext — evita que
// o restante do app precise checar `mfaRequired` + presença de `mfaToken`
// como campos soltos.
export type LoginResult =
    { mfaRequired: true; mfaToken: string } | { mfaRequired?: false; user: User }

// ─── MFA (TOTP) ─────────────────────────────────────────────────────────────

export interface MfaSetupResponse {
    /** Secret base32 — reenviado em MfaVerifySetupInput para confirmar o setup. */
    secret: string
    /** PNG em base64 pronto para <img src>. */
    qrCodeDataUrl: string
}

export interface MfaVerifySetupInput {
    secret: string
    code: string
}

export interface MfaVerifySetupResponse {
    /** 10 códigos de backup em texto plano — exibidos apenas nesta resposta. */
    backupCodes: string[]
}

export interface MfaDisableInput {
    password: string
    code: string
}

export interface MfaLoginVerifyInput {
    mfaToken: string
    code: string
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
