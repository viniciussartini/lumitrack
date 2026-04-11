/**
 * ReadingBuffer — buffer em memória para leituras IoT por device
 * 
 * O buffer mantém dois valores distintos:
 *   - hourlyAccumulator: soma de todos os kWh recebidos na hora em curso
 *                         (será persistido no banco ao final da hora)
 *    - lastReading:       o valor mais recente recebido do sensor
 *                         (será transmitido ao front-end via SSE)
 * 
 *  O acumulador serve para o histórico.
 *  A última leitura serve para o dashboard em tempo real.
 */

export type DeviceReading = {
    deviceId: string
    kwhConsumed: Number
    receivedAt: Date
}

export type HourlySnapshot = {
    deviceId: string
    kwhAccumulated: number
    hourStart: Date
}

export class ReadingBuffer {
    private readonly hourly = new Map<string, { kwh: number; hourStart: Date }>()

    // Última leitura recebida por device — usado exclusivamente pelo SSE.
    private readonly latest = new Map<string, DeviceReading>()

    /**
     *  Adiciona uma nova leitura incremental ao buffer do device.
     * Se é a primeira leitura da hora, inicializa o acumulador com o
     * início da hora atual (truncado em minutos e segundos).
     * 
     * @param deviceId 
     * @param kwhIncrement 
     */
    add(deviceId: string, kwhIncrement: number): void {
        const now = new Date()
        const hourStart = this.truncateToHour(now)

        const existing = this.hourly.get(deviceId)

        if (!existing || existing.hourStart.getTime() !== hourStart.getTime()) {
            // Primeira leitura desta hora para este device — ou virada de hora
            // enquanto o servidor estava rodando sem receber dados deste device.
            this.hourly.set(deviceId, { kwh: kwhIncrement, hourStart })
        } else {
            // Mesma hora — apenas soma ao acumulador existente.
            existing.kwh += kwhIncrement
        }

        // Atualiza a leitura mais recente para SSE.
        this.latest.set(deviceId, { deviceId, kwhConsumed: kwhIncrement, receivedAt: now })
    }

    /**
     *  Retorna o snapshot atual da hora para um device específico.
     *  Chamado pelo HourlyRollupScheduler no momento do flush.
     * 
     * @param deviceId 
     * @returns 
     */
    getHourlySnapshot(deviceId: string): HourlySnapshot | null {
        const entry = this.hourly.get(deviceId)

        if (!entry) {
            return null
        }

        return {
            deviceId,
            kwhAccumulated: entry.kwh,
            hourStart:      entry.hourStart,
        }
    }

    /**
     *  Retorna snapshots de todos os devices que têm dados acumulados.
     *  Usado pelo scheduler para fazer o rollup completo de uma vez.
     * 
     * @returns 
     */
    getAllHourlySnapshots(): HourlySnapshot[] {
        const snapshots: HourlySnapshot[] = []

        for (const [deviceId, entry] of this.hourly.entries()) {
            snapshots.push({
                deviceId,
                kwhAccumulated: entry.kwh,
                hourStart:      entry.hourStart,
            })
        }

        return snapshots
    }

    /**
     *  Remove o acumulador de um device após o flush.
     *  É chamado pelo scheduler imediatamente após persistir o registro,
     *  garantindo que a próxima leitura inicie um novo acumulador zerado.
     * 
     * @param deviceId 
     */
    clearHourly(deviceId: string): void {
        this.hourly.delete(deviceId)
    }

    /**
     *  Retorna a última leitura recebida de um device (para SSE).
     * 
     * @param deviceId 
     * @returns 
     */
    getLatest(deviceId: string): DeviceReading | null {
        return this.latest.get(deviceId) ?? null
    }

    /**
     * Retorna todas as últimas leituras (para SSE broadcast de todos os devices).
     * 
     * @returns 
     */
    getAllLatest(): DeviceReading[] {
        return [...this.latest.values()]
    }

    /**
     *  Quantidade de devices com dados em buffer — útil para logs e health checks.
     * 
     * @returns 
     */
    activeDeviceCount(): number {
        return this.hourly.size
    }

    /**
     * Trunca um Date para o início da hora (zera minutos, segundos e milissegundos).
     * Exemplo: 2025-01-15T14:37:22.500Z → 2025-01-15T14:00:00.000Z
     * Isso garante que o referenceDate do ConsumptionRecord seja sempre
     * o início exato da hora, independente de quando a primeira leitura chegou.
     * 
     * @param date 
     * @returns 
     */
    private truncateToHour(date: Date): Date {
        const d = new Date(date)
        d.setMinutes(0, 0, 0)
        return d
    }
}