import { ensureFreshSession } from "@/services/api"

// Duração da sessão WEB sincronizada com JWT_WEB_EXPIRES_IN do backend (1h).
// Deve ser atualizado manualmente caso a env var do backend mude — gap
// documentado: sem endpoint de descoberta dinâmica neste ciclo.
const SESSION_DURATION_MS = 60 * 60 * 1000

// Renova em 80% da vida do JWT (~48 min) para folga antes da expiração.
const PROACTIVE_REFRESH_AT_MS = SESSION_DURATION_MS * 0.8

let refreshTimer: ReturnType<typeof setTimeout> | null = null

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
