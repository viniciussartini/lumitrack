// ─────────────────────────────────────────────────────────────────────────────
// PollingLoop — laço de polling robusto, compartilhado pelos adaptadores
// request/response (Modbus TCP/RTU, EtherNet/IP, Profinet).
//
// Corrige 3 lacunas que existiam em cada `_startPolling` antes desta issue:
//   1. Reentrância por tick: um `setInterval` cru dispara de novo mesmo se o
//      tick anterior ainda não terminou — uma leitura mais lenta que o
//      intervalo empilhava execuções concorrentes sobre a mesma conexão.
//   2. Timeout: nenhuma chamada de leitura tinha limite de tempo — um socket
//      travado bloqueava o tick indefinidamente, sem nunca liberar o próximo.
//   3. Falhas consecutivas nunca eram tratadas como "conexão morta" — um
//      transporte que caiu ficava tentando ler para sempre, sem nunca
//      reconectar (ver reconnectBackoff.ts, acionado via onUnhealthy).
// ─────────────────────────────────────────────────────────────────────────────

export interface PollingLoopOptions {
    intervalMs: number
    // Teto de tempo por leitura — default é o próprio intervalo (uma leitura
    // não pode legitimamente demorar mais que o intervalo entre leituras).
    timeoutMs?: number
    // Falhas consecutivas até considerar o transporte morto e acionar
    // onUnhealthy. Default 3 — tolera uma falha isolada de rede sem
    // reconectar por excesso de zelo, mas não deixa uma conexão morta
    // tentando para sempre.
    maxConsecutiveFailures?: number
    readSample: () => Promise<Record<string, unknown>>
    onSample: (sample: Record<string, unknown>) => void
    onError: (err: unknown) => void
    onUnhealthy: () => void
    // Pulo sem erro (não conta como falha) — usado para "sem dataHandler
    // registrado ainda" ou "conexão já não está mais ativa".
    shouldRun?: () => boolean
}

export class PollingLoop {
    private timer: ReturnType<typeof setInterval> | null = null
    private inFlight = false
    private consecutiveFailures = 0

    constructor(private readonly options: PollingLoopOptions) {}

    start(): void {
        if (this.timer) {
            return
        }
        this.timer = setInterval(() => {
            void this._tick()
        }, this.options.intervalMs)
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = null
        }
        this.consecutiveFailures = 0
    }

    private async _tick(): Promise<void> {
        if (this.inFlight) {
            return
        }
        if (this.options.shouldRun && !this.options.shouldRun()) {
            return
        }

        this.inFlight = true
        try {
            const timeoutMs = this.options.timeoutMs ?? this.options.intervalMs
            const sample = await this._withTimeout(this.options.readSample(), timeoutMs)
            this.consecutiveFailures = 0
            this.options.onSample(sample)
        } catch (err) {
            this.consecutiveFailures += 1
            this.options.onError(err)

            if (this.consecutiveFailures >= (this.options.maxConsecutiveFailures ?? 3)) {
                this.consecutiveFailures = 0
                this.options.onUnhealthy()
            }
        } finally {
            this.inFlight = false
        }
    }

    private _withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Leitura excedeu o timeout de ${timeoutMs}ms`))
            }, timeoutMs)

            promise.then(
                (value) => {
                    clearTimeout(timer)
                    resolve(value)
                },
                (err: unknown) => {
                    clearTimeout(timer)
                    reject(err)
                },
            )
        })
    }
}
