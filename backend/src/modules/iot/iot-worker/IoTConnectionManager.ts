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
// device — desperdiçando recursos e causando conflitos.
//
// Separação de responsabilidades:
//   - IoTService (módulo de negócio): CRUD das configs no banco
//   - IoTConnectionManager (worker): gerencia conexões reais em memória
//
// O service notifica o manager via start/stop/restart. O manager não toca
// no banco — só mantém o Map<deviceId, IConnection> atualizado.
// ─────────────────────────────────────────────────────────────────────────────

import type { IConnection } from "@/modules/iot/iot-worker/protocols/IConnection.js"
import type { IoTConfigResponse } from "@/modules/iot/iot.repository.js"
import { logger } from "@/shared/logger/logger.js"

const log = logger.child({ module: "IoTManager" })
import { MqttConnection } from "@/modules/iot/iot-worker/protocols/MqttConnection.js"
import {
    ModbusTcpConnection,
    ModbusRtuConnection,
    EthernetIpConnection,
    ProfibusConnection,
    ProfinetConnection,
    Rs232Connection,
    Rs485Connection,
} from "@/modules/iot/iot-worker/protocols/ModbusTcpConnection.js"

// Extrai campos opcionais do  de forma segura.
// Retorna undefined (nao null) para respeitar exactOptionalPropertyTypes
// das interfaces de config dos protocolos.
function extraField<T>(extra: Record<string, unknown>, key: string): T | undefined {
    const val = extra[key]
    return val !== undefined && val !== null ? (val as T) : undefined
}

function createConnection(config: IoTConfigResponse): IConnection {
    const extra = (config.extra ?? {}) as Record<string, unknown>

    switch (config.protocol) {
        case "MQTT": {
            // Com exactOptionalPropertyTypes: true, nao podemos espalhar
            //  num objeto cujo tipo nao aceita undefined explicito.
            // Construimos o config condicionalmente.
            const mqttConfig: ConstructorParameters<typeof MqttConnection>[0] = {
                deviceId: config.deviceId,
                host: config.host!,
                port: config.port!,
                topic: config.topic!,
            }
            const username = extraField<string>(extra, "username")
            const password = extraField<string>(extra, "password")

            if (username !== undefined) {
                mqttConfig.username = username
            }

            if (password !== undefined) {
                mqttConfig.password = password
            }

            return new MqttConnection(mqttConfig)
        }

        case "MODBUS_TCP": {
            const modbusTcpConfig: ConstructorParameters<typeof ModbusTcpConnection>[0] = {
                deviceId: config.deviceId,
                host: config.host!,
                port: config.port!,
                address: config.address!,
            }
            const pollingIntervalMs = extraField<number>(extra, "pollingIntervalMs")
            const unitId            = extraField<number>(extra, "unitId")

            if (pollingIntervalMs !== undefined) {
                modbusTcpConfig.pollingIntervalMs = pollingIntervalMs
            }

            if (unitId !== undefined) {
                modbusTcpConfig.unitId = unitId
            }

            return new ModbusTcpConnection(modbusTcpConfig)
        }

        case "MODBUS_RTU": {
            const modbusRtuConfig: ConstructorParameters<typeof ModbusRtuConnection>[0] = {
                deviceId: config.deviceId,
                address:  config.address!,
            }
            const baudRate = extraField<number>(extra, "baudRate")
            const pollingIntervalMs = extraField<number>(extra, "pollingIntervalMs")
            const unitId = extraField<number>(extra, "unitId")

            if (baudRate !== undefined) {
                modbusRtuConfig.baudRate = baudRate
            }

            if (pollingIntervalMs !== undefined) {
                modbusRtuConfig.pollingIntervalMs = pollingIntervalMs
            }

            if (unitId !== undefined) {
                modbusRtuConfig.unitId = unitId
            }

            return new ModbusRtuConnection(modbusRtuConfig)
        }

        case "ETHERNET_IP": {
            const ethernetConfig: ConstructorParameters<typeof EthernetIpConnection>[0] = {
                deviceId: config.deviceId,
                host: config.host!,
            }
            const port = config.port   !== null ? config.port   : undefined
            const address = config.address !== null ? config.address : undefined
            const pollingIntervalMs = extraField<number>(extra, "pollingIntervalMs")

            if (port !== undefined) {
                ethernetConfig.port = port
            }

            if (address !== undefined) {
                ethernetConfig.address = address
            }

            if (pollingIntervalMs !== undefined) {
                ethernetConfig.pollingIntervalMs = pollingIntervalMs
            }

            return new EthernetIpConnection(ethernetConfig)
        }

        case "PROFIBUS": {
            const profibusConfig: ConstructorParameters<typeof ProfibusConnection>[0] = {
                deviceId: config.deviceId,
                address: config.address!,
            }
            const slaveAddress = extraField<number>(extra, "slaveAddress")
            const pollingIntervalMs = extraField<number>(extra, "pollingIntervalMs")

            if (slaveAddress !== undefined) {
                profibusConfig.slaveAddress = slaveAddress
            }

            if (pollingIntervalMs !== undefined) {
                profibusConfig.pollingIntervalMs = pollingIntervalMs
            }

            return new ProfibusConnection(profibusConfig)
        }

        case "PROFINET": {
            const profinetConfig: ConstructorParameters<typeof ProfinetConnection>[0] = {
                deviceId: config.deviceId,
                host: config.host!,
            }
            const port = config.port   !== null ? config.port   : undefined
            const address = config.address !== null ? config.address : undefined
            const pollingIntervalMs = extraField<number>(extra, "pollingIntervalMs")
            const rack = extraField<number>(extra, "rack")
            const slot = extraField<number>(extra, "slot")

            if (port !== undefined) {
                profinetConfig.port = port
            }

            if (address !== undefined) {
                profinetConfig.address = address
            }

            if (pollingIntervalMs !== undefined) {
                profinetConfig.pollingIntervalMs = pollingIntervalMs
            }

            if (rack !== undefined) {
                profinetConfig.rack = rack
            }

            if (slot !== undefined) {
                profinetConfig.slot = slot
            }

            return new ProfinetConnection(profinetConfig)
        }

        case "RS232": {
            const rs232Config: ConstructorParameters<typeof Rs232Connection>[0] = {
                deviceId: config.deviceId,
                address:  config.address!,
            }
            const baudRate = extraField<number>(extra, "baudRate")
            const pollingIntervalMs = extraField<number>(extra, "pollingIntervalMs")

            if (baudRate !== undefined) {
                rs232Config.baudRate = baudRate
            }

            if (pollingIntervalMs !== undefined) {
                rs232Config.pollingIntervalMs = pollingIntervalMs
            }

            return new Rs232Connection(rs232Config)
        }

        case "RS485": {
            const rs485Config: ConstructorParameters<typeof Rs485Connection>[0] = {
                deviceId: config.deviceId,
                address:  config.address!,
            }
            const baudRate = extraField<number>(extra, "baudRate")
            const pollingIntervalMs = extraField<number>(extra, "pollingIntervalMs")

            if (baudRate !== undefined) {
                rs485Config.baudRate = baudRate
            }

            if (pollingIntervalMs !== undefined) {
                rs485Config.pollingIntervalMs = pollingIntervalMs
            }

            return new Rs485Connection(rs485Config)
        }
    }
}

export class IoTConnectionManager {
    private readonly connections = new Map<string, IConnection>()
    private dataHandler: ((deviceId: string, data: Record<string, unknown>) => void) | null = null

    private static instance: IoTConnectionManager | null = null
    private constructor() {}

    static getInstance(): IoTConnectionManager {
        if (!IoTConnectionManager.instance) {
            IoTConnectionManager.instance = new IoTConnectionManager()
        }
        return IoTConnectionManager.instance
    }

    onData(handler: (deviceId: string, data: Record<string, unknown>) => void): void {
        this.dataHandler = handler
    }

    async start(config: IoTConfigResponse): Promise<void> {
        if (this.connections.has(config.deviceId)) {
            log.info({ deviceId: config.deviceId }, "Já está conectado. Ignorando.")
            return
        }

        const connection = createConnection(config)
        connection.onData((data) => { this.dataHandler?.(config.deviceId, data) })

        try {
            await connection.connect()
            this.connections.set(config.deviceId, connection)
            log.info({ deviceId: config.deviceId, protocol: config.protocol }, "Conectado")
        } catch (err) {
            log.error({ deviceId: config.deviceId, err }, "Falha ao conectar")
        }
    }

    async stop(deviceId: string): Promise<void> {
        const connection = this.connections.get(deviceId)

        if (!connection) {
            return
        }

        await connection.disconnect()
        this.connections.delete(deviceId)
        log.info({ deviceId }, "Desconectado")
    }

    async restart(config: IoTConfigResponse): Promise<void> {
        await this.stop(config.deviceId)
        await this.start(config)
    }

    activeCount(): number { return this.connections.size }

    async stopAll(): Promise<void> {
        const deviceIds = [...this.connections.keys()]
        await Promise.allSettled(deviceIds.map((id) => this.stop(id)))
        log.info("Todas as conexões encerradas.")
    }
}