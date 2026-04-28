/**
 * HourlyRollupScheduler — persiste o acumulado horário no banco de dados
 * 
 * Por que persistir HOURLY e não DAILY?
 * Granularidade horária dá ao front-end dados suficientes para construir
 * gráficos detalhados do dia ("qual hora consumi mais?"), enquanto ainda
 * mantém o volume de registros gerenciável: 24 por device por dia, versus
 * 86.400 se persistíssemos segundo a segundo.
 * 
 * Estratégia de scheduling:
 * Usamos setInterval calculado para disparar sempre no início exato da
 * próxima hora (XX:00:00), independente de quando o servidor foi iniciado.
 * Por exemplo, se o servidor sobe às 14:37, o primeiro flush acontece às
 * 15:00:00, o segundo às 16:00:00, e assim por diante.
 * 
 * Por que não usar um cron (node-cron)?
 * Para evitar adicionar uma dependência externa. A lógica de "esperar até
 * a próxima hora" é simples o suficiente para implementar com setTimeout +
 * setInterval, sem bibliotecas extras.
 */
import type { ReadingBuffer } from "@/modules/iot/iot-worker/ReadingBuffer.js"
import type { ConsumptionRepository } from "@/modules/consumption/consumption.repository.js"
import type { DeviceRepository } from "@/modules/device/device.repository.js"
import type { AreaRepository } from "@/modules/area/area.repository.js"
import type { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import type { PropertyRepository } from "@/modules/property/property.repository.js"


/**
 * Tipo do callback de verificação de alertas.
 * Injetado como função em vez do AlertService inteiro para evitar acoplamento
 * à cadeia completa de dependências do service — o scheduler só precisa
 * desta operação específica, não de toda a API do AlertService.
 */
type CheckAndTriggerFn = (
    target: { deviceId: string },
    kwhConsumed: number,
) => Promise<void>
export class HourlyRollupScheduler {
    private flushTimer: ReturnType<typeof setInterval> | null = null
    private alignTimer: ReturnType<typeof setTimeout>  | null = null

    constructor(
        private readonly buffer: ReadingBuffer,
        private readonly consumptionRepository: ConsumptionRepository,
        private readonly deviceRepository: DeviceRepository,
        private readonly areaRepository: AreaRepository,
        private readonly propertyRepository: PropertyRepository,
        private readonly distributorRepository: DistributorRepository,
        private readonly checkAndTrigger?: CheckAndTriggerFn,
    ) {}

    /**
     * Inicia o scheduler, alinhando o primeiro flush ao início da próxima hora.
     * Por exemplo: se chamado às 14:37:22, aguarda 22 minutos e 38 segundos
     * antes de disparar o primeiro flush às 15:00:00.
     */
    start(): void {
        const msUntilNextHour = this.msUntilNextHour()

        console.log(
            `[RollupScheduler] Iniciado. Primeiro flush em ${Math.round(msUntilNextHour / 1000)}s ` +
            `(${new Date(Date.now() + msUntilNextHour).toISOString()})`,
        )

        // Aguarda até o início da próxima hora, depois configura um intervalo
        // de exatamente 1 hora para os flushes subsequentes.
        this.alignTimer = setTimeout(() => {
            // Flush imediato na virada da hora.
            void this.flush()

            // A partir daqui, flush a cada hora exata.
            this.flushTimer = setInterval(() => {
                void this.flush()
            }, 60 * 60 * 1000)
        }, msUntilNextHour)
    }

    /**
     * Para o scheduler — usado no graceful shutdown do servidor.
     */
    stop(): void {
        if (this.alignTimer) {
            clearTimeout(this.alignTimer)
            this.alignTimer = null
        }
        if (this.flushTimer) {
            clearInterval(this.flushTimer)
            this.flushTimer = null
        }
        console.log("[RollupScheduler] Parado.")
    }

    /**
     * Persiste o acumulado de todos os devices com dados no buffer.
     * Exposto como público para facilitar testes — permite forçar um flush
     * manualmente sem precisar esperar a virada da hora.
     * 
     * @returns 
     */
    async flush(): Promise<void> {
        const snapshots = this.buffer.getAllHourlySnapshots()

        if (snapshots.length === 0) {
            return
        }

        console.log(`[RollupScheduler] Flush de ${snapshots.length} device(s)...`)

        // Processa cada device independentemente — a falha de um não deve
        // impedir o flush dos demais. Análogo a um caixa que não para de
        // atender os clientes porque um cupom deu erro de impressão.
        const results = await Promise.allSettled(
            snapshots.map((snapshot) => this.persistSnapshot(snapshot.deviceId, snapshot.kwhAccumulated, snapshot.hourStart)),
        )

        // Zera o buffer de cada device que foi persistido com sucesso.
        // Devices que falharam mantêm seu acumulado para a próxima tentativa.
        for (let i = 0; i < results.length; i++) {
            const result   = results[i]!
            const snapshot = snapshots[i]!

            if (result.status === "fulfilled") {
                this.buffer.clearHourly(snapshot.deviceId)
            } else {
                console.error(
                    `[RollupScheduler] Falha ao persistir deviceId=${snapshot.deviceId}:`,
                    result.reason,
                )
            }
        }
    }

    /**
     * Resolve a hierarquia de um device e persiste o ConsumptionRecord HOURLY.
     * O fluxo é: device → area → property → distributor → kwhPrice → costBrl.
     * Se qualquer elo da cadeia estiver quebrado (device deletado, distribuidora
     * removida), o registro é descartado e logado como erro.
     * 
     * @param deviceId 
     * @param kwhAccumulated 
     * @param hourStart 
     * @returns 
     */
    private async persistSnapshot(
        deviceId: string,
        kwhAccumulated: number,
        hourStart: Date,
    ): Promise<void> {
        // Resolve a cadeia de hierarquia para calcular o costBrl.
        const device = await this.deviceRepository.findById(deviceId)

        if (!device) {
            // Device foi deletado enquanto o buffer ainda tinha dados dele.
            // Descartamos silenciosamente — não há para onde persistir.
            console.warn(`[RollupScheduler] Device não encontrado, descartando: deviceId=${deviceId}`)
            return
        }

        const area = await this.areaRepository.findById(device.areaId)

        if (!area) {
            console.warn(`[RollupScheduler] Área não encontrada, descartando: deviceId=${deviceId}`)
            return
        }

        const property = await this.propertyRepository.findById(area.propertyId)

        if (!property) {
            console.warn(`[RollupScheduler] Propriedade não encontrada, descartando: deviceId=${deviceId}`)
            return
        }

        const distributor = await this.distributorRepository.findById(property.distributorId)

        if (!distributor) {
            console.warn(`[RollupScheduler] Distribuidora não encontrada, descartando: deviceId=${deviceId}`)
            return
        }

        // Unary + garante que o valor é number primitivo — mais seguro que Number()
        // em contextos onde TypeScript pode inferir Number (wrapper) por indireção.
        const kwhPrice: number = +distributor.kwhPrice
        const costBrl: number = kwhAccumulated * kwhPrice

        // Verifica se já existe um registro para esta hora — pode acontecer
        // se o servidor reiniciar dentro da mesma hora e o flush rodar duas vezes.
        const existing = await this.consumptionRepository.findByTargetAndPeriod(
            { deviceId },
            "HOURLY",
            hourStart,
        )

        if (existing) {
            // Já existe — atualiza somando o novo acumulado ao existente.
            // Isso garante que uma reinicialização do servidor não perde dados
            // que já estavam parcialmente persistidos.
            const updatedKwh: number = +existing.kwhConsumed + kwhAccumulated
            const updatedCostBrl: number = updatedKwh * kwhPrice
            await this.consumptionRepository.update(existing.id, { kwhConsumed: updatedKwh }, updatedCostBrl)

            console.log(
                `[RollupScheduler] Atualizado (merge): deviceId=${deviceId} ` +
                `hora=${hourStart.toISOString()} kWh=${updatedKwh.toFixed(6)}`,
            )

            // Verifica alertas com o kWh total acumulado após o merge.
            await this.checkAndTrigger?.({ deviceId }, updatedKwh)

            return
        }

        // Cria o registro HOURLY com o acumulado da hora.
        await this.consumptionRepository.create(
            { deviceId },
            {
                period: "HOURLY",
                referenceDate: hourStart,
                kwhConsumed: kwhAccumulated,
            },
            costBrl,
        )

        console.log(
            `[RollupScheduler] Persistido: deviceId=${deviceId} ` +
            `hora=${hourStart.toISOString()} kWh=${kwhAccumulated.toFixed(6)} costBrl=${costBrl.toFixed(4)}`,
        )

        // Verifica alertas com o kWh acumulado desta hora.
        // Fire-and-forget: uma falha aqui não deve impedir o flush do próximo device.
        await this.checkAndTrigger?.({ deviceId }, kwhAccumulated)
    }

    /**
     * Calcula quantos milissegundos faltam para o início da próxima hora.
     * Exemplo: 14:37:22.500 → faltam (60 - 37) minutos - 22.5 segundos = 1357500 ms
     * 
     * @returns 
     */
    private msUntilNextHour(): number {
        const now = new Date()
        const nextHour = new Date(now)
        nextHour.setHours(now.getHours() + 1, 0, 0, 0)
        return nextHour.getTime() - now.getTime()
    }
}