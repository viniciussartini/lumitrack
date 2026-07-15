import { UserRepository } from "@/modules/user/user.repository.js"
import { UserService } from "@/modules/user/user.service.js"
import { prisma } from "@/shared/database/prisma.js"
import { DEMO_COMMERCIAL_EMAIL, DEMO_PASSWORD, DEMO_RESIDENTIAL_EMAIL } from "./constants.js"

const userService = new UserService(new UserRepository(prisma))

// Dígitos verificadores calculados "de trás para frente", espelhando
// isValidCpf/isValidCnpj (backend/src/modules/user/user.schema.ts) — CPF/CNPJ
// 100% sintéticos, matematicamente válidos mas nunca emitidos de verdade.
function cpfCheckDigit(digits: readonly number[]): number {
    const len = digits.length
    let sum = 0
    for (let i = 0; i < len; i++) sum += digits[i]! * (len + 1 - i)
    const rem = (sum * 10) % 11
    return rem >= 10 ? 0 : rem
}

export function generateCpf(base: readonly number[]): string {
    const d1 = cpfCheckDigit(base)
    const d2 = cpfCheckDigit([...base, d1])
    const digits = [...base, d1, d2]
    return `${digits.slice(0, 3).join("")}.${digits.slice(3, 6).join("")}.${digits.slice(6, 9).join("")}-${digits.slice(9, 11).join("")}`
}

function cnpjCheckDigit(digits: readonly number[]): number {
    const len = digits.length
    let pos = len - 7
    let sum = 0
    for (let i = len; i >= 1; i--) {
        sum += digits[len - i]! * pos
        pos--
        if (pos < 2) pos = 9
    }
    const rem = sum % 11
    return rem < 2 ? 0 : 11 - rem
}

export function generateCnpj(base: readonly number[]): string {
    const d1 = cnpjCheckDigit(base)
    const d2 = cnpjCheckDigit([...base, d1])
    const digits = [...base, d1, d2]
    return `${digits.slice(0, 2).join("")}.${digits.slice(2, 5).join("")}.${digits.slice(5, 8).join("")}/${digits.slice(8, 12).join("")}-${digits.slice(12, 14).join("")}`
}

// Bases arbitrárias (não sequências repetidas, rejeitadas pela validação).
export const DEMO_CPF = generateCpf([5, 2, 4, 1, 3, 7, 8, 9, 6])
export const DEMO_CNPJ = generateCnpj([1, 9, 8, 4, 5, 2, 7, 3, 0, 0, 0, 1])

export async function createDemoResidentialUser() {
    return userService.createUser({
        email: DEMO_RESIDENTIAL_EMAIL,
        password: DEMO_PASSWORD,
        userType: "INDIVIDUAL",
        acceptedTerms: true,
        firstName: "Demo",
        lastName: "Residencial",
        cpf: DEMO_CPF,
    })
}

export async function createDemoCommercialUser() {
    return userService.createUser({
        email: DEMO_COMMERCIAL_EMAIL,
        password: DEMO_PASSWORD,
        userType: "COMPANY",
        acceptedTerms: true,
        companyName: "Padaria Demo LTDA",
        tradeName: "Padaria Demo",
        cnpj: DEMO_CNPJ,
    })
}
