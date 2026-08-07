/**
 * Tipos compartilhados de Dispositivo.
 *
 * Hierarquia: dispositivo é SEMPRE filho de uma área, que é filha de uma
 * propriedade. Por isso operações no service exigem propertyId + areaId
 * além do deviceId.
 *
 * Campos nullable do backend:
 *   - brand / model: String? no Prisma → null quando ausente
 *   - powerWatts: Float? no Prisma → null quando ausente
 *
 * No POST/PUT, campos opcionais omitidos são tratados como undefined
 * pelo backend (ver device.repository: `data.brand ?? null`, etc).
 */

export interface Device {
    id: string
    areaId: string
    name: string
    brand: string | null
    model: string | null
    powerWatts: number | null
    createdAt: string
    updatedAt: string
}

/**
 * Input do form de criação — body do POST
 *   /api/properties/:propertyId/areas/:areaId/devices
 *
 * propertyId e areaId NÃO entram no body — vêm da URL.
 */
export interface CreateDeviceInput {
    name: string
    brand?: string
    model?: string
    powerWatts?: number
}

/**
 * Input do form de edição.
 * Tudo opcional — o backend faz `Object.fromEntries(...filter(undefined))`
 * pra não sobrescrever campos existentes com null inadvertidamente.
 */
export type UpdateDeviceInput = Partial<CreateDeviceInput>
