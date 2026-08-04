import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Mail, Pencil } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/contexts/AuthContext"
import { useUpdateUser } from "@/hooks/queries/useUserMutations"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Tag } from "@/components/ui/Tag"
import { extractErrorMessage } from "@/services/api"
import { getDisplayInfo } from "@/lib/userDisplay"
import { maskCpf, maskCnpj } from "@/lib/masks"
import { cn } from "@/lib/cn"
import {
    individualProfileSchema,
    companyProfileSchema,
    type IndividualProfileFormData,
    type CompanyProfileFormData,
} from "@/schemas/profile.schema"
import type { UpdateUserInput, User } from "@/types/auth.types"

/**
 * Perfil — dados pessoais. LumiTrack Home.dc.html, `isProfile` (linhas
 * 823-914): só o card de identidade + "Dados pessoais" (leitura/edição).
 * Os cards "Conta" (membro desde/propriedades/2FA) e "Privacidade & dados"
 * do mesmo bloco ficam para a sub-issue #120 — dado real ainda não
 * disponível (contagem de propriedades) ou ação destrutiva que merece
 * tratamento próprio.
 *
 * Cobre PF e PJ (o handoff só mostra o mock PF) — um usuário `COMPANY`
 * também precisa ver/editar o próprio perfil, mesma ramificação por
 * `userType` já usada em RegisterPage/registerSchema.
 */
export const ProfilePage = () => {
    const { user, refreshUser } = useAuth()
    const [isEditing, setIsEditing] = useState(false)
    const updateUser = useUpdateUser()

    if (!user) return null

    const isIndividual = user.userType === "INDIVIDUAL"
    const { name, initials } = getDisplayInfo(user)

    const handleSave = async (input: UpdateUserInput): Promise<void> => {
        try {
            await updateUser.mutateAsync({ id: user.id, input })
            await refreshUser()
            toast.success("Perfil atualizado")
            setIsEditing(false)
        } catch (error) {
            toast.error("Não foi possível salvar as alterações", {
                description: extractErrorMessage(error),
            })
        }
    }

    return (
        <div className="flex max-w-[920px] flex-col gap-6">
            <div className="blueprint p-[26px]">
                <i className="corner tl" />
                <i className="corner tr" />
                <i className="corner bl" />
                <i className="corner br" />

                <div className="flex flex-wrap items-center gap-[18px]">
                    <span
                        aria-hidden="true"
                        className="border-accent text-accent font-heading flex h-18 w-18 shrink-0 items-center justify-center border-[1.5px] text-[28px] font-semibold"
                    >
                        {initials}
                    </span>
                    <div className="min-w-0 flex-1">
                        <h1 className="font-heading m-0 text-[clamp(22px,2.4vw,28px)] leading-[1.02] font-semibold uppercase">
                            {name}
                        </h1>
                        <p className="text-muted mt-2 flex items-center gap-2 text-sm">
                            <Mail className="h-[15px] w-[15px]" aria-hidden="true" />
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
                    <span className="font-heading text-[17px] font-semibold uppercase">
                        Dados pessoais
                    </span>
                    {!isEditing && (
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            leftIcon={<Pencil className="h-3.5 w-3.5" aria-hidden="true" />}
                            onClick={() => setIsEditing(true)}
                        >
                            Editar
                        </Button>
                    )}
                </div>

                {!isEditing ? (
                    <ProfileReadView user={user} />
                ) : isIndividual ? (
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
            </div>
        </div>
    )
}

// Subcomponentes locais

const ProfileReadView = ({ user }: { user: User }) => {
    const isIndividual = user.userType === "INDIVIDUAL"

    return (
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 px-5 pt-1.5 pb-[18px] sm:grid-cols-2">
            {isIndividual ? (
                <>
                    <ProfileField label="Nome" value={user.firstName ?? "—"} />
                    <ProfileField label="Sobrenome" value={user.lastName ?? "—"} />
                    <ProfileField label="CPF" value={user.cpf ? maskCpf(user.cpf) : "—"} tabularNums />
                </>
            ) : (
                <>
                    <ProfileField label="Razão social" value={user.companyName ?? "—"} />
                    <ProfileField label="Nome fantasia" value={user.tradeName ?? "—"} />
                    <ProfileField label="CNPJ" value={user.cnpj ? maskCnpj(user.cnpj) : "—"} tabularNums />
                </>
            )}
            <ProfileField label="E-mail" value={user.email} />
            <ProfileField label="Tipo de conta" value={isIndividual ? "Pessoa Física" : "Pessoa Jurídica"} />
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
        <dt className="font-heading text-muted text-[10px] font-semibold tracking-[.07em] uppercase">
            {label}
        </dt>
        <dd
            className="mt-1.5 text-[14.5px]"
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

const IndividualProfileForm = ({ user, onCancel, onSave, isSaving }: IndividualProfileFormProps) => {
    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<IndividualProfileFormData>({
        resolver: zodResolver(individualProfileSchema),
        mode: "onBlur",
        defaultValues: {
            firstName: user.firstName ?? "",
            lastName: user.lastName ?? "",
            email: user.email,
        },
    })

    const handleFormSubmit = async (data: IndividualProfileFormData): Promise<void> => {
        await onSave(data)
    }

    return (
        <form
            onSubmit={handleSubmit(handleFormSubmit)}
            noValidate
            className="flex flex-col gap-4 px-5 pt-1 pb-5"
        >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input label="Nome" error={errors.firstName?.message} {...register("firstName")} />
                <Input label="Sobrenome" error={errors.lastName?.message} {...register("lastName")} />
            </div>
            <Input label="E-mail" type="email" error={errors.email?.message} {...register("email")} />
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
                <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting || isSaving}>
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
        formState: { errors, isSubmitting },
    } = useForm<CompanyProfileFormData>({
        resolver: zodResolver(companyProfileSchema),
        mode: "onBlur",
        defaultValues: {
            companyName: user.companyName ?? "",
            tradeName: user.tradeName ?? "",
            email: user.email,
        },
    })

    const handleFormSubmit = async (data: CompanyProfileFormData): Promise<void> => {
        await onSave(data)
    }

    return (
        <form
            onSubmit={handleSubmit(handleFormSubmit)}
            noValidate
            className="flex flex-col gap-4 px-5 pt-1 pb-5"
        >
            <Input label="Razão social" error={errors.companyName?.message} {...register("companyName")} />
            <Input label="Nome fantasia" error={errors.tradeName?.message} {...register("tradeName")} />
            <Input label="E-mail" type="email" error={errors.email?.message} {...register("email")} />
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
                <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting || isSaving}>
                    Cancelar
                </Button>
                <Button type="submit" isLoading={isSubmitting || isSaving}>
                    Salvar alterações
                </Button>
            </div>
        </form>
    )
}
