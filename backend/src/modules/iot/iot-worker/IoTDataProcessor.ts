/**
 * IoTDataProcessor — orquestrador central do pipeline de dados IoT
 *
 * Este componente é o "intérprete" entre o mundo físico e o mundo da aplicação.
 * Ele vive entre o IoTConnectionManager (que fala com os sensores) e o
 * ReadingBuffer (que acumula os dados em memória).
 *
 * Fluxo de dados:
 *   Sensor → IConnection.onData → IoTConnectionManager.dataHandler
 *         → IoTDataProcessor.process → ReadingBuffer.add
 *         → SSE broadcast para clientes conectados
 * O processor também é responsável por validar o payload recebido:
 * se o campo "value" não for um número válido, a leitura é descartada
 * com um log de aviso — sem lançar exceções que quebrariam o fluxo do worker.
 *
 * Por que não lançar exceções aqui? Porque este código roda em um loop
 * assíncrono de background, fora do ciclo request/response do Express.
 * Uma exceção não capturada aqui derrubaria o processo inteiro.
 * A estratégia "log and discard" é a correta para workers de longa duração.
 */
import type { IoTConnectionManager } from "@/modules/iot/iot-worker/IoTConnectionManager.js"
import { ReadingBuffer } from "@/modules/iot/iot-worker/ReadingBuffer.js"

// Tipo do handler SSE: recebe o deviceId e o kWh incremental lidos neste segundo.
// O router SSE registra um listener aqui e o remove quando o cliente desconecta.
export type SseListener = (deviceId: string, kwhIncrement: number, receivedAt: Date) => void

export class IoTDataProcessor {
    // Buffer compartilhado — singleton por natureza, pois o processor também é
    // instanciado uma única vez no server.ts.
    readonly buffer = new ReadingBuffer()

    // Lista de listeners SSE ativos. Cada cliente conectado ao endpoint
    // GET /api/iot/stream adiciona um listener aqui.
    private readonly sseListeners = new Set<SseListener>()

    constructor(private readonly manager: IoTConnectionManager) {}

    /**
     * Registra o processor no manager e começa a receber dados.
     * Deve ser chamado uma única vez no boot do servidor, após o manager
     * ter restaurado as conexões do banco.
     */
    start(): void {
        this.manager.onData((deviceId, rawData) => {
            this.process(deviceId, rawData)
        })
    }

    /**
     * Processa um payload bruto recebido de qualquer protocolo.
     * Extrai o campo "value", valida, atualiza o buffer e notifica SSE.
     * 
     * @param deviceId 
     * @param rawData 
     * @returns 
     */
    private process(deviceId: string, rawData: Record<string, unknown>): void {
        const raw = rawData["value"]

        // Valida que o valor é um número positivo — leituras negativas ou
        // ausentes são descartadas silenciosamente com um log de aviso.
        if (typeof raw !== "number" || !isFinite(raw) || raw < 0) {
            console.warn(
                `[IoTProcessor] Leitura inválida descartada — deviceId=${deviceId} value=${String(raw)}`,
            )
            return
        }

        const kwhIncrement = raw
        const receivedAt   = new Date()

        this.buffer.add(deviceId, kwhIncrement)

        // Notifica todos os clientes SSE com a leitura instantânea.
        // Iterar sobre um Set é seguro mesmo se um listener for removido
        // durante a iteração — o Set cria um snapshot estável.
        for (const listener of this.sseListeners) {
            try {
                listener(deviceId, kwhIncrement, receivedAt)
            } catch (err) {
                // Um listener quebrado não deve interromper os demais.
                console.error("[IoTProcessor] Erro em listener SSE:", err)
            }
        }
    }

    /**
     * Adiciona um listener SSE. Retorna uma função de cleanup para remover
     * o listener quando o cliente desconectar — padrão comum em event emitters.
     *    const unsubscribe = processor.addSseListener(handler)
     * 
     * Uso no router:
     *    req.on("close", unsubscribe)
     * 
     * @param listener 
     * @returns 
     */
    addSseListener(listener: SseListener): () => void {
        this.sseListeners.add(listener)
        return () => { this.sseListeners.delete(listener) }
    }

    activeSseCount(): number { return this.sseListeners.size }
}