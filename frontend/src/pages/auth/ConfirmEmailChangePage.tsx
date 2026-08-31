import { useEffect, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { Check, X } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Blueprint } from "@/components/ui/Blueprint"
import { AUTH_LAYOUT_GRID_CLASS, BrandPanel } from "@/components/auth/BrandPanel"
import { IconCircle } from "@/components/ui/IconCircle"
import { authService } from "@/services/auth.service"
import { extractErrorMessage } from "@/services/api"

type Status = "loading" | "success" | "error" | "missing-token"

/**
 * /confirmar-email?token=... — efetiva a troca de e-mail pedida em Perfil.
 * Dispara sozinha ao montar (sem form — o token já é a única entrada) e
 * mostra o resultado. Como TODAS as sessões do usuário são revogadas no
 * backend ao confirmar, o CTA de sucesso leva a /login mesmo que a aba que
 * abriu o link estivesse autenticada — a sessão dela, se houver, já não é
 * mais válida.
 */
export const ConfirmEmailChangePage = () => {
    const [searchParams] = useSearchParams()
    const token = searchParams.get("token")
    const [status, setStatus] = useState<Status>(token ? "loading" : "missing-token")
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    // Evita disparar a confirmação duas vezes sob o double-invoke de efeitos
    // do StrictMode em dev — o token é de uso único, uma segunda chamada
    // sempre falharia com "token já usado".
    const hasRequested = useRef(false)

    useEffect(() => {
        if (!token || hasRequested.current) return
        hasRequested.current = true

        authService
            .confirmEmailChange(token)
            .then(() => setStatus("success"))
            .catch((error: unknown) => {
                setErrorMessage(extractErrorMessage(error))
                setStatus("error")
            })
    }, [token])

    return (
        <div className={AUTH_LAYOUT_GRID_CLASS}>
            <BrandPanel
                eyebrow="Conta"
                headline="Confirmando a troca do seu e-mail."
                description="Um passo a mais para manter sua conta segura."
            />

            <main className="flex items-center justify-center p-7 lg:p-14">
                <div className="w-full max-w-[400px]">
                    {status === "loading" && <LoadingCard />}
                    {status === "success" && <SuccessCard />}
                    {(status === "error" || status === "missing-token") && (
                        <ErrorCard
                            message={
                                status === "missing-token"
                                    ? "Este link de confirmação está incompleto. Peça a troca de e-mail novamente em Perfil."
                                    : (errorMessage ?? "")
                            }
                        />
                    )}
                </div>
            </main>
        </div>
    )
}

const LoadingCard = () => (
    <Blueprint className="px-30px py-10 text-center">
        <h2 className="font-heading text-26 mt-5 leading-[1.05] font-semibold uppercase">
            Confirmando…
        </h2>
        <p className="text-muted text-14-5 mt-3 leading-[1.55]">Aguarde um instante.</p>
    </Blueprint>
)

const SuccessCard = () => (
    <Blueprint className="px-30px py-10 text-center">
        <IconCircle icon={Check} tone="success" strokeWidth={1.8} className="mx-auto" />
        <h2 className="font-heading text-26 mt-5 leading-[1.05] font-semibold uppercase">
            E-mail atualizado
        </h2>
        <p className="text-muted text-14-5 mt-3 leading-[1.55]">
            Seu e-mail foi confirmado com sucesso. Por segurança, todas as sessões ativas foram
            encerradas — entre novamente para continuar.
        </p>
        <Button asChild className="btn-block min-h-46px mt-6">
            <Link to="/login">Ir para o login</Link>
        </Button>
    </Blueprint>
)

const ErrorCard = ({ message }: { message: string }) => (
    <Blueprint className="px-30px py-10 text-center">
        <IconCircle icon={X} tone="danger" strokeWidth={1.8} className="mx-auto" />
        <h2 className="font-heading text-26 mt-5 leading-[1.05] font-semibold uppercase">
            Link inválido
        </h2>
        <p className="text-muted text-14-5 mt-3 leading-[1.55]">{message}</p>
        <Button asChild variant="secondary" className="btn-block min-h-46px mt-6">
            <Link to="/perfil">Voltar para o perfil</Link>
        </Button>
    </Blueprint>
)
