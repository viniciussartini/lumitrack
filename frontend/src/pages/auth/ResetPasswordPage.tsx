import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Link, useNavigate, useSearchParams } from "react-router"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { PasswordRequirements } from "@/components/ui/PasswordRequirements"
import { Blueprint } from "@/components/ui/Blueprint"
import { AUTH_LAYOUT_GRID_CLASS, BrandPanel } from "@/components/auth/BrandPanel"
import { IconCircle } from "@/components/ui/IconCircle"
import { RecoverySteps } from "@/components/auth/RecoverySteps"
import { authService } from "@/services/auth.service"
import { extractErrorMessage } from "@/services/api"
import { resetPasswordSchema, type ResetPasswordFormData } from "@/schemas/resetPassword.schema"

/**
 * /reset-password?token=... — passo 3 de LumiTrack Recuperar Senha.dc.html.
 * Caminho fixo em inglês (não segue o padrão em português do resto das
 * rotas) porque o link já sai assim de
 * backend/src/modules/auth/email.service.ts — mudar aqui sem mudar lá
 * quebraria todo link já enviado/pendente.
 */
export const ResetPasswordPage = () => {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const token = searchParams.get("token")
    const [done, setDone] = useState(false)
    const [serverError, setServerError] = useState<string | null>(null)

    const {
        register,
        handleSubmit,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<ResetPasswordFormData>({
        resolver: zodResolver(resetPasswordSchema),
        mode: "onBlur",
    })

    const password = watch("password") ?? ""

    const onSubmit = async (data: ResetPasswordFormData): Promise<void> => {
        if (!token) return
        setServerError(null)
        try {
            await authService.resetPassword(token, data.password)
            setDone(true)
        } catch (error) {
            setServerError(extractErrorMessage(error))
        }
    }

    // Sem token na URL — não há como chegar aqui a não ser por um link
    // manipulado/incompleto. Sem tela de formulário nesse caso: orienta a
    // recomeçar o pedido.
    if (!token) {
        return (
            <div className={AUTH_LAYOUT_GRID_CLASS}>
                <BrandPanel
                    eyebrow="Acesso seguro"
                    headline="Recupere o acesso em três passos."
                    extra={<RecoverySteps current="reset" />}
                />
                <main className="flex items-center justify-center p-7 lg:p-14">
                    <Blueprint className="px-30px w-full max-w-[400px] py-10 text-center">
                        <h2 className="font-heading text-26 mt-5 leading-[1.05] font-semibold uppercase">
                            Link inválido
                        </h2>
                        <p className="text-muted text-14-5 mt-3 leading-[1.55]">
                            Este link de redefinição está incompleto ou já foi usado. Solicite um
                            novo.
                        </p>
                        <Button asChild className="btn-block min-h-46px mt-6">
                            <Link to="/esqueci-senha">Solicitar novo link</Link>
                        </Button>
                    </Blueprint>
                </main>
            </div>
        )
    }

    return (
        <div className={AUTH_LAYOUT_GRID_CLASS}>
            <BrandPanel
                eyebrow="Acesso seguro"
                headline="Recupere o acesso em três passos."
                extra={<RecoverySteps current="reset" />}
            />

            <main className="flex items-center justify-center p-7 lg:p-14">
                <div className="w-full max-w-[400px]">
                    {done ? (
                        <Blueprint className="px-30px py-10 text-center">
                            <IconCircle
                                icon={Check}
                                tone="success"
                                strokeWidth={1.8}
                                className="mx-auto"
                            />
                            <h2 className="font-heading text-26 mt-5 leading-[1.05] font-semibold uppercase">
                                Senha redefinida
                            </h2>
                            <p className="text-muted text-14-5 mt-3 leading-[1.55]">
                                Sua senha foi atualizada com sucesso. Use a nova senha para entrar
                                na sua conta.
                            </p>
                            <Button
                                type="button"
                                className="btn-block min-h-46px mt-6"
                                onClick={() => void navigate("/login", { replace: true })}
                            >
                                Ir para o login
                            </Button>
                        </Blueprint>
                    ) : (
                        <form
                            onSubmit={(e) => void handleSubmit(onSubmit)(e)}
                            className="flex flex-col gap-4"
                            noValidate
                        >
                            <div>
                                <span className="text-accent-700 font-heading text-13 block font-semibold tracking-[.09em] uppercase">
                                    Nova senha
                                </span>
                                <h2 className="font-heading mt-3 text-[clamp(26px,2.8vw,36px)] leading-[1.03] font-semibold uppercase">
                                    Defina sua senha
                                </h2>
                                <p className="text-muted text-14-5 mt-3 leading-normal">
                                    Escolha uma nova senha para sua conta. Ela precisa atender aos
                                    requisitos abaixo.
                                </p>
                            </div>

                            <div className="mt-2 flex flex-col gap-2">
                                <Input
                                    label="Nova senha"
                                    type="password"
                                    revealable
                                    autoComplete="new-password"
                                    placeholder="Nova senha"
                                    error={errors.password?.message}
                                    {...register("password")}
                                />
                                <PasswordRequirements password={password} />
                            </div>

                            <Input
                                label="Confirmar nova senha"
                                type="password"
                                revealable
                                autoComplete="new-password"
                                placeholder="Repita a senha"
                                error={errors.confirmPassword?.message}
                                {...register("confirmPassword")}
                            />

                            {serverError && (
                                <div
                                    role="alert"
                                    className="bg-status-danger/10 text-status-danger px-3 py-2 text-sm"
                                >
                                    {serverError}
                                </div>
                            )}

                            <Button
                                type="submit"
                                isLoading={isSubmitting}
                                className="btn-block min-h-46px mt-1"
                            >
                                Redefinir senha
                            </Button>
                            <p className="text-muted mt-1 text-center text-sm">
                                <Link to="/login" className="text-accent-700 font-semibold">
                                    ← Voltar para o login
                                </Link>
                            </p>
                        </form>
                    )}
                </div>
            </main>
        </div>
    )
}
