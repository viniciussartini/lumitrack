import { authService } from "@/services/auth.service"

// Duração da sessão WEB sincronizada com JWT_WEB_EXPIRES_IN do backend (15 min).
// Deve ser atualizado manualmente caso a env var do backend mude — gap
// documentado: sem endpoint de descoberta dinâmica neste ciclo.
const SESSION_DURATION_MS = 15 * 60 * 1000

// Renova em 80% da vida do JWT (~12 min) para folga antes da expiração.
const PROACTIVE_REFRESH_AT_MS = SESSION_DURATION_MS * 0.8

let refreshTimer: ReturnType<typeof setTimeout> | null = null

// Singleton de Promise: se N chamadas concorrentes chegarem enquanto o
// refresh está em voo, todas aguardam o mesmo POST — não disparam N.
let refreshPromise: Promise<void> | null = null

export async function ensureFreshSession(): Promise<void> {
    if (refreshPromise) return refreshPromise

    refreshPromise = authService.refresh().finally(() => {
        refreshPromise = null
    })

    return refreshPromise
}

export function scheduleProactiveRefresh(): void {
    cancelProactiveRefresh()

    refreshTimer = setTimeout(() => {
        refreshTimer = null
        ensureFreshSession()
            .then(() => {
                // Re-agenda para a próxima janela após renovação bem-sucedida.
                scheduleProactiveRefresh()
            })
            .catch(() => {
                // Falha silenciosa — o interceptor reativo de 401 assume o controle.
            })
    }, PROACTIVE_REFRESH_AT_MS)
}

export function cancelProactiveRefresh(): void {
    if (refreshTimer !== null) {
        clearTimeout(refreshTimer)
        refreshTimer = null
    }
}
