import { z } from "zod"

// Validação de e-mail — mesmo regex de register.schema.ts, por consistência
// de mensagem/comportamento entre os dois formulários que tocam e-mail.
const emailField = z
    .string()
    .min(1, "E-mail é obrigatório")
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "E-mail inválido")

// `currentPassword` só é exigido quando o e-mail muda de fato (issue #178)
// — comparado contra `originalEmail`, capturado no momento em que o form é
// montado (`user.email`). Não dá para expressar isso num objeto Zod
// estático porque o schema não conhece o valor original; por isso os dois
// schemas abaixo viram fábricas em vez de constantes.

/**
 * Edição de perfil — PF: nome/sobrenome/e-mail/senha atual (condicional).
 * CPF nunca aparece aqui: o campo é sempre `disabled` no form (a UI nem
 * tenta enviá-lo), espelhando updateUserSchema do backend, que já não o
 * aceita.
 */
export const makeIndividualProfileSchema = (originalEmail: string) =>
    z
        .object({
            firstName: z.string().min(1, "Nome é obrigatório"),
            lastName: z.string().min(1, "Sobrenome é obrigatório"),
            email: emailField,
            currentPassword: z.string().optional(),
        })
        .superRefine((data, ctx) => {
            if (data.email !== originalEmail && !data.currentPassword?.trim()) {
                ctx.addIssue({
                    code: "custom",
                    message: "Senha atual é obrigatória para alterar o e-mail",
                    path: ["currentPassword"],
                })
            }
        })

/**
 * Edição de perfil — PJ: razão social/nome fantasia/e-mail/senha atual
 * (condicional). CNPJ nunca aparece aqui pelo mesmo motivo do CPF na PF.
 */
export const makeCompanyProfileSchema = (originalEmail: string) =>
    z
        .object({
            companyName: z.string().min(1, "Razão social é obrigatória"),
            tradeName: z.string().optional(),
            email: emailField,
            currentPassword: z.string().optional(),
        })
        .superRefine((data, ctx) => {
            if (data.email !== originalEmail && !data.currentPassword?.trim()) {
                ctx.addIssue({
                    code: "custom",
                    message: "Senha atual é obrigatória para alterar o e-mail",
                    path: ["currentPassword"],
                })
            }
        })

export type IndividualProfileFormData = z.infer<ReturnType<typeof makeIndividualProfileSchema>>
export type CompanyProfileFormData = z.infer<ReturnType<typeof makeCompanyProfileSchema>>
