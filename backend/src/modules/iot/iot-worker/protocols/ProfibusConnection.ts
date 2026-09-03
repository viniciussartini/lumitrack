// ─────────────────────────────────────────────────────────────────────────────
// ProfibusConnection — STUB (requer integracao manual)
//
// PROFIBUS DP e um protocolo serial de campo proprietario da Siemens.
// Diferente de MQTT, Modbus ou EtherNet/IP, nao existe uma lib npm publica
// e estavel para comunicacao PROFIBUS a partir do Node.js. A integracao real
// exige hardware especializado (ex: adaptador USB-PROFIBUS da Procentec,
// CP 5711 da Siemens) com drivers nativos e SDKs proprietarios.
//
// Por isso esta implementacao e um stub que documenta o contrato da interface
// e lanca um erro claro em connect(), orientando o desenvolvedor sobre o
// que e necessario para implementar a integracao real.
//
// Como implementar quando necessario:
//   1. Adquirir hardware compativel (ex: Procentec ProfiHub, Siemens CP 5711)
//   2. Instalar o SDK nativo do fabricante no servidor
//   3. Criar um wrapper Node.js usando node-addon-api ou ffi-napi
//   4. Substituir o throw abaixo pela chamada ao wrapper
// ─────────────────────────────────────────────────────────────────────────────

import type { IConnection } from "@/modules/iot/iot-worker/protocols/IConnection.js"

export interface ProfibusConnectionConfig {
    meterId: string
    address: string
    slaveAddress?: number
    pollingIntervalMs?: number
}

export class ProfibusConnection implements IConnection {
    readonly meterId: string
    private connected = false
    private readonly config: ProfibusConnectionConfig

    constructor(config: ProfibusConnectionConfig) {
        this.meterId = config.meterId
        this.config = config
    }

    async connect(): Promise<void> {
        throw new Error(
            `[ProfibusConnection] Protocolo PROFIBUS requer integracao com SDK nativo do fabricante. ` +
                `Consulte a documentacao em src/modules/iot/iot-worker/protocols/ProfibusConnection.ts ` +
                `para instrucoes de implementacao. Address configurado: ${this.config.address}`,
        )
    }

    async disconnect(): Promise<void> {
        /* noop — nunca conectou */
    }
    isConnected(): boolean {
        return this.connected
    }
    onData(_handler: (data: Record<string, unknown>) => void): void {
        /* noop */
    }
}
