// ─────────────────────────────────────────────────────────────────────────────
// IConnection — interface comum para todos os protocolos IoT
// Isso permite que o IoTConnectionManager trate todas as conexões de forma
// uniforme, sem precisar saber qual protocolo está por baixo.
// ─────────────────────────────────────────────────────────────────────────────

export interface IConnection {
    readonly meterId: string

    /**
     * Abre a conexão com o dispositivo físico.
     * Deve ser idempotente: chamar connect() em uma conexão já aberta não deve lançar erro.
     */
    connect(): Promise<void>

    /**
     * Encerra a conexão de forma limpa (graceful disconnect).
     * Deve liberar todos os recursos: sockets, timers, handlers de evento.
     */
    disconnect(): Promise<void>

    /**
     * Retorna true se a conexão estiver ativa no momento da chamada.
     * Usado pelo IoTConnectionManager para evitar reconexões desnecessárias.
     */
    isConnected(): boolean

    /**
     * Callback invocado quando um novo dado chega do dispositivo.
     * O dado bruto é passado como Record<string, unknown> para manter
     * flexibilidade — cada protocolo pode ter uma estrutura diferente.
     *
     * @param handler função que recebe o dado e o processa (ex: salva no banco)
     */
    onData(handler: (data: Record<string, unknown>) => void): void
}
