import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { User, Building2 } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { PasswordRequirements } from "@/components/ui/PasswordRequirements"
import { AUTH_LAYOUT_GRID_CLASS, BrandPanel } from "@/components/auth/BrandPanel"
import { useAuth } from "@/contexts/AuthContext"
import { registerSchema, type RegisterFormData } from "@/schemas/register.schema"
import { formatCpf, formatCnpj } from "@/lib/masks"
import { cn } from "@/lib/cn"
import type { RegisterInput } from "@/types/auth.types"

const VALUE_PROPS = [
    "Consumo em tempo real por unidade",
    "Histórico, comparação e bandeiras tarifárias",
    "Dados protegidos conforme a LGPD",
] as const

export const RegisterPage = () => {
    const navigate = useNavigate()
    const { register: registerUser } = useAuth()
    const [serverError, setServerError] = useState<string | null>(null)

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        unregister,
        formState: { errors, isSubmitting },
    } = useForm<RegisterFormData>({
        resolver: zodResolver(registerSchema),
        mode: "onBlur",
        defaultValues: { userType: "INDIVIDUAL", acceptedTerms: false },
    })

    const userType = watch("userType")
    const password = watch("password") ?? ""

    /**
     * Ao alternar PF/PJ, des-registra os campos do tipo "errado".
     * Sem isso, dados antigos ficam no estado e podem causar erros
     * de validação fantasmas ou ressurgir ao alternar de volta.
     */
    useEffect(() => {
        if (userType === "INDIVIDUAL") {
            unregister(["companyName", "cnpj", "tradeName"])
        } else if (userType === "COMPANY") {
            unregister(["firstName", "lastName", "cpf"])
        }
    }, [userType, unregister])

    const onSubmit = async (data: RegisterFormData): Promise<void> => {
        setServerError(null)

        // Monta o payload sem confirmPassword (backend não conhece esse campo).
        // acceptedTerms é fixado como `true` literal aqui: o resolver do Zod
        // (refine acceptedTerms === true) já garantiu isso antes do onSubmit disparar.
        const payload: RegisterInput =
            data.userType === "INDIVIDUAL"
                ? {
                    userType: "INDIVIDUAL",
                    email: data.email,
                    password: data.password,
                    firstName: data.firstName,
                    lastName: data.lastName,
                    cpf: data.cpf,
                    acceptedTerms: true,
                }
                : {
                    userType: "COMPANY",
                    email: data.email,
                    password: data.password,
                    companyName: data.companyName,
                    cnpj: data.cnpj,
                    tradeName: data.tradeName,
                    acceptedTerms: true,
                }

        try {
            await registerUser(payload)
            navigate("/dashboard", { replace: true })
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Erro ao criar conta"

            // Erro especial: registro ok mas auto-login falhou
            if (message === "POST_REGISTER_LOGIN_FAILED") {
                navigate("/login", {
                    replace: true,
                    state: {
                        notice:
                            "Conta criada com sucesso! Faça login para continuar.",
                    },
                })
                return
            }

            setServerError(message)
        }
    }

    return (
        <div className={AUTH_LAYOUT_GRID_CLASS}>
            <BrandPanel
                eyebrow="Comece agora"
                headline="Sua energia, medida e sob controle."
                description="Crie uma conta para pessoa física ou jurídica e comece a monitorar o consumo de todas as suas unidades."
                extra={
                    <ul className="mt-7 flex list-none flex-col gap-[13px] p-0">
                        {VALUE_PROPS.map((item) => (
                            <li key={item} className="flex gap-[11px] text-sm text-[#e6ecf2]/85">
                                <span className="text-status-highlight font-bold">→</span>
                                {item}
                            </li>
                        ))}
                    </ul>
                }
            />

            <main className="flex items-center justify-center p-7 py-10 lg:p-14">
                <div className="w-full max-w-[440px]">
                    <span className="text-accent-700 font-heading block text-[13px] font-semibold tracking-[.09em] uppercase">
                        Criar conta
                    </span>
                    <h2 className="font-heading mt-3 text-[clamp(26px,2.8vw,36px)] leading-[1.03] font-semibold uppercase">
                        Nova conta LumiTrack
                    </h2>
                    <p className="text-muted mt-3 text-[14.5px] leading-normal">
                        Escolha o tipo de conta e preencha seus dados.
                    </p>

                    {/* Tipo de conta */}
                    <div className="mt-6">
                        <span className="font-heading text-muted mb-2.5 block text-[11px] leading-none font-semibold tracking-[.08em] uppercase">
                            Tipo de conta
                        </span>
                        <div className="flex gap-[10px]">
                            <button
                                type="button"
                                aria-label="Pessoa Física"
                                aria-pressed={userType === "INDIVIDUAL"}
                                data-on={userType === "INDIVIDUAL"}
                                onClick={() => setValue("userType", "INDIVIDUAL")}
                                className="lt-typebtn"
                            >
                                <User className="h-[17px] w-[17px]" strokeWidth={1.5} aria-hidden="true" />
                                Pessoa Física
                            </button>
                            <button
                                type="button"
                                aria-label="Pessoa Jurídica"
                                aria-pressed={userType === "COMPANY"}
                                data-on={userType === "COMPANY"}
                                onClick={() => setValue("userType", "COMPANY")}
                                className="lt-typebtn"
                            >
                                <Building2 className="h-[17px] w-[17px]" strokeWidth={1.5} aria-hidden="true" />
                                Pessoa Jurídica
                            </button>
                        </div>
                    </div>

                    <form
                        onSubmit={handleSubmit(onSubmit)}
                        className="mt-5 flex flex-col gap-4"
                        noValidate
                    >
                        {/* Campos comuns */}
                        <Input
                            label="E-mail"
                            type="email"
                            autoComplete="email"
                            placeholder="voce@empresa.com.br"
                            error={errors.email?.message}
                            {...register("email")}
                        />

                        {/* Campos PF */}
                        {userType === "INDIVIDUAL" && (
                            <>
                                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                                    <Input
                                        label="Nome"
                                        autoComplete="given-name"
                                        placeholder="João"
                                        error={
                                            "firstName" in errors
                                                ? errors.firstName?.message
                                                : undefined
                                        }
                                        {...register("firstName")}
                                    />
                                    <Input
                                        label="Sobrenome"
                                        autoComplete="family-name"
                                        placeholder="Silva"
                                        error={
                                            "lastName" in errors
                                                ? errors.lastName?.message
                                                : undefined
                                        }
                                        {...register("lastName")}
                                    />
                                </div>
                                <Input
                                    label="CPF"
                                    inputMode="numeric"
                                    placeholder="000.000.000-00"
                                    error={
                                        "cpf" in errors
                                            ? errors.cpf?.message
                                            : undefined
                                    }
                                    {...register("cpf", {
                                        onChange: (e) => {
                                            e.target.value = formatCpf(e.target.value)
                                            setValue("cpf", e.target.value, {
                                                shouldValidate: false,
                                            })
                                        },
                                    })}
                                />
                            </>
                        )}

                        {/* Campos PJ */}
                        {userType === "COMPANY" && (
                            <>
                                <Input
                                    label="Razão social"
                                    autoComplete="organization"
                                    placeholder="Empresa Ltda"
                                    error={
                                        "companyName" in errors
                                            ? errors.companyName?.message
                                            : undefined
                                    }
                                    {...register("companyName")}
                                />
                                <Input
                                    label="Nome fantasia (opcional)"
                                    placeholder="Empresa"
                                    error={
                                        "tradeName" in errors
                                            ? errors.tradeName?.message
                                            : undefined
                                    }
                                    {...register("tradeName")}
                                />
                                <Input
                                    label="CNPJ"
                                    inputMode="numeric"
                                    placeholder="00.000.000/0000-00"
                                    error={
                                        "cnpj" in errors
                                            ? errors.cnpj?.message
                                            : undefined
                                    }
                                    {...register("cnpj", {
                                        onChange: (e) => {
                                            e.target.value = formatCnpj(e.target.value)
                                            setValue("cnpj", e.target.value, {
                                                shouldValidate: false,
                                            })
                                        },
                                    })}
                                />
                            </>
                        )}

                        {/* Senha + requisitos */}
                        <div className="flex flex-col gap-2">
                            <Input
                                label="Senha"
                                type="password"
                                revealable
                                autoComplete="new-password"
                                placeholder="Crie uma senha forte"
                                error={errors.password?.message}
                                {...register("password")}
                            />
                            <PasswordRequirements password={password} />
                        </div>

                        <Input
                            label="Confirmar senha"
                            type="password"
                            revealable
                            autoComplete="new-password"
                            placeholder="Repita a senha"
                            error={errors.confirmPassword?.message}
                            {...register("confirmPassword")}
                        />

                        {/* Consentimento LGPD (Art. 7º/8º) — aceite explícito obrigatório */}
                        <div className="flex flex-col gap-1">
                            <label className="flex cursor-pointer items-start gap-2.5 text-[13.5px] leading-normal">
                                <input
                                    type="checkbox"
                                    className="accent-accent mt-0.5 h-4 w-4 shrink-0"
                                    {...register("acceptedTerms")}
                                />
                                <span>
                                    Li e concordo com a{" "}
                                    <Link to="/privacidade" target="_blank" className="text-accent-700">
                                        Política de Privacidade
                                    </Link>{" "}
                                    e os{" "}
                                    <Link to="/termos" target="_blank" className="text-accent-700">
                                        Termos de Uso
                                    </Link>
                                    .
                                </span>
                            </label>
                            {errors.acceptedTerms && (
                                <p className="text-status-danger text-sm">
                                    {errors.acceptedTerms.message}
                                </p>
                            )}
                        </div>

                        {serverError && (
                            <div role="alert" className="bg-status-danger/10 text-status-danger px-3 py-2 text-sm">
                                {serverError}
                            </div>
                        )}

                        <Button
                            type="submit"
                            isLoading={isSubmitting}
                            className={cn("btn-block", "mt-1 min-h-[46px]")}
                        >
                            Criar conta
                        </Button>
                    </form>

                    <p className="text-muted mt-6 text-center text-sm">
                        Já tem conta?{" "}
                        <Link to="/login" className="text-accent-700 font-semibold">
                            Entrar
                        </Link>
                    </p>
                </div>
            </main>
        </div>
    )
}
