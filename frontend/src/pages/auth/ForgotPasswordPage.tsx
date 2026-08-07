import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Link } from "react-router"
import { Mail } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Blueprint } from "@/components/ui/Blueprint"
import { AUTH_LAYOUT_GRID_CLASS, BrandPanel } from "@/components/auth/BrandPanel"
import { RecoverySteps } from "@/components/auth/RecoverySteps"
import { authService } from "@/services/auth.service"
import { extractErrorMessage } from "@/services/api"
import { forgotPasswordSchema, type ForgotPasswordFormData } from "@/schemas/forgotPassword.schema"

/**
 * /esqueci-senha — passos 1 e 2 do fluxo de recuperação de senha
 * (LumiTrack Recuperar Senha.dc.html). O passo 3 (definir nova senha) é
 * uma página separada, ResetPasswordPage: só é alcançável pelo link real
 * enviado por e-mail (com o token), não por navegação dentro do app — por
 * isso o botão "Já recebi — definir nova senha" do protótipo (que pulava
 * direto pro passo 3 sem token) não tem equivalente aqui.
 */
export const ForgotPasswordPage = () => {
    const [step, setStep] = useState<"request" | "sent">("request")
    const [serverError, setServerError] = useState<string | null>(null)
    const [sentTo, setSentTo] = useState("")

    const {
        register,
        handleSubmit,
        getValues,
        formState: { errors, isSubmitting },
    } = useForm<ForgotPasswordFormData>({
        resolver: zodResolver(forgotPasswordSchema),
        mode: "onBlur",
    })

    const onSubmit = async (data: ForgotPasswordFormData): Promise<void> => {
        setServerError(null)
        try {
            await authService.forgotPassword(data.email)
            setSentTo(data.email)
            setStep("sent")
        } catch (error) {
            setServerError(extractErrorMessage(error))
        }
    }

    return (
        <div className={AUTH_LAYOUT_GRID_CLASS}>
            <BrandPanel
                eyebrow="Acesso seguro"
                headline="Recupere o acesso em três passos."
                extra={<RecoverySteps current={step === "request" ? "request" : "sent"} />}
            />

            <main className="flex items-center justify-center p-7 lg:p-14">
                <div className="w-full max-w-[400px]">
                    {step === "request" ? (
                        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
                            <span className="text-accent-700 font-heading block text-[13px] font-semibold tracking-[.09em] uppercase">
                                Recuperação de senha
                            </span>
                            <h2 className="font-heading mt-3 text-[clamp(26px,2.8vw,36px)] leading-[1.03] font-semibold uppercase">
                                Esqueceu a senha?
                            </h2>
                            <p className="text-muted mt-3 text-[14.5px] leading-normal">
                                Informe o e-mail da sua conta. Enviaremos um link para você criar
                                uma nova senha.
                            </p>

                            <div className="mt-[26px]">
                                <Input
                                    label="E-mail cadastrado"
                                    type="email"
                                    autoComplete="email"
                                    placeholder="voce@empresa.com.br"
                                    error={errors.email?.message}
                                    {...register("email")}
                                />
                            </div>

                            {serverError && (
                                <div
                                    role="alert"
                                    className="bg-status-danger/10 text-status-danger mt-4 px-3 py-2 text-sm"
                                >
                                    {serverError}
                                </div>
                            )}

                            <Button
                                type="submit"
                                isLoading={isSubmitting}
                                className="btn-block mt-6 min-h-[46px]"
                            >
                                Enviar link de recuperação
                            </Button>
                            <p className="text-muted mt-6 text-center text-sm">
                                <Link to="/login" className="text-accent-700 font-semibold">
                                    ← Voltar para o login
                                </Link>
                            </p>
                        </form>
                    ) : (
                        <Blueprint className="px-[30px] py-[34px] text-center">
                            <div className="border-accent mx-auto flex h-[52px] w-[52px] items-center justify-center border-[1.5px]">
                                <Mail
                                    className="text-accent h-[26px] w-[26px]"
                                    strokeWidth={1.5}
                                    aria-hidden="true"
                                />
                            </div>
                            <h2 className="font-heading mt-5 text-[26px] leading-[1.05] font-semibold uppercase">
                                Link enviado
                            </h2>
                            <p className="text-muted mt-3 text-[14.5px] leading-[1.55]">
                                Se houver uma conta associada a{" "}
                                <strong className="text-text">
                                    {sentTo || getValues("email") || "seu e-mail"}
                                </strong>
                                , você receberá um e-mail com o link para redefinir sua senha. O
                                link expira em 1 hora.
                            </p>
                            <Button
                                type="button"
                                variant="secondary"
                                className="btn-block mt-3 min-h-[44px]"
                                onClick={() => setStep("request")}
                            >
                                Reenviar para outro e-mail
                            </Button>
                            <p className="text-muted mt-5 text-[12.5px] leading-normal">
                                Não recebeu? Verifique a caixa de spam ou aguarde alguns minutos
                                antes de reenviar.
                            </p>
                        </Blueprint>
                    )}
                </div>
            </main>
        </div>
    )
}
