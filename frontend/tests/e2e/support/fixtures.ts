import type { Area } from "../../../src/types/area.types"
import type { AlertWithStatus } from "../../../src/types/alert.types"
import type { AlertTriggerEvent } from "../../../src/types/alert-event.types"
import type { User } from "../../../src/types/auth.types"
import type { ConsumptionBucket } from "../../../src/types/consumption.types"
import type { Device } from "../../../src/types/device.types"
import type { Distributor } from "../../../src/types/distributor.types"
import type { Meter } from "../../../src/types/meter.types"
import type { Property } from "../../../src/types/property.types"

/**
 * Fixtures compartilhados dos e2e.
 *
 * Todos são tipados com os types reais do app (`src/types/*`) de propósito:
 * é isso que faz o `tsc` acusar aqui quando um contrato de API mudar, em vez
 * de a suíte só quebrar em runtime meses depois. Foi exatamente esse o buraco
 * que deixou a suíte inteira desatualizada no rework IoT — e o mesmo motivo
 * pelo qual a fixture de `dataExportPdf.test.ts` passou meses com o modelo
 * antigo escondida atrás de um `as unknown as` (ver "Revisão pós-implementação"
 * em .claude/docs/LOG_IMPLEMENTACAO_IOT.md).
 *
 * Os shapes espelham as fontes de verdade já validadas em Vitest:
 * `src/services/alert.service.test.ts` (AlertWithStatus) e
 * `src/services/consumption.service.test.ts` (ConsumptionBucket).
 *
 * Timestamps são literais fixos (não `new Date()`): a data de "agora" não
 * importa para nenhuma assertion, e um valor estável mantém o teste
 * determinístico.
 */

const TIMESTAMP = "2026-07-15T12:00:00.000Z"

/**
 * Usuário autenticado devolvido por `GET /api/auth/me`.
 *
 * Sem campo `role`: o backend o devolve (RBAC, #16), mas o `User` do frontend
 * não o modela e nenhuma tela o lê — incluí-lo aqui só criaria um campo que o
 * type-check não protege.
 */
export const FAKE_USER: User = {
    id: "user-123",
    email: "test@example.com",
    userType: "INDIVIDUAL",
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
    mfaEnabled: false,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
}

/**
 * Distribuidora do catálogo global (somente leitura desde a Fase 1/3 do
 * rework): sem `userId`, sem `kwhPrice` — a tarifa virou TUSD + TE + as três
 * alíquotas aplicadas "por dentro" pelo TariffService.
 */
export const DIST_CEMIG: Distributor = {
    id: "dist-cemig",
    name: "Cemig Distribuição",
    cnpj: "06.981.180/0001-16",
    state: "MG",
    tusdPerKwh: 0.35,
    tePerKwh: 0.29,
    icmsRate: 0.18,
    pisRate: 0.0165,
    cofinsRate: 0.076,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
}

/** Propriedade com os campos que migraram da distribuidora na Fase 1. */
export const PROP_1: Property = {
    id: "prop-1",
    userId: FAKE_USER.id,
    distributorId: DIST_CEMIG.id,
    name: "Casa Principal",
    address: "Rua das Flores, 123",
    city: "Belo Horizonte",
    state: "MG",
    zipCode: "30130-100",
    electricalSystem: "BIPHASIC",
    billingClass: "B1",
    publicLightingFeeBrl: 12.5,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
}

export const AREA_1: Area = {
    id: "area-1",
    propertyId: PROP_1.id,
    name: "Cozinha",
    description: "Área de preparo",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
}

export const DEVICE_1: Device = {
    id: "device-1",
    areaId: AREA_1.id,
    name: "Geladeira",
    brand: "Brastemp",
    model: "BRM54",
    powerWatts: 150,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
}

/**
 * Medidor vinculado ao dispositivo — o shape devolvido por
 * `GET /api/meters/by-target?targetType=DEVICE&targetId=device-1`.
 *
 * Um medidor se vincula a EXATAMENTE UM alvo: `targetType` discrimina qual e
 * os outros dois FKs vêm `null`. Alvo sem medidor → 404, tratado como `null`
 * pelo `meterService.getByTarget`.
 */
export const METER_1: Meter = {
    id: "meter-1",
    name: "Medidor da Geladeira",
    targetType: "DEVICE",
    propertyId: null,
    areaId: null,
    deviceId: DEVICE_1.id,
    protocol: "MQTT",
    host: "localhost",
    port: 1883,
    topic: "lumitrack/meter-1",
    address: null,
    extra: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
}

/**
 * Alerta no modelo de faixa de potência: dispara quando a potência sai de
 * [ref×1000×(1−tol%), ref×1000×(1+tol%)] — aqui [9.8kW, 10.2kW] — por 3
 * amostras consecutivas, e normaliza após 5 dentro da faixa. Não existe mais
 * `thresholdKwh`/`triggeredAt`/`readAt`: é um monitor contínuo, não one-shot.
 */
export const ALERT_1: AlertWithStatus = {
    id: "alert-1",
    userId: FAKE_USER.id,
    meterId: METER_1.id,
    name: "Geladeira fora da faixa",
    referencePowerKw: 10,
    tolerancePercent: 2,
    enabled: true,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    status: "normal",
    target: {
        type: "DEVICE",
        name: DEVICE_1.name,
        path: `/propriedades/${PROP_1.id}/areas/${AREA_1.id}/devices/${DEVICE_1.id}`,
    },
}

/**
 * Episódio de disparo encerrado (`GET /api/alert-events?alertId=`) — histórico
 * somente leitura, persistido pelo `AlertEvaluator` no FIM do episódio
 * (5 amostras consecutivas de volta à faixa). `durationSeconds: 300` produz
 * `formatDurationSeconds` → "5min" exato, sem depender de arredondamento.
 */
export const ALERT_EVENT_1: AlertTriggerEvent = {
    id: "event-1",
    alertId: ALERT_1.id,
    startedAt: "2026-07-15T10:00:00.000Z",
    endedAt: "2026-07-15T10:05:00.000Z",
    durationSeconds: 300,
    minPowerW: 9800,
    maxPowerW: 12500,
    avgPowerW: 11100,
    sampleCount: 18,
}

/**
 * Buckets de consumo agregado (`GET /api/consumption`) — somente leitura.
 *
 * A chave de linha na tabela é o `bucketStart` (ISO do início do bucket), não
 * um id: o bucket é o resultado de um `date_trunc`, não uma entidade.
 * `BUCKET_HOUR_*` são horas cheias; `BUCKET_DAY_*`, dias — coerentes com a
 * granularidade que o spec pedir.
 */
export const BUCKET_HOUR_1: ConsumptionBucket = {
    bucketStart: "2026-07-15T10:00:00.000Z",
    kwhConsumed: 1.24,
    costBrl: 1.08,
    avgPowerW: 1240.5,
}

export const BUCKET_HOUR_2: ConsumptionBucket = {
    bucketStart: "2026-07-15T11:00:00.000Z",
    kwhConsumed: 0.87,
    costBrl: 0.76,
    avgPowerW: 870.2,
}

export const BUCKET_DAY_1: ConsumptionBucket = {
    bucketStart: "2026-07-14T00:00:00.000Z",
    kwhConsumed: 12.5,
    costBrl: 9.375,
    avgPowerW: 520.4,
}

export const BUCKET_DAY_2: ConsumptionBucket = {
    bucketStart: "2026-07-13T00:00:00.000Z",
    kwhConsumed: 18.3,
    costBrl: 13.72,
    avgPowerW: 762.5,
}
