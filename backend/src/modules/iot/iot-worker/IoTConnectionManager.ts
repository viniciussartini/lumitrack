// ─────────────────────────────────────────────────────────────────────────────
// IoTConnectionManager — singleton que gerencia o ciclo de vida das conexões
//
// Analogia: pensa nessa classe como a central telefônica de um prédio.
// Ela não faz ligações — ela sabe quais ramais estão ativos, conecta novos
// ramais quando pedido, desliga ramais que não são mais necessários, e
// garante que não existam duas ligações para o mesmo ramal ao mesmo tempo.
//
// Por que singleton? Porque todo o processo Node.js deve compartilhar
// o mesmo mapa de conexões ativas. Se cada requisição criasse sua própria
// instância do manager, conexões duplicadas seriam abertas para o mesmo
// medidor — desperdiçando recursos e causando conflitos.
//
// Separação de responsabilidades:
//   - MeterService (módulo de negócio): CRUD dos medidores no banco
//   - IoTConnectionManager (worker): gerencia conexões reais em memória
//
// O service notifica o manager via start/stop/restart. O manager não toca
// no banco — só mantém o Map<meterId, IConnection> atualizado.
//
// A chave do Map é meterId, não deviceId — a config de conexão vem do
// Meter, que pode estar vinculado a Property, Area ou Device (não é 1:1
// com Device).
// ─────────────────────────────────────────────────────────────────────────────

import type { IConnection } from "@/modules/iot/iot-worker/protocols/IConnection.js"
import { IoTProtocol } from "@/generated/prisma/client.js"
import { logger } from "@/shared/logger/logger.js"
import { checkOutboundHost } from "@/shared/security/outboundHost.js"
import { env } from "@/config/env.js"
import { connectionConfigSchema } from "@/modules/iot/iot-worker/connectionConfigSchema.js"

const log = logger.child({ module: "IoTManager" })
import { MqttConnection } from "@/modules/iot/iot-worker/protocols/MqttConnection.js"
import { ModbusTcpConnection } from "@/modules/iot/iot-worker/protocols/ModbusTcpConnection.js"
import { ModbusRtuConnection } from "@/modules/iot/iot-worker/protocols/ModbusRtuConnection.js"
import { EthernetIpConnection } from "@/modules/iot/iot-worker/protocols/EthernetIpConnection.js"
import { ProfibusConnection } from "@/modules/iot/iot-worker/protocols/ProfibusConnection.js"
import { ProfinetConnection } from "@/modules/iot/iot-worker/protocols/ProfinetConnection.js"
import { Rs232Connection } from "@/modules/iot/iot-worker/protocols/Rs232Connection.js"
import { Rs485Connection } from "@/modules/iot/iot-worker/protocols/Rs485Connection.js"

// Config de conexão de um medidor — subconjunto do MeterResponse do módulo
// meter, mantido aqui para não acoplar o worker ao módulo de negócio.
export interface MeterConnectionConfig {
    meterId: string
    protocol: IoTProtocol
    host: string | null
    port: number | null
    topic: string | null
    address: string | null
    extra: Record<string, unknown> | null
}

// Com exactOptionalPropertyTypes: true, não podemos espalhar um valor
// possivelmente undefined num objeto cujo tipo não aceita undefined
// explícito — os helpers abaixo constroem cada config condicionalmente,
// só com os campos opcionais que de fato vieram definidos.
function withOptional<T, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
    if (value !== undefined) {
        target[key] = value
    }
}

function createConnection(config: MeterConnectionConfig): IConnection {
    // Substitui os non-null assertions que existiam aqui — um Meter
    // restaurado do banco no boot (server.ts) não passa pela validação de
    // escrita (createMeterSchema/updateMeterSchema, módulo `meter`)
    // nenhuma vez; um registro corrompido ou desatualizado agora falha com
    // erro claro em vez de coagir `null` para `string` silenciosamente.
    const parsed = connectionConfigSchema.parse(config)

    switch (parsed.protocol) {
        case "MQTT": {
            const mqttConfig: ConstructorParameters<typeof MqttConnection>[0] = {
                meterId: parsed.meterId,
                host: parsed.host,
                port: parsed.port,
                topic: parsed.topic,
            }
            withOptional(mqttConfig, "username", parsed.extra?.username)
            withOptional(mqttConfig, "password", parsed.extra?.password)

            return new MqttConnection(mqttConfig)
        }

        case "MODBUS_TCP": {
            const modbusTcpConfig: ConstructorParameters<typeof ModbusTcpConnection>[0] = {
                meterId: parsed.meterId,
                host: parsed.host,
                port: parsed.port,
                address: parsed.address,
                currentAddress: parsed.extra.currentAddress,
                powerAddress: parsed.extra.powerAddress,
                powerFactorAddress: parsed.extra.powerFactorAddress,
            }
            withOptional(modbusTcpConfig, "pollingIntervalMs", parsed.extra.pollingIntervalMs)
            withOptional(modbusTcpConfig, "unitId", parsed.extra.unitId)

            return new ModbusTcpConnection(modbusTcpConfig)
        }

        case "MODBUS_RTU": {
            const modbusRtuConfig: ConstructorParameters<typeof ModbusRtuConnection>[0] = {
                meterId: parsed.meterId,
                address: parsed.address,
                voltageAddress: parsed.extra.voltageAddress,
                currentAddress: parsed.extra.currentAddress,
                powerAddress: parsed.extra.powerAddress,
                powerFactorAddress: parsed.extra.powerFactorAddress,
            }
            withOptional(modbusRtuConfig, "baudRate", parsed.extra.baudRate)
            withOptional(modbusRtuConfig, "pollingIntervalMs", parsed.extra.pollingIntervalMs)
            withOptional(modbusRtuConfig, "unitId", parsed.extra.unitId)

            return new ModbusRtuConnection(modbusRtuConfig)
        }

        case "ETHERNET_IP": {
            const ethernetConfig: ConstructorParameters<typeof EthernetIpConnection>[0] = {
                meterId: parsed.meterId,
                host: parsed.host,
                address: parsed.address,
                currentAddress: parsed.extra.currentAddress,
                powerAddress: parsed.extra.powerAddress,
                powerFactorAddress: parsed.extra.powerFactorAddress,
            }
            withOptional(ethernetConfig, "port", parsed.port ?? undefined)
            withOptional(ethernetConfig, "pollingIntervalMs", parsed.extra.pollingIntervalMs)

            return new EthernetIpConnection(ethernetConfig)
        }

        case "PROFIBUS": {
            const profibusConfig: ConstructorParameters<typeof ProfibusConnection>[0] = {
                meterId: parsed.meterId,
                address: parsed.address,
            }
            withOptional(profibusConfig, "slaveAddress", parsed.extra?.slaveAddress)
            withOptional(profibusConfig, "pollingIntervalMs", parsed.extra?.pollingIntervalMs)

            return new ProfibusConnection(profibusConfig)
        }

        case "PROFINET": {
            const profinetConfig: ConstructorParameters<typeof ProfinetConnection>[0] = {
                meterId: parsed.meterId,
                host: parsed.host,
                address: parsed.address,
                currentAddress: parsed.extra.currentAddress,
                powerAddress: parsed.extra.powerAddress,
                powerFactorAddress: parsed.extra.powerFactorAddress,
            }
            withOptional(profinetConfig, "port", parsed.port ?? undefined)
            withOptional(profinetConfig, "pollingIntervalMs", parsed.extra.pollingIntervalMs)
            withOptional(profinetConfig, "rack", parsed.extra.rack)
            withOptional(profinetConfig, "slot", parsed.extra.slot)

            return new ProfinetConnection(profinetConfig)
        }

        case "RS232": {
            const rs232Config: ConstructorParameters<typeof Rs232Connection>[0] = {
                meterId: parsed.meterId,
                address: parsed.address,
            }
            withOptional(rs232Config, "baudRate", parsed.extra?.baudRate)
            withOptional(rs232Config, "pollingIntervalMs", parsed.extra?.pollingIntervalMs)

            return new Rs232Connection(rs232Config)
        }

        case "RS485": {
            const rs485Config: ConstructorParameters<typeof Rs485Connection>[0] = {
                meterId: parsed.meterId,
                address: parsed.address,
            }
            withOptional(rs485Config, "baudRate", parsed.extra?.baudRate)
            withOptional(rs485Config, "pollingIntervalMs", parsed.extra?.pollingIntervalMs)

            return new Rs485Connection(rs485Config)
        }
    }
}

export class IoTConnectionManager {
    private readonly connections = new Map<string, IConnection>()
    private dataHandler: ((meterId: string, data: Record<string, unknown>) => void) | null = null

    private static instance: IoTConnectionManager | null = null
    private constructor() {}

    static getInstance(): IoTConnectionManager {
        if (!IoTConnectionManager.instance) {
            IoTConnectionManager.instance = new IoTConnectionManager()
        }
        return IoTConnectionManager.instance
    }

    onData(handler: (meterId: string, data: Record<string, unknown>) => void): void {
        this.dataHandler = handler
    }

    // Revalida o destino (SSRF — A01) imediatamente antes de conectar,
    // não só na escrita (MeterService.assertOutboundHostAllowed). `start()`
    // é o único funil por onde toda conexão real passa: criação, restart via
    // update E restauração no boot do servidor (server.ts, um Meter por
    // Meter já existente no banco, validado só uma vez — potencialmente dias
    // ou meses atrás). Sem isso, um host cujo DNS aponte pra um endereço
    // interno DEPOIS da validação original (DNS rebinding) reconecta sem
    // checagem em todo restart do processo — a validação em `MeterService`
    // sozinha cobre apenas o instante do create/update, não a vida útil da
    // conexão. Resolve de novo aqui em vez de fixar (pin) o IP validado
    // porque os 4 protocolos de rede (mqtt, net.Socket, ethernet-ip, node-snap7)
    // não expõem um jeito uniforme de conectar por IP já resolvido sem reescrever cada adapter;
    // revalidar a cada tentativa de conexão já reduz a janela de exploração
    // de "indefinida" para o intervalo entre esta chamada e o connect() log
    // abaixo — na prática, milissegundos.
    private async assertOutboundHostAllowed(config: MeterConnectionConfig): Promise<boolean> {
        if (config.host === null || config.port === null) return true

        const result = await checkOutboundHost(config.host, config.port, env.IOT_ALLOWED_HOSTS)
        if (!result.allowed) {
            log.error(
                { meterId: config.meterId, host: config.host, reason: result.reason },
                "Conexão de saída recusada (SSRF)",
            )
        }
        return result.allowed
    }

    async start(config: MeterConnectionConfig): Promise<void> {
        if (this.connections.has(config.meterId)) {
            log.info({ meterId: config.meterId }, "Já está conectado. Ignorando.")
            return
        }

        if (!(await this.assertOutboundHostAllowed(config))) {
            return
        }

        let connection: IConnection
        try {
            connection = createConnection(config)
        } catch (err) {
            log.error(
                { meterId: config.meterId, protocol: config.protocol, err },
                "Config de conexão inválida — recusando iniciar",
            )
            return
        }

        connection.onData((data) => {
            this.dataHandler?.(config.meterId, data)
        })

        try {
            await connection.connect()
            this.connections.set(config.meterId, connection)
            log.info({ meterId: config.meterId, protocol: config.protocol }, "Conectado")
        } catch (err) {
            log.error({ meterId: config.meterId, err }, "Falha ao conectar")
        }
    }

    async stop(meterId: string): Promise<void> {
        const connection = this.connections.get(meterId)

        if (!connection) {
            return
        }

        await connection.disconnect()
        this.connections.delete(meterId)
        log.info({ meterId }, "Desconectado")
    }

    async restart(config: MeterConnectionConfig): Promise<void> {
        await this.stop(config.meterId)
        await this.start(config)
    }

    activeCount(): number {
        return this.connections.size
    }

    async stopAll(): Promise<void> {
        const meterIds = [...this.connections.keys()]
        await Promise.allSettled(meterIds.map((id) => this.stop(id)))
        log.info("Todas as conexões encerradas.")
    }
}
