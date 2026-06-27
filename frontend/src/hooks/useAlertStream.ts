import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { createAlertStream } from "@/lib/sse/alertStream"
import { useAuth } from "@/contexts/AuthContext"
import { queryKeys } from "@/lib/queryClient"
import { formatThresholdKwh } from "@/lib/formatters/alert"
import type { Alert } from "@/types/alert.types"

/**
 * Hook que mantém o stream SSE ativo enquanto o usuário está autenticado.
 *
 * Responsabilidades:
 *   1. Abrir SSE (autenticado via cookie httpOnly) quando o user autentica
 *   2. Fechar quando deslogar (ou quando o componente que usa o hook desmontar)
 *   3. Invalidar queries de alertas ao receber novo evento
 *   4. Disparar toast com botão "Ver" que leva pra /alertas?triggered=true
 *
 * Onde montar:
 *   Montado no AppShell. Como o AppShell só renderiza em rotas
 *   autenticadas (envolvido por ProtectedRoute), o stream só vive enquanto
 *   o user está na área autenticada do app.
 *
 * Como funciona o cleanup:
 *   Effect retorna `cleanup` (abort do AbortController). Quando o user
 *   desloga, o AppShell desmonta, o effect cleanup roda, o controller
 *   aborta. Próximo login monta tudo de novo.
 *
 * Dep do effect = [user?.id]:
 *   - Reconecta quando troca de usuário (cenário raro mas possível em
 *     dev/testes)
 *   - Não reconecta em outras mudanças (evita reabrir SSE sem necessidade)
 *   - Autenticação via cookie httpOnly (credentials:"include" em
 *     alertStream.ts), enviado automaticamente pelo browser — não há
 *     token a ler em JS
 *
 * Sobre o toast:
 *   - Variante "warning" (sonner) — entre success (verde) e error (vermelho).
 *     Apropriado pra alerta disparado: é um aviso, não um erro.
 *   - Título dinâmico: usa alert.message se disponível, senão fallback.
 *   - Action button "Ver" → navega pra /alertas?triggered=true (URL sync
 *     que garante que cai no filtro "Disparados" automaticamente).
 *   - duration: 10000ms (10s) — mais longo que o default (4s) porque
 *     alerta é importante e usuário pode estar ausente da tela.
 */
export const useAlertStream = (): void => {
    const { user, isAuthenticated } = useAuth()
    const queryClient = useQueryClient()
    const navigate = useNavigate()

    useEffect(() => {
        if (!isAuthenticated || !user) return

        const cleanup = createAlertStream({
            onAlert: (alert: Alert) => {
                // Invalida cache pra que badges e listas reflitam o novo alerta.
                // alerts.all cobre tanto a inbox global quanto as sections nested.
                queryClient.invalidateQueries({
                    queryKey: queryKeys.alerts.all,
                })

                // Toast com botão "Ver"
                toast.warning(
                    alert.message ?? "Alerta disparado",
                    {
                        description: `Limite de ${formatThresholdKwh(alert.thresholdKwh)} foi ultrapassado.`,
                        duration: 10_000,
                        action: {
                            label: "Ver",
                            onClick: () => {
                                navigate("/alertas?triggered=true")
                            },
                        },
                    },
                )
            },
            onError: (error) => {
                // Erros de SSE são esperados (rede instável, backend reinicia).
                // Não mostramos toast — seria ruidoso. Só logamos em dev.
                if (import.meta.env.DEV) {
                    // eslint-disable-next-line no-console
                    console.warn("[useAlertStream] SSE error:", error)
                }
            },
        })

        return cleanup
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, isAuthenticated])
}