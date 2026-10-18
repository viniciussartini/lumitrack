import { useEffect } from "react"
import type { NavigateFunction } from "react-router"
import { authService } from "@/services/auth.service"
import { cancelProactiveRefresh, scheduleProactiveRefresh } from "@/lib/sessionRefresh"
import { discardSessionData, onSessionChangedElsewhere } from "@/lib/sessionData"
import type { User } from "@/types/auth.types"

/**
 * Reage ao que muda a sessão sem partir desta aba: o servidor derrubando a
 * sessão (`lumitrack:unauthorized`) e outra aba entrando ou saindo. Nos dois
 * casos o que a aba guardou do usuário anterior é descartado. No segundo, o
 * usuário vigente é relido do servidor, porque os cookies já são os da outra
 * aba, e não se avisa de volta (quem recebe o aviso não o repete).
 *
 * @param applyUser - Grava o usuário da sessão no estado de autenticação.
 * @param navigate - Navegação do roteador, usada para voltar ao login.
 */
export const useSessionEvents = (
    applyUser: (user: User | null) => void,
    navigate: NavigateFunction,
): void => {
    useEffect(() => {
        const toLogin = (): void => {
            cancelProactiveRefresh()
            applyUser(null)
            void navigate("/login", { replace: true })
        }

        const handleUnauthorized = (): void => {
            discardSessionData()
            toLogin()
        }

        const stopListening = onSessionChangedElsewhere(() => {
            discardSessionData()
            void authService.getCurrentUser().then((current) => {
                if (!current) return toLogin()
                applyUser(current)
                scheduleProactiveRefresh()
            })
        })

        window.addEventListener("lumitrack:unauthorized", handleUnauthorized)
        return () => {
            window.removeEventListener("lumitrack:unauthorized", handleUnauthorized)
            stopListening()
        }
        // `applyUser` é recriada a cada render e só grava estado e `authState`
        // (estáveis); religar os ouvintes a cada render perderia eventos.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navigate])
}
