import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useNavigate } from "react-router"
import { Download, Mail, Pencil, ShieldCheck, ShieldOff, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/contexts/AuthContext"
import { useUpdateUser, useDeleteUser } from "@/hooks/queries/useUserMutations"
import { useProperties } from "@/hooks/queries/useProperties"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Tag } from "@/components/ui/Tag"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { FormDialog } from "@/components/ui/FormDialog"
import { extractErrorMessage } from "@/services/api"
import { getDisplayInfo } from "@/lib/userDisplay"
import { maskCpf, maskCnpj } from "@/lib/masks"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/cn"
import { PRIVACY_CONTACT_EMAIL } from "@/config/privacy"
import {
    makeIndividualProfileSchema,
    makeCompanyProfileSchema,
    type IndividualProfileFormData,
    type CompanyProfileFormData,
} from "@/schemas/profile.schema"
import type { UpdateUserInput, User } from "@/types/auth.types"

/**
 * Perfil. LumiTrack Home.dc.html, `isProfile` (linhas 823-914): card de
 * identidade, "Dados pessoais" (leitura/edição), "Conta" (resumo) e
 * "Privacidade & dados" (exportar/excluir).
 *
 * A linha "Política de Privacidade" (link + tag "Aceita") do mesmo card do
 * handoff fica de fora — fora dos critérios de aceite, e o `User`
 * do frontend não tem `consentedAt`/`consentVersion` hoje (mesmo critério
 * "sem inventar dado" já aplicado nos demais KPIs/seções).
 *
 * Cobre PF e PJ (o handoff só mostra o mock PF) — um usuário `COMPANY`
 * também precisa ver/editar o próprio perfil, mesma ramificação por
 * `userType` já usada em RegisterPage/registerSchema.
 *
 * "Editar" abre `FormDialog` — diverge de propósito do
 * protótipo (`LumiTrack Home.dc.html`, `profIsEditing`), que troca o
 * conteúdo do card inline; escolha deliberada de manter o mesmo padrão de
 * modal já usado por Propriedade/Área/Dispositivo/Medidor, em vez de um
 * comportamento de edição só desta tela. `ProfileReadView` fica sempre
 * visível por trás — não alterna mais com o form.
 */
export const ProfilePage = () => {
    const { user, refreshUser } = useAuth()
    const [isEditing, setIsEditing] = useState(false)
    const updateUser = useUpdateUser()

    if (!user) return null

    const isIndividual = user.userType === "INDIVIDUAL"
    const { name, initials } = getDisplayInfo(user)

    const handleSave = async (input: UpdateUserInput): Promise<void> => {
        // A resposta de PUT /api/users/:id continua trazendo o e-mail ANTIGO
        // quando o e-mail muda (só efetiva após confirmação pelo novo
        // endereço) — sem este aviso diferente, o usuário acharia que a
        // troca já valeu, quando na verdade nada mudou ainda.
        const isChangingEmail = Boolean(input.email && input.email !== user.email)

        try {
            await updateUser.mutateAsync({ id: user.id, input })
            await refreshUser()
            if (isChangingEmail) {
                toast.success("Confirme o novo e-mail pelo link enviado ao novo endereço", {
                    description: "Seu e-mail atual continua ativo até a confirmação.",
                })
            } else {
                toast.success("Perfil atualizado")
            }
            setIsEditing(false)
        } catch (error) {
            toast.error("Não foi possível salvar as alterações", {
                description: extractErrorMessage(error),
            })
        }
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="blueprint p-26px">
                <i className="corner tl" />
                <i className="corner tr" />
                <i className="corner bl" />
                <i className="corner br" />

                <div className="gap-18px flex flex-wrap items-center">
                    <span
                        aria-hidden="true"
                        className="border-accent text-accent font-heading text-28 flex h-18 w-18 shrink-0 items-center justify-center border-[1.5px] font-semibold"
                    >
                        {initials}
                    </span>
                    <div className="min-w-0 flex-1">
                        <h1 className="font-heading m-0 text-[clamp(22px,2.4vw,28px)] leading-[1.02] font-semibold uppercase">
                            {name}
                        </h1>
                        <p className="text-muted mt-2 flex items-center gap-2 text-sm">
                            <Mail className="h-15px w-15px" aria-hidden="true" />
                            {user.email}
                        </p>
                    </div>
                    <Tag variant="accent" className="font-semibold">
                        {isIndividual ? "Pessoa Física" : "Pessoa Jurídica"}
                    </Tag>
                </div>
            </div>

            <div className="blueprint p-0">
                <i className="corner tl" />
                <i className="corner tr" />
                <i className="corner bl" />
                <i className="corner br" />

                <div className="border-divider flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
                    <span className="font-heading text-17 font-semibold uppercase">
                        Dados pessoais
                    </span>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        leftIcon={<Pencil className="h-3.5 w-3.5" aria-hidden="true" />}
                        onClick={() => setIsEditing(true)}
                    >
                        Editar
                    </Button>
                </div>

                <ProfileReadView user={user} />
            </div>

            <FormDialog
                open={isEditing}
                onOpenChange={setIsEditing}
                kicker="Perfil"
                title="Editar perfil"
            >
                {isIndividual ? (
                    <IndividualProfileForm
                        user={user}
                        onCancel={() => setIsEditing(false)}
                        onSave={handleSave}
                        isSaving={updateUser.isPending}
                    />
                ) : (
                    <CompanyProfileForm
                        user={user}
                        onCancel={() => setIsEditing(false)}
                        onSave={handleSave}
                        isSaving={updateUser.isPending}
                    />
                )}
            </FormDialog>

            <AccountSummaryCard user={user} />
            <PrivacyDataCard userId={user.id} />
        </div>
    )
}

// Subcomponentes locais

const AccountSummaryCard = ({ user }: { user: User }) => {
    const propertiesQuery = useProperties(1, 1)
    const propertiesCount = propertiesQuery.data?.total

    return (
        <div className="blueprint p-0">
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />

            <div className="border-divider border-b px-5 py-4">
                <span className="font-heading text-17 font-semibold uppercase">Conta</span>
            </div>

            <div className="divide-divider grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <div className="py-18px px-5">
                    <div className="font-heading text-muted text-10 font-semibold tracking-[.07em] uppercase">
                        Membro desde
                    </div>
                    <div className="text-14-5 mt-2" style={{ fontFeatureSettings: "'tnum' 1" }}>
                        {formatDate(user.createdAt)}
                    </div>
                </div>
                <div className="py-18px px-5">
                    <div className="font-heading text-muted text-10 font-semibold tracking-[.07em] uppercase">
                        Propriedades
                    </div>
                    <div className="text-14-5 mt-2" style={{ fontFeatureSettings: "'tnum' 1" }}>
                        {propertiesCount !== undefined
                            ? `${propertiesCount} vinculada${propertiesCount === 1 ? "" : "s"}`
                            : "—"}
                    </div>
                </div>
                <div className="py-18px px-5">
                    <div className="font-heading text-muted text-10 font-semibold tracking-[.07em] uppercase">
                        2FA
                    </div>
                    <div
                        className={cn(
                            "text-14-5 mt-2 flex items-center gap-1.5 font-semibold",
                            user.mfaEnabled ? "text-status-success" : "text-muted",
                        )}
                    >
                        {user.mfaEnabled ? (
                            <ShieldCheck className="h-15px w-15px" aria-hidden="true" />
                        ) : (
                            <ShieldOff className="h-15px w-15px" aria-hidden="true" />
                        )}
                        {user.mfaEnabled ? "Ativado" : "Desativado"}
                    </div>
                </div>
            </div>
        </div>
    )
}

interface DataSubjectRight {
    label: string
    /** `true` quando já dá pra exercer sem sair desta página (ou do fluxo de
     * exportação/exclusão abaixo); os demais passam pelo canal de
     * privacidade. */
    selfService: boolean
    note?: string
}

// LGPD Art. 18 — cada item mapeado ao que a plataforma já oferece hoje. Não
// remover nem "resumir" itens: a lista completa é o próprio critério de
// aceite (nenhum direito pode ficar sem canal de exercício).
const DATA_SUBJECT_RIGHTS: DataSubjectRight[] = [
    { label: "Confirmação da existência de tratamento", selfService: false },
    { label: "Acesso aos dados", selfService: true, note: "nesta página e via exportação" },
    {
        label: "Correção de dados incompletos, inexatos ou desatualizados",
        selfService: true,
        note: "nome, sobrenome, razão social e e-mail — CPF/CNPJ só pelo canal",
    },
    { label: "Anonimização, bloqueio ou eliminação de dados desnecessários", selfService: false },
    {
        label: "Portabilidade a outro fornecedor de serviço",
        selfService: true,
        note: "exportação em JSON",
    },
    {
        label: "Eliminação dos dados tratados com base no consentimento",
        selfService: true,
        note: "excluir conta, abaixo",
    },
    { label: "Informação sobre com quem os dados são compartilhados", selfService: false },
    { label: "Revogação do consentimento", selfService: false },
    {
        label: "Revisão de decisões tomadas unicamente por tratamento automatizado",
        selfService: false,
    },
]

const PrivacyDataCard = ({ userId }: { userId: string }) => {
    const navigate = useNavigate()
    const { logout } = useAuth()
    const deleteUser = useDeleteUser()
    const [isConfirmOpen, setIsConfirmOpen] = useState(false)

    const handleDelete = async (): Promise<void> => {
        try {
            await deleteUser.mutateAsync(userId)
            await logout()
            void navigate("/login", { replace: true })
        } catch (error) {
            toast.error("Não foi possível excluir a conta", {
                description: extractErrorMessage(error),
            })
        }
    }

    return (
        <div className="blueprint p-0">
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />

            <div className="border-divider border-b px-5 py-4">
                <span className="font-heading text-17 font-semibold uppercase">
                    Privacidade & dados
                </span>
            </div>

            <div className="border-divider border-b px-5 pt-3.5 pb-4">
                <div className="text-sm font-semibold">Exercer meus direitos</div>
                <p className="text-muted text-12-5 mt-0.5">
                    Direitos do Art. 18 da LGPD. Os já autoatendidos estão marcados abaixo; os
                    demais são atendidos pelo canal de privacidade em até 30 dias (prazo em dobro do
                    regime de agente de pequeno porte).
                </p>
                <a
                    href={`mailto:${PRIVACY_CONTACT_EMAIL}`}
                    className="text-accent hover:text-accent-700 mt-2.5 inline-flex items-center gap-1.5 text-sm font-medium"
                >
                    <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                    {PRIVACY_CONTACT_EMAIL}
                </a>
                <ul className="mt-3 flex flex-col gap-2">
                    {DATA_SUBJECT_RIGHTS.map((right) => (
                        <li key={right.label} className="flex items-start justify-between gap-3">
                            <span className="text-text/80 text-12-5 leading-[1.4]">
                                {right.label}
                                {right.note && <span className="text-muted"> — {right.note}</span>}
                            </span>
                            <Tag
                                variant={right.selfService ? "accent" : "neutral"}
                                className="text-10 shrink-0"
                            >
                                {right.selfService ? "Autoatendido" : "Pelo canal"}
                            </Tag>
                        </li>
                    ))}
                </ul>
            </div>

            <div className="px-5 pt-1 pb-3">
                <div className="border-divider flex flex-wrap items-center justify-between gap-3 border-b py-3.5">
                    <div className="min-w-0">
                        <div className="text-sm font-semibold">Exportar meus dados</div>
                        <div className="text-muted text-12-5 mt-0.5">
                            Baixe uma cópia dos seus dados pessoais (LGPD Art. 18).
                        </div>
                    </div>
                    <Button variant="secondary" size="sm" asChild>
                        <a href="/api/users/me/data-export?format=json" download>
                            <Download className="h-3.5 w-3.5" aria-hidden="true" />
                            Exportar
                        </a>
                    </Button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                    <div className="min-w-0">
                        <div className="text-status-danger text-sm font-semibold">
                            Excluir minha conta
                        </div>
                        <div className="text-muted text-12-5 mt-0.5">
                            Remove permanentemente sua conta e todos os dados associados.
                        </div>
                    </div>
                    <Button
                        variant="secondary"
                        size="sm"
                        className="border-status-danger/50 text-status-danger"
                        leftIcon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                        onClick={() => setIsConfirmOpen(true)}
                    >
                        Excluir conta
                    </Button>
                </div>
            </div>

            <ConfirmDialog
                open={isConfirmOpen}
                onOpenChange={setIsConfirmOpen}
                title="Excluir sua conta?"
                description="Esta ação é permanente e remove sua conta e todos os dados associados (propriedades, medidores, alertas). Não é possível desfazer."
                confirmLabel="Excluir conta"
                variant="danger"
                isLoading={deleteUser.isPending}
                onConfirm={() => void handleDelete()}
            />
        </div>
    )
}

const ProfileReadView = ({ user }: { user: User }) => {
    const isIndividual = user.userType === "INDIVIDUAL"

    return (
        <div className="pb-18px grid grid-cols-1 gap-x-6 gap-y-4 px-5 pt-1.5 sm:grid-cols-2">
            {isIndividual ? (
                <>
                    <ProfileField label="Nome" value={user.firstName ?? "—"} />
                    <ProfileField label="Sobrenome" value={user.lastName ?? "—"} />
                    <ProfileField
                        label="CPF"
                        value={user.cpf ? maskCpf(user.cpf) : "—"}
                        tabularNums
                    />
                </>
            ) : (
                <>
                    <ProfileField label="Razão social" value={user.companyName ?? "—"} />
                    <ProfileField label="Nome fantasia" value={user.tradeName ?? "—"} />
                    <ProfileField
                        label="CNPJ"
                        value={user.cnpj ? maskCnpj(user.cnpj) : "—"}
                        tabularNums
                    />
                </>
            )}
            <ProfileField label="E-mail" value={user.email} />
            <ProfileField
                label="Tipo de conta"
                value={isIndividual ? "Pessoa Física" : "Pessoa Jurídica"}
            />
        </div>
    )
}

interface ProfileFieldProps {
    label: string
    value: string
    tabularNums?: boolean
}

const ProfileField = ({ label, value, tabularNums = false }: ProfileFieldProps) => (
    <div>
        <dt className="font-heading text-muted text-10 font-semibold tracking-[.07em] uppercase">
            {label}
        </dt>
        <dd
            className="text-14-5 mt-1.5"
            style={tabularNums ? { fontFeatureSettings: "'tnum' 1" } : undefined}
        >
            {value}
        </dd>
    </div>
)

interface IndividualProfileFormProps {
    user: User
    onCancel: () => void
    onSave: (input: UpdateUserInput) => Promise<void>
    isSaving: boolean
}

const IndividualProfileForm = ({
    user,
    onCancel,
    onSave,
    isSaving,
}: IndividualProfileFormProps) => {
    const {
        register,
        handleSubmit,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<IndividualProfileFormData>({
        resolver: zodResolver(makeIndividualProfileSchema(user.email)),
        mode: "onBlur",
        defaultValues: {
            firstName: user.firstName ?? "",
            lastName: user.lastName ?? "",
            email: user.email,
        },
    })

    // Senha atual só é pedida quando o e-mail muda de fato — trocar
    // nome/sobrenome não exige reautenticação.
    const isChangingEmail = watch("email") !== user.email

    const handleFormSubmit = async (data: IndividualProfileFormData): Promise<void> => {
        await onSave(data)
    }

    return (
        <form
            onSubmit={(e) => void handleSubmit(handleFormSubmit)(e)}
            noValidate
            className="flex flex-col gap-4 px-5 pt-1 pb-5"
        >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input label="Nome" error={errors.firstName?.message} {...register("firstName")} />
                <Input
                    label="Sobrenome"
                    error={errors.lastName?.message}
                    {...register("lastName")}
                />
            </div>
            <Input
                label="E-mail"
                type="email"
                error={errors.email?.message}
                {...register("email")}
            />
            {isChangingEmail && (
                <Input
                    label="Senha atual"
                    type="password"
                    revealable
                    autoComplete="current-password"
                    error={errors.currentPassword?.message}
                    {...register("currentPassword")}
                />
            )}
            <div>
                <Input
                    label="CPF"
                    value={user.cpf ?? ""}
                    disabled
                    readOnly
                    className={cn("opacity-55", "cursor-not-allowed")}
                />
                <p className="text-muted mt-1.5 text-xs">
                    O CPF não pode ser alterado após o cadastro.
                </p>
            </div>
            <div className="border-divider flex justify-end gap-3 border-t pt-4">
                <Button
                    type="button"
                    variant="secondary"
                    onClick={onCancel}
                    disabled={isSubmitting || isSaving}
                >
                    Cancelar
                </Button>
                <Button type="submit" isLoading={isSubmitting || isSaving}>
                    Salvar alterações
                </Button>
            </div>
        </form>
    )
}

interface CompanyProfileFormProps {
    user: User
    onCancel: () => void
    onSave: (input: UpdateUserInput) => Promise<void>
    isSaving: boolean
}

const CompanyProfileForm = ({ user, onCancel, onSave, isSaving }: CompanyProfileFormProps) => {
    const {
        register,
        handleSubmit,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<CompanyProfileFormData>({
        resolver: zodResolver(makeCompanyProfileSchema(user.email)),
        mode: "onBlur",
        defaultValues: {
            companyName: user.companyName ?? "",
            tradeName: user.tradeName ?? "",
            email: user.email,
        },
    })

    // Senha atual só é pedida quando o e-mail muda de fato.
    const isChangingEmail = watch("email") !== user.email

    const handleFormSubmit = async (data: CompanyProfileFormData): Promise<void> => {
        await onSave(data)
    }

    return (
        <form
            onSubmit={(e) => void handleSubmit(handleFormSubmit)(e)}
            noValidate
            className="flex flex-col gap-4 px-5 pt-1 pb-5"
        >
            <Input
                label="Razão social"
                error={errors.companyName?.message}
                {...register("companyName")}
            />
            <Input
                label="Nome fantasia"
                error={errors.tradeName?.message}
                {...register("tradeName")}
            />
            <Input
                label="E-mail"
                type="email"
                error={errors.email?.message}
                {...register("email")}
            />
            {isChangingEmail && (
                <Input
                    label="Senha atual"
                    type="password"
                    revealable
                    autoComplete="current-password"
                    error={errors.currentPassword?.message}
                    {...register("currentPassword")}
                />
            )}
            <div>
                <Input
                    label="CNPJ"
                    value={user.cnpj ?? ""}
                    disabled
                    readOnly
                    className={cn("opacity-55", "cursor-not-allowed")}
                />
                <p className="text-muted mt-1.5 text-xs">
                    O CNPJ não pode ser alterado após o cadastro.
                </p>
            </div>
            <div className="border-divider flex justify-end gap-3 border-t pt-4">
                <Button
                    type="button"
                    variant="secondary"
                    onClick={onCancel}
                    disabled={isSubmitting || isSaving}
                >
                    Cancelar
                </Button>
                <Button type="submit" isLoading={isSubmitting || isSaving}>
                    Salvar alterações
                </Button>
            </div>
        </form>
    )
}
