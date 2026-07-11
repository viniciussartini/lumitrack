import type { TargetType } from "@/types/meter.types"

/**
 * Tipos compartilhados de Alerta — reformulação IoT (Fase 4).
 * Espelham `backend/src/modules/alert/alert.schema.ts` + `alert.service.ts`.
 *
 * Alertas monitoram uma FAIXA DE POTÊNCIA de um medidor, não mais um
 * threshold de kWh acumulado. `meterId` é imutável após a criação (o
 * medidor já carrega o alvo — propriedade/área/dispositivo).
 *
 * Lifecycle (contínuo, não one-shot):
 *   - Potência sai da faixa [ref×1000×(1−tol%), ref×1000×(1+tol%)] por 3
 *     amostras consecutivas → episódio ABRE (status "firing").
 *   - Volta pra dentro da faixa por 5 amostras consecutivas → episódio
 *     FECHA (status "normal"), gera um AlertTriggerEvent no histórico e
 *     uma notificação efêmera.
 *   - Repete indefinidamente enquanto `enabled`. Não há "readAt"/"disparado
 *     uma vez" — é um monitor contínuo.
 */

/** Alert retornado pela API */
export interface Alert {
    id: string
    userId: string
    meterId: string
    name: string
    referencePowerKw: number
    tolerancePercent: number
    enabled: boolean
    createdAt: string
    updatedAt: string
}

/** Alvo resolvido a partir do medidor — devolvido junto na listagem. */
export interface AlertTarget {
    type: TargetType
    name: string
    /** Rota da details page do alvo — pronta pra navegar. */
    path: string
}

/** Alert com status de disparo e alvo resolvido — shape de GET /api/alerts. */
export interface AlertWithStatus extends Alert {
    status: "firing" | "normal"
    target: AlertTarget | null
}

/** Input do form de criação — body do POST /api/alerts */
export interface CreateAlertInput {
    name: string
    meterId: string
    referencePowerKw: number
    tolerancePercent: number
    enabled?: boolean
}

/** Input do form de edição — body do PUT /api/alerts/:id (meterId imutável) */
export type UpdateAlertInput = Partial<
    Omit<CreateAlertInput, "meterId">
>
