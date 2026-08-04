import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ShieldCheck, ShieldOff, Copy, Check, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/contexts/AuthContext"
import {
    useMfaSetup,
    useMfaVerifySetup,
    useMfaDisable,
} from "@/hooks/queries/useMfaMutations"
import { MfaCodeForm } from "@/components/auth/MfaCodeForm"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Tag } from "@/components/ui/Tag"
import { extractErrorMessage } from "@/services/api"
import { cn } from "@/lib/cn"
import { mfaDisableSchema, type MfaDisableFormData } from "@/schemas/mfa.schema"
import type { MfaSetupResponse } from "@/types/auth.types"

type Step = "idle" | "setup" | "backup-codes" | "disable"

/**
 * Configuração de MFA (TOTP) da conta — única página de "Segurança"/conta
 * do app hoje (acessível via UserMenu). Fluxos:
 *
 *   idle          → botão Ativar/Desativar conforme user.mfaEnabled
 *   setup         → QR code + secret + MfaCodeForm confirmando o código
 *   backup-codes  → os 10 códigos de backup, exibidos uma única vez
 *   disable       → senha + código, exige dupla confirmação
 *
 * `refreshUser()` (AuthContext) é chamado após verify-setup/disable para
 * sincronizar `user.mfaEnabled` — as mutations em si só falam com a API,
 * não conhecem o AuthContext (ver useMfaMutations.ts).
 */
export const SecurityPage = () => {
    const { user, refreshUser } = useAuth()
    const mfaSetup = useMfaSetup()
    const mfaVerifySetup = useMfaVerifySetup()
    const mfaDisable = useMfaDisable()

    const [step, setStep] = useState<Step>("idle")
    const [setupData, setSetupData] = useState<MfaSetupResponse | null>(null)
    const [backupCodes, setBackupCodes] = useState<string[]>([])

    if (!user) return null

    const handleStartSetup = async (): Promise<void> => {
        try {
            const data = await mfaSetup.mutateAsync()
            setSetupData(data)
            setStep("setup")
        } catch (error) {
            toast.error("Não foi possível iniciar a configuração", {
                description: extractErrorMessage(error),
            })
        }
    }

    const handleVerifySetup = async (code: string): Promise<void> => {
        if (!setupData) return
        const result = await mfaVerifySetup.mutateAsync({
            secret: setupData.secret,
            code,
        })
        setBackupCodes(result.backupCodes)
        setStep("backup-codes")
        await refreshUser()
    }

    const handleFinish = (): void => {
        setStep("idle")
        setSetupData(null)
        setBackupCodes([])
    }

    const handleDisable = async (data: MfaDisableFormData): Promise<void> => {
        await mfaDisable.mutateAsync(data)
        setStep("idle")
        await refreshUser()
    }

    return (
        <div className="flex flex-col gap-6">
            <div>
                <span className="font-heading text-accent-700 block text-xs font-semibold tracking-[.08em] uppercase">
                    Sua conta
                </span>
                <h1 className="font-heading mt-2 text-[clamp(22px,2.4vw,30px)] leading-[1.05] font-semibold uppercase">
                    Segurança
                </h1>
                <p className="text-muted mt-2 text-sm">
                    Gerencie a autenticação de dois fatores da sua conta.
                </p>
            </div>

            <div className="blueprint p-[26px]">
                <i className="corner tl" />
                <i className="corner tr" />
                <i className="corner bl" />
                <i className="corner br" />

                <div className="flex items-start gap-3.5">
                    <span
                        className={cn(
                            "flex h-11 w-11 shrink-0 items-center justify-center border",
                            user.mfaEnabled
                                ? "border-status-success text-status-success"
                                : "border-divider text-muted",
                        )}
                        aria-hidden="true"
                    >
                        {user.mfaEnabled ? (
                            <ShieldCheck className="h-5 w-5" />
                        ) : (
                            <ShieldOff className="h-5 w-5" />
                        )}
                    </span>
                    <div className="min-w-0 flex-1">
                        <h2 className="font-heading text-lg font-semibold uppercase">
                            Autenticação de dois fatores (2FA)
                        </h2>
                        <p className="text-muted mt-1.5 text-[13.5px] leading-relaxed">
                            {user.mfaEnabled
                                ? "Ativada — um código do seu aplicativo autenticador é exigido a cada login."
                                : "Desativada — adicione uma camada extra de segurança exigindo um código do seu aplicativo autenticador a cada login."}
                        </p>
                    </div>
                    <Tag variant={user.mfaEnabled ? "accent" : "neutral"} className="ml-auto shrink-0 font-semibold">
                        {user.mfaEnabled ? "Ativado" : "Desativado"}
                    </Tag>
                </div>

                {step === "idle" && (
                    <div className="border-divider mt-5 border-t pt-5">
                        {user.mfaEnabled ? (
                            <Button variant="danger" onClick={() => setStep("disable")}>
                                Desativar 2FA
                            </Button>
                        ) : (
                            <Button onClick={handleStartSetup} isLoading={mfaSetup.isPending}>
                                Ativar 2FA
                            </Button>
                        )}
                    </div>
                )}

                {step === "setup" && setupData && (
                    <div className="border-divider mt-5 flex flex-col gap-5 border-t pt-5">
                        <div>
                            <h3 className="font-heading text-sm font-semibold uppercase">
                                1. Escaneie o QR code
                            </h3>
                            <p className="text-muted mt-1 text-sm">
                                Use um aplicativo autenticador (Google Authenticator, Authy
                                etc.) para escanear o código abaixo.
                            </p>
                            <img
                                src={setupData.qrCodeDataUrl}
                                alt="QR code para configurar a autenticação de dois fatores"
                                className="border-divider mt-3 h-48 w-48 border"
                            />
                            <p className="text-muted mt-3 text-xs">
                                Não consegue escanear? Digite a chave manualmente:{" "}
                                <code className="border-divider font-heading border px-2.5 py-1 font-semibold tracking-wide">
                                    {setupData.secret}
                                </code>
                            </p>
                        </div>

                        <div>
                            <h3 className="font-heading text-sm font-semibold uppercase">
                                2. Confirme o código gerado
                            </h3>
                            <div className="mt-3">
                                <MfaCodeForm
                                    description="Digite o código de 6 dígitos exibido no aplicativo."
                                    submitLabel="Verificar e ativar"
                                    onSubmit={handleVerifySetup}
                                    onCancel={handleFinish}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {step === "backup-codes" && (
                    <BackupCodesReveal codes={backupCodes} onFinish={handleFinish} />
                )}

                {step === "disable" && (
                    <div className="border-divider mt-5 border-t pt-5">
                        <MfaDisableForm
                            onSubmit={handleDisable}
                            onCancel={() => setStep("idle")}
                            isLoading={mfaDisable.isPending}
                        />
                    </div>
                )}
            </div>
        </div>
    )
}

// Subcomponentes locais

interface BackupCodesRevealProps {
    codes: string[]
    onFinish: () => void
}

const BackupCodesReveal = ({ codes, onFinish }: BackupCodesRevealProps) => {
    const [copied, setCopied] = useState(false)

    const handleCopy = async (): Promise<void> => {
        try {
            await navigator.clipboard.writeText(codes.join("\n"))
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.error("Não foi possível copiar — copie os códigos manualmente")
        }
    }

    return (
        <div className="border-divider mt-5 flex flex-col gap-4 border-t pt-5">
            <div
                role="alert"
                className="border-status-warning/40 bg-status-warning/10 text-status-warning flex items-start gap-2.5 border px-3.5 py-3 text-sm leading-relaxed"
            >
                <AlertTriangle className="mt-0.5 h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                2FA ativado com sucesso. Guarde estes códigos de backup em um
                lugar seguro — eles não serão exibidos novamente, e cada um
                pode ser usado uma única vez para entrar caso você perca acesso
                ao aplicativo autenticador.
            </div>

            <ul
                className={cn(
                    "border-divider font-heading grid grid-cols-2 gap-2 border p-4 text-[15px] font-semibold tracking-wide",
                    "font-features-['tnum'_1]",
                )}
            >
                {codes.map((code) => (
                    <li key={code}>{code}</li>
                ))}
            </ul>

            <div className="flex gap-2">
                <Button
                    type="button"
                    variant="secondary"
                    leftIcon={
                        copied ? (
                            <Check className="h-4 w-4" aria-hidden="true" />
                        ) : (
                            <Copy className="h-4 w-4" aria-hidden="true" />
                        )
                    }
                    onClick={handleCopy}
                >
                    {copied ? "Copiado" : "Copiar códigos"}
                </Button>
                <Button type="button" onClick={onFinish} className="flex-1">
                    Concluir
                </Button>
            </div>
        </div>
    )
}

interface MfaDisableFormProps {
    onSubmit: (data: MfaDisableFormData) => Promise<void>
    onCancel: () => void
    isLoading: boolean
}

const MfaDisableForm = ({ onSubmit, onCancel, isLoading }: MfaDisableFormProps) => {
    const [serverError, setServerError] = useState<string | null>(null)

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<MfaDisableFormData>({
        resolver: zodResolver(mfaDisableSchema),
        mode: "onBlur",
    })

    const handleFormSubmit = async (data: MfaDisableFormData): Promise<void> => {
        setServerError(null)
        try {
            await onSubmit(data)
        } catch (error) {
            setServerError(extractErrorMessage(error))
        }
    }

    return (
        <form
            onSubmit={handleSubmit(handleFormSubmit)}
            className="flex flex-col gap-4"
            noValidate
        >
            <p className="text-muted text-[13.5px]">
                Confirme sua senha e um código válido do aplicativo
                autenticador (ou um código de backup) para desativar o 2FA.
            </p>

            <Input
                label="Senha atual"
                type="password"
                autoComplete="current-password"
                error={errors.password?.message}
                {...register("password")}
            />

            <Input
                label="Código de verificação"
                autoComplete="one-time-code"
                placeholder="000000 ou XXXXX-XXXXX"
                error={errors.code?.message}
                {...register("code")}
            />

            {serverError && (
                <div role="alert" className="bg-status-danger/10 text-status-danger px-3 py-2 text-sm">
                    {serverError}
                </div>
            )}

            <div className="flex gap-2">
                <Button
                    type="button"
                    variant="secondary"
                    onClick={onCancel}
                    disabled={isSubmitting || isLoading}
                >
                    Cancelar
                </Button>
                <Button
                    type="submit"
                    variant="danger"
                    isLoading={isSubmitting || isLoading}
                    className="flex-1"
                >
                    Desativar 2FA
                </Button>
            </div>
        </form>
    )
}
