import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useLocation, useNavigate, Link } from "react-router"
import { useAuth } from "@/contexts/AuthContext"
import { loginSchema, type LoginFormData } from "@/schemas/auth.schema"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { MfaCodeForm } from "@/components/auth/MfaCodeForm"
import { DEMO_PROFILE_LABELS } from "@/config/demoUsers"
import type { DemoProfile } from "@/types/auth.types"
import { AUTH_LAYOUT_GRID_CLASS, BrandPanel } from "@/components/auth/BrandPanel"
import { useLiveTicker } from "@/hooks/useLiveTicker"
import { useTariffFlag } from "@/hooks/queries/useTariffFlag"
import {
    TARIFF_FLAG_DARK_DOT_COLOR,
    TARIFF_FLAG_DARK_TEXT_CLASS,
    TARIFF_FLAG_LABELS,
} from "@/types/tariff-flag.types"
import { cn } from "@/lib/cn"

interface LocationState {
    from?: { pathname: string }
    notice?: string
}

const numberFormatter = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
})

export const LoginPage = () => {
    const navigate = useNavigate()
    const location = useLocation()
    const { login, demoLogin, completeMfaLogin } = useAuth()
    const { kwh } = useLiveTicker()
    const { data: tariffFlag } = useTariffFlag()
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
            void navigate(redirectTo, { replace: true })
        } catch (error) {
            setServerError(error instanceof Error ? error.message : "Erro ao fazer login")
        }
    }

    const handleMfaSubmit = async (code: string): Promise<void> => {
        if (!mfaToken) return
        await completeMfaLogin({ mfaToken, code })
        void navigate(redirectTo, { replace: true })
    }

    // POST /auth/demo-login (issue #179) — sem credencial no cliente, só o
    // perfil escolhido; o backend resolve a conta demo internamente.
    const [isDemoLoading, setIsDemoLoading] = useState(false)

    const handleDemoLogin = async (profile: DemoProfile): Promise<void> => {
        setServerError(null)
        setIsDemoLoading(true)
        try {
            const result = await demoLogin(profile)
            if (result.mfaRequired) {
                setMfaToken(result.mfaToken)
                return
            }
            void navigate(redirectTo, { replace: true })
        } catch (error) {
            setServerError(error instanceof Error ? error.message : "Erro ao fazer login")
        } finally {
            setIsDemoLoading(false)
        }
    }

    return (
        <div className={AUTH_LAYOUT_GRID_CLASS}>
            {/* Painel de marca — oculto em telas pequenas (o protótipo não
                especifica mobile; assumindo formulário full-width abaixo de
                lg, ver 10-design-system.md § comportamento não especificado). */}
            <BrandPanel
                eyebrow="Painel de energia"
                headline="Cada kWh sob controle, em tempo real."
                description="Entre para acompanhar o consumo das suas unidades, comparar propriedades e antecipar o valor da fatura."
                extra={
                    // "Ao vivo" anima via useLiveTicker (hooks/useLiveTicker.ts,
                    // compartilhado com a Landing) — número ilustrativo, não é
                    // dado real (não há sessão/medidor antes do login). Bandeira
                    // vem de GET /api/tariff-flag (leitura pública desde
                    // ADR-0007) — enquanto carrega ou em erro, o box
                    // simplesmente não aparece (sem chutar uma bandeira que
                    // pode não ser a real).
                    <div className="mt-7 flex flex-wrap gap-3.5">
                        <div className="min-w-[120px] border border-white/22 px-[18px] py-3.5">
                            <div className="font-heading flex items-center gap-[7px] text-[11px] leading-none font-semibold tracking-[.08em] text-[#e6ecf2]/66 uppercase">
                                <span
                                    className="h-2 w-2 rounded-full bg-[#3f8f52]"
                                    style={{ animation: "lt-pulse 1.6s ease-in-out infinite" }}
                                />
                                Ao vivo
                            </div>
                            <div
                                data-testid="login-live-kwh"
                                className="font-heading mt-2 font-features-['tnum'_1] text-[30px] leading-none font-semibold"
                            >
                                {numberFormatter.format(kwh)}
                                <span className="ml-1 text-sm text-[#e6ecf2]/60">kW</span>
                            </div>
                        </div>
                        {tariffFlag && (
                            <div className="min-w-[120px] border border-white/22 px-[18px] py-3.5">
                                <div className="font-heading text-[11px] leading-none font-semibold tracking-[.08em] text-[#e6ecf2]/66 uppercase">
                                    Bandeira
                                </div>
                                <div
                                    className={cn(
                                        "font-heading mt-3 flex items-center gap-[7px] text-xl leading-none font-semibold",
                                        TARIFF_FLAG_DARK_TEXT_CLASS[tariffFlag.currentFlag],
                                    )}
                                >
                                    <span
                                        className="h-[9px] w-[9px] rounded-full"
                                        style={{
                                            background:
                                                TARIFF_FLAG_DARK_DOT_COLOR[tariffFlag.currentFlag],
                                        }}
                                    />
                                    {TARIFF_FLAG_LABELS[tariffFlag.currentFlag]}
                                </div>
                            </div>
                        )}
                    </div>
                }
            />

            {/* Formulário */}
            <main className="flex items-center justify-center p-7 lg:p-14">
                <div className="w-full max-w-[396px]">
                    {mfaToken ? (
                        <>
                            <h2 className="text-lg">Verificação em duas etapas</h2>

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
                            <span className="text-accent-700 font-heading block text-[13px] font-semibold tracking-[.09em] uppercase">
                                Acesso à conta
                            </span>
                            <h2 className="font-heading mt-3 text-[clamp(28px,3vw,38px)] leading-[1.03] font-semibold uppercase">
                                Entrar no LumiTrack
                            </h2>
                            <p className="text-muted mt-3 text-[14.5px] leading-normal">
                                Bem-vindo de volta. Informe seus dados para continuar.
                            </p>

                            {/* Notice (vinda de redirects, ex: pós-registro com auto-login falho) */}
                            {notice && (
                                <div
                                    role="status"
                                    className="bg-status-success/10 text-status-success mt-4 px-3 py-2 text-sm"
                                >
                                    {notice}
                                </div>
                            )}

                            <form
                                onSubmit={(e) => void handleSubmit(onSubmit)(e)}
                                className="mt-7 flex flex-col gap-4"
                                noValidate
                            >
                                <Input
                                    label="E-mail"
                                    type="email"
                                    autoComplete="email"
                                    placeholder="voce@empresa.com.br"
                                    error={errors.email?.message}
                                    {...register("email")}
                                />

                                <Input
                                    label="Senha"
                                    labelExtra={
                                        <Link
                                            to="/esqueci-senha"
                                            className="text-accent-700 text-[12.5px]"
                                        >
                                            Esqueceu a senha?
                                        </Link>
                                    }
                                    type="password"
                                    revealable
                                    autoComplete="current-password"
                                    placeholder="Sua senha"
                                    error={errors.password?.message}
                                    {...register("password")}
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
                                    className="btn-block mt-1 min-h-[46px]"
                                >
                                    Entrar
                                </Button>
                            </form>

                            <p className="text-muted mt-6 text-center text-sm">
                                Ainda não tem conta?{" "}
                                <Link to="/registro" className="text-accent-700 font-semibold">
                                    Criar conta
                                </Link>
                            </p>

                            {isDemoModeEnabled && (
                                <div className="border-divider mt-6 border-t pt-6">
                                    <p className="text-muted mb-3 text-center text-xs">
                                        Ou explore com uma conta de demonstração
                                    </p>
                                    <div className="flex flex-col gap-2">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            isLoading={isDemoLoading}
                                            onClick={() => void handleDemoLogin("residential")}
                                        >
                                            {DEMO_PROFILE_LABELS.residential}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            isLoading={isDemoLoading}
                                            onClick={() => void handleDemoLogin("commercial")}
                                        >
                                            {DEMO_PROFILE_LABELS.commercial}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </main>
        </div>
    )
}
