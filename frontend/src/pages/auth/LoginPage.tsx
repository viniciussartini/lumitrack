import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useLocation, useNavigate } from "react-router-dom"
import { Zap } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { loginSchema, type LoginFormData } from "@/schemas/auth.schema"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"

interface LocationState {
    from?: { pathname: string }
}

export const LoginPage = () => {
    const navigate = useNavigate()
    const location = useLocation()
    const { login } = useAuth()
    const [serverError, setServerError] = useState<string | null>(null)

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<LoginFormData>({
        resolver: zodResolver(loginSchema),
        defaultValues: { email: "", password: "" },
    })

    const onSubmit = async (data: LoginFormData) => {
        setServerError(null)
        try {
            await login(data)
            const state = location.state as LocationState | null
            const redirectTo = state?.from?.pathname ?? "/dashboard"
            navigate(redirectTo, { replace: true })
        } catch (error) {
            setServerError(
                error instanceof Error ? error.message : "Erro ao fazer login",
            )
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
            <div className="w-full max-w-md">
                {/* Logo + título */}
                <div className="mb-8 flex flex-col items-center gap-2">
                    <div className="rounded-full bg-brand-500 p-3">
                        <Zap className="h-6 w-6 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                        LumiTrack
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Monitore o consumo de energia em tempo real
                    </p>
                </div>

                {/* Card do form */}
                <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="mb-6 text-lg font-semibold text-slate-900 dark:text-slate-100">
                        Entrar na conta
                    </h2>

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
                </div>
            </div>
        </div>
    )
}