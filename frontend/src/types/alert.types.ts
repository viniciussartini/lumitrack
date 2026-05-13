/**
 * Tipos compartilhados de Alerta.
 * Espelham as respostas do backend (AlertResponse + schemas Zod).
 *
 * Polimorfismo: um Alert sempre aponta para EXATAMENTE UMA entidade
 * (property, area OU device). O targetType discrimina qual, e os outros
 * dois FKs vêm como null no JSON.
 *
 * Lifecycle no backend (one-shot):
 *   - Criado com triggeredAt=null, readAt=null → status ACTIVE
 *   - Quando consumo > threshold → triggeredAt preenchido → status TRIGGERED
 *   - markAsRead (manual) → readAt preenchido → status READ
 *   - NÃO há "rearme": editar threshold de um alerta disparado NÃO faz
 *     ele disparar de novo. Para receber novo aviso é preciso excluir
 *     e criar outro. Por isso o frontend esconde "Editar" em disparados
 *     (verificar via `alert.triggeredAt != null`, não via getAlertStatus —
 *     getAlertStatus("READ") também é triggered por implicação).
 */

export type AlertTargetType = "PROPERTY" | "AREA" | "DEVICE"

/** Alert retornado pela API */
export interface Alert {
    id: string
    userId: string
    targetType: AlertTargetType
    /** Preenchido sse targetType === "PROPERTY" */
    propertyId: string | null
    /** Preenchido sse targetType === "AREA" */
    areaId: string | null
    /** Preenchido sse targetType === "DEVICE" */
    deviceId: string | null
    thresholdKwh: number
    message: string | null
    /** Null = nunca disparou. Preenchido = ISO de quando disparou. */
    triggeredAt: string | null
    /** Null = não lido. Preenchido = ISO de quando o usuário marcou como lido. */
    readAt: string | null
    createdAt: string
    updatedAt: string
}

/**
 * Status derivado — não vem do backend, computado no front.
 * Usado para badge visual e filtros.
 */
export type AlertStatus = "ACTIVE" | "TRIGGERED" | "READ"

/**
 * Discriminated union do alvo para criação/edição via formulário.
 * Análogo a ConsumptionFormTarget — declarado já no PR1 mesmo que só
 * seja consumido no PR2 (form + mutations), porque é tipo público
 * usado pelo AlertSection e seus wrappers.
 */
export type AlertFormTarget =
    | { type: "property"; propertyId: string }
    | { type: "area"; propertyId: string; areaId: string }
    | { type: "device"; propertyId: string; areaId: string; deviceId: string }

/** Input do form de criação — body do POST */
export interface CreateAlertInput {
    thresholdKwh: number
    message?: string
}

/** Input do form de edição — body do PUT /api/alerts/:id */
export type UpdateAlertInput = Partial<CreateAlertInput>

/** Query params da listagem global GET /api/alerts */
export interface ListAlertQuery {
    /** true → só disparados; false → só ativos; undefined → todos */
    triggered?: boolean
}

/**
 * Computa o status visual a partir de um Alert.
 *
 * Precedência: READ > TRIGGERED > ACTIVE.
 * Razão: READ é um "estado de leitura" do usuário; o badge mostra o
 * estado mais recente da timeline (ativo → disparado → lido). Quem
 * precisa apenas saber se um alerta JÁ disparou (ex: para decidir se
 * permite editar) deve checar `alert.triggeredAt != null` diretamente,
 * sem passar por este helper.
 */
export const getAlertStatus = (alert: Alert): AlertStatus => {
    if (alert.readAt) return "READ"
    if (alert.triggeredAt) return "TRIGGERED"
    return "ACTIVE"
}

/** Labels em português para os status (UI helper) */
export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
    ACTIVE: "Ativo",
    TRIGGERED: "Disparado",
    READ: "Lido",
}

/** Labels em português para targetType (UI helper) */
export const ALERT_TARGET_TYPE_LABELS: Record<AlertTargetType, string> = {
    PROPERTY: "Propriedade",
    AREA: "Área",
    DEVICE: "Dispositivo",
}