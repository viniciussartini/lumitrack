/**
 * Episódio de disparo de um alerta — histórico somente leitura.
 * Espelha `backend/src/modules/alert/alert-trigger-event.repository.ts`.
 * Persistido pelo AlertEvaluator no FIM do episódio (quando a potência volta
 * a ficar dentro da faixa por 5 amostras consecutivas).
 */
export interface AlertTriggerEvent {
    id: string
    alertId: string
    startedAt: string
    endedAt: string
    durationSeconds: number
    minPowerW: number
    maxPowerW: number
    avgPowerW: number
    sampleCount: number
}

/** Query params de GET /api/alert-events */
export interface ListAlertEventParams {
    alertId: string
    page?: number
    pageSize?: number
}
