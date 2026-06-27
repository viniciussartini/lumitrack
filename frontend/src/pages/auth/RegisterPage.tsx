import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Zap } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { PasswordRequirements } from "@/components/ui/PasswordRequirements"
import { useAuth } from "@/contexts/AuthContext"
import { registerSchema, type RegisterFormData } from "@/schemas/register.schema"
import { formatCpf, formatCnpj } from "@/lib/masks"
import { cn } from "@/lib/cn"
import type { RegisterInput } from "@/types/auth.types"

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
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 dark:bg-slate-950">
            <div className="w-full max-w-lg">
                {/* Logo + título */}
                <div className="mb-6 flex flex-col items-center gap-2">
                    <div className="rounded-full bg-brand-500 p-3">
                        <Zap className="h-6 w-6 text-white" aria-hidden="true" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                        LumiTrack
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Crie sua conta para começar a monitorar seu consumo
                    </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="mb-6 text-lg font-semibold text-slate-900 dark:text-slate-100">
                        Criar nova conta
                    </h2>

                    {/* Toggle PF/PJ */}
                    <fieldset className="mb-6">
                        <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                            Tipo de conta
                        </legend>
                        <div className="grid grid-cols-2 gap-2">
                            <label
                                className={cn(
                                    "flex cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-sm font-medium",
                                    "transition-colors",
                                    userType === "INDIVIDUAL"
                                        ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-500"
                                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
                                )}
                            >
                                <input
                                    type="radio"
                                    value="INDIVIDUAL"
                                    {...register("userType")}
                                    className="sr-only"
                                />
                                Pessoa Física
                            </label>
                            <label
                                className={cn(
                                    "flex cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-sm font-medium",
                                    "transition-colors",
                                    userType === "COMPANY"
                                        ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-500"
                                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
                                )}
                            >
                                <input
                                    type="radio"
                                    value="COMPANY"
                                    {...register("userType")}
                                    className="sr-only"
                                />
                                Pessoa Jurídica
                            </label>
                        </div>
                    </fieldset>

                    <form
                        onSubmit={handleSubmit(onSubmit)}
                        className="flex flex-col gap-4"
                        noValidate
                    >
                        {/* Campos comuns */}
                        <Input
                            label="E-mail"
                            type="email"
                            autoComplete="email"
                            placeholder="seu@email.com"
                            error={errors.email?.message}
                            {...register("email")}
                        />

                        {/* Campos PF */}
                        {userType === "INDIVIDUAL" && (
                            <>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                                autoComplete="new-password"
                                placeholder="••••••••"
                                error={errors.password?.message}
                                {...register("password")}
                            />
                            <PasswordRequirements password={password} />
                        </div>

                        <Input
                            label="Confirmar senha"
                            type="password"
                            autoComplete="new-password"
                            placeholder="••••••••"
                            error={errors.confirmPassword?.message}
                            {...register("confirmPassword")}
                        />

                        {/* Consentimento LGPD (Art. 7º/8º) — aceite explícito obrigatório */}
                        <div className="flex flex-col gap-1">
                            <label className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                                <input
                                    type="checkbox"
                                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-500 focus:ring-brand-500 dark:border-slate-700"
                                    {...register("acceptedTerms")}
                                />
                                <span>
                                    Li e concordo com a{" "}
                                    <Link
                                        to="/privacidade"
                                        target="_blank"
                                        className="font-medium text-brand-500 hover:text-brand-700"
                                    >
                                        Política de Privacidade
                                    </Link>{" "}
                                    e os{" "}
                                    <Link
                                        to="/termos"
                                        target="_blank"
                                        className="font-medium text-brand-500 hover:text-brand-700"
                                    >
                                        Termos de Uso
                                    </Link>
                                    .
                                </span>
                            </label>
                            {errors.acceptedTerms && (
                                <p className="text-sm text-red-600 dark:text-red-400">
                                    {errors.acceptedTerms.message}
                                </p>
                            )}
                        </div>

                        {serverError && (
                            <div
                                role="alert"
                                className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300"
                            >
                                {serverError}
                            </div>
                        )}

                        <Button
                            type="submit"
                            size="lg"
                            isLoading={isSubmitting}
                            className="mt-2 w-full"
                        >
                            Criar conta
                        </Button>
                    </form>

                    <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
                        Já tem conta?{" "}
                        <Link
                            to="/login"
                            className="font-medium text-brand-500 hover:text-brand-700"
                        >
                            Entrar
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    )
}