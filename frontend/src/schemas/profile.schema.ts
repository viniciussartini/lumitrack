import { z } from "zod"

// Validação de e-mail — mesmo regex de register.schema.ts, por consistência
// de mensagem/comportamento entre os dois formulários que tocam e-mail.
const emailField = z
    .string()
    .min(1, "E-mail é obrigatório")
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "E-mail inválido")

/**
 * Edição de perfil — PF: nome/sobrenome/e-mail. CPF nunca aparece aqui:
 * o campo é sempre `disabled` no form (a UI nem tenta enviá-lo), espelhando
 * updateUserSchema do backend, que já não o aceita.
 */
export const individualProfileSchema = z.object({
    firstName: z.string().min(1, "Nome é obrigatório"),
    lastName: z.string().min(1, "Sobrenome é obrigatório"),
    email: emailField,
})

/**
 * Edição de perfil — PJ: razão social/nome fantasia/e-mail. CNPJ nunca
 * aparece aqui pelo mesmo motivo do CPF na PF.
 */
export const companyProfileSchema = z.object({
    companyName: z.string().min(1, "Razão social é obrigatória"),
    tradeName: z.string().optional(),
    email: emailField,
})

export type IndividualProfileFormData = z.infer<typeof individualProfileSchema>
export type CompanyProfileFormData = z.infer<typeof companyProfileSchema>
