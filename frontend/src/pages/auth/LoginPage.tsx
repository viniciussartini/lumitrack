import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useLocation, useNavigate, Link } from "react-router"
import { Zap } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { loginSchema, type LoginFormData } from "@/schemas/auth.schema"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { MfaCodeForm } from "@/components/auth/MfaCodeForm"
import { DEMO_USERS } from "@/config/demoUsers"

interface LocationState {
    from?: { pathname: string }
    notice?: string
}

export const LoginPage = () => {
    const navigate = useNavigate()
    const location = useLocation()
    const { login, completeMfaLogin } = useAuth()
    const isDemoModeEnabled = import.meta.env.VITE_DEMO_MODE === "true"
    const [serverError, setServerError] = useState<string | null>(null)
    // Preenchido quando o backend responde `mfaRequired:true` — enquanto
    // não-nulo, a página troca o form de credenciais pelo segundo passo.
    const [mfaToken, setMfaToken] = useState<string | null>(null)

    const state = (location.state ?? null) as LocationState | null
    const [notice] = useState<string | null>(state?.notice ?? null)

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<LoginFormData>({
        resolver: zodResolver(loginSchema),
        mode: "onBlur",
    })

    const redirectTo = state?.from?.pathname ?? "/dashboard"

    const onSubmit = async (data: LoginFormData): Promise<void> => {
        setServerError(null)
        try {
            const result = await login(data)
            if (result.mfaRequired) {
                setMfaToken(result.mfaToken)
                return
            }
            navigate(redirectTo, { replace: true })
        } catch (error) {
            setServerError(
                error instanceof Error ? error.message : "Erro ao fazer login",
            )
        }
    }

    const handleMfaSubmit = async (code: string): Promise<void> => {
        if (!mfaToken) return
        await completeMfaLogin({ mfaToken, code })
        navigate(redirectTo, { replace: true })
    }

    // Mesmo caminho do submit normal (login real, sem endpoint novo) — só
    // troca as credenciais digitadas pelas fixas do seed de demonstração.
    const [isDemoLoading, setIsDemoLoading] = useState(false)

    const handleDemoLogin = async (demoUser: { email: string; password: string }): Promise<void> => {
        setServerError(null)
        setIsDemoLoading(true)
        try {
            const result = await login({ email: demoUser.email, password: demoUser.password })
            if (result.mfaRequired) {
                setMfaToken(result.mfaToken)
                return
            }
            navigate(redirectTo, { replace: true })
        } catch (error) {
            setServerError(
                error instanceof Error ? error.message : "Erro ao fazer login",
            )
        } finally {
            setIsDemoLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
            <div className="w-full max-w-md">
                <div className="mb-8 flex flex-col items-center gap-2">
                    <div className="rounded-full bg-brand-500 p-3">
                        <Zap className="h-6 w-6 text-white" aria-hidden="true" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                        LumiTrack
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Monitore o consumo de energia em tempo real
                    </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    {mfaToken ? (
                        <>
                            <h2 className="mb-6 text-lg font-semibold text-slate-900 dark:text-slate-100">
                                Verificação em duas etapas
                            </h2>

                            <MfaCodeForm
                                description="Digite o código de 6 dígitos do seu aplicativo autenticador, ou um código de backup."
                                submitLabel="Verificar"
                                onSubmit={handleMfaSubmit}
                                onCancel={() => setMfaToken(null)}
                                cancelLabel="Voltar"
                            />
                        </>
                    ) : (
                        <>
                            <h2 className="mb-6 text-lg font-semibold text-slate-900 dark:text-slate-100">
                                Entrar na conta
                            </h2>

                            {/* Notice (vinda de redirects, ex: pós-registro com auto-login falho) */}
                            {notice && (
                                <div
                                    role="status"
                                    className="mb-4 rounded-md bg-success/10 px-3 py-2 text-sm text-success"
                                >
                                    {notice}
                                </div>
                            )}

                            <form
                                onSubmit={handleSubmit(onSubmit)}
                                className="flex flex-col gap-4"
                                noValidate
                            >
                                <Input
                                    label="E-mail"
                                    type="email"
                                    autoComplete="email"
                                    placeholder="seu@email.com"
                                    error={errors.email?.message}
                                    {...register("email")}
                                />

                                <Input
                                    label="Senha"
                                    type="password"
                                    autoComplete="current-password"
                                    placeholder="••••••••"
                                    error={errors.password?.message}
                                    {...register("password")}
                                />

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
                                    Entrar
                                </Button>
                            </form>

                            <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
                                Não tem conta?{" "}
                                <Link
                                    to="/registro"
                                    className="font-medium text-brand-500 hover:text-brand-700"
                                >
                                    Criar conta
                                </Link>
                            </p>

                            {isDemoModeEnabled && (
                                <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-800">
                                    <p className="mb-3 text-center text-xs text-slate-500 dark:text-slate-400">
                                        Ou explore com uma conta de demonstração
                                    </p>
                                    <div className="flex flex-col gap-2">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            isLoading={isDemoLoading}
                                            onClick={() => handleDemoLogin(DEMO_USERS.residential)}
                                        >
                                            {DEMO_USERS.residential.label}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            isLoading={isDemoLoading}
                                            onClick={() => handleDemoLogin(DEMO_USERS.commercial)}
                                        >
                                            {DEMO_USERS.commercial.label}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}