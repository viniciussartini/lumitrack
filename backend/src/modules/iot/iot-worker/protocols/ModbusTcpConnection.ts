import type { IConnection } from "@/modules/iot/iot-worker/protocols/IConnection.js"
import { logger } from "@/shared/logger/logger.js"

// ─────────────────────────────────────────────────────────────────────────────
// ModbusTcpConnection
//
// Modbus TCP e o protocolo industrial mais comum para leitura de medidores,
// CLPs e sensores via rede Ethernet. Funciona como uma ligacao telefonica
// direta: o backend pergunta ao dispositivo qual e o valor de um registrador.
// E request/response puro — sem push. Por isso usamos polling.
//
// Dependencia: npm install jsmodbus
// ─────────────────────────────────────────────────────────────────────────────

export interface ModbusTcpConnectionConfig {
    meterId: string
    host: string
    port: number
    address: string
    pollingIntervalMs?: number
    unitId?: number
}

export class ModbusTcpConnection implements IConnection {
    readonly meterId: string

    private socket: unknown = null
    private client: unknown = null
    private connected = false
    private pollingTimer: ReturnType<typeof setInterval> | null = null
    private dataHandler: ((data: Record<string, unknown>) => void) | null = null
    private readonly config: ModbusTcpConnectionConfig

    constructor(config: ModbusTcpConnectionConfig) {
        this.meterId = config.meterId
        this.config = config
    }

    async connect(): Promise<void> {
        if (this.connected) {
            return
        }

        const net = await import("net")
        const jsmodbus = await import("jsmodbus")

        this.socket = new net.Socket()
        this.client = new jsmodbus.client.TCP(
            this.socket as import("net").Socket,
            this.config.unitId ?? 1,
        )

        await new Promise<void>((resolve, reject) => {
            const socket = this.socket as import("net").Socket
            socket.connect({ host: this.config.host, port: this.config.port }, () => {
                this.connected = true
                this._startPolling()
                resolve()
            })
            socket.on("error", reject)
        })
    }

    // Modbus e request/response — nao ha push de dados do dispositivo.
    // Polling: a cada intervalo o backend le o registrador configurado.
    private _startPolling(): void {
        const intervalMs = this.config.pollingIntervalMs ?? 5000
        const registerAddress = parseInt(this.config.address, 10)

        this.pollingTimer = setInterval(async () => {
            if (!this.dataHandler || !this.client) {
                return
            }

            try {
                const modbusClient = this.client as {
                    readHoldingRegisters: (addr: number, count: number) => Promise<{
                        response: { body: { values: number[] } }
                    }>
                }
                const result = await modbusClient.readHoldingRegisters(registerAddress, 1)
                const value  = result.response.body.values[0]
                this.dataHandler({ register: this.config.address, value, timestamp: new Date().toISOString() })
            } catch (err) {
                logger.error({ module: "ModbusTCP", meterId: this.meterId, err }, "Erro na leitura")
            }
        }, intervalMs)
    }

    async disconnect(): Promise<void> {
        if (!this.connected) {
            return
        }

        if (this.pollingTimer) {
            clearInterval(this.pollingTimer)
            this.pollingTimer = null
        }

        const socket = this.socket as import("net").Socket
        socket.destroy()
        this.connected = false
        this.socket = null
        this.client = null
    }

    isConnected(): boolean { return this.connected }

    onData(handler: (data: Record<string, unknown>) => void): void {
        this.dataHandler = handler
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ModbusRtuConnection
//
// Modbus RTU roda sobre RS-485 ou RS-232 (serial fisico).
// Nao ha TCP/IP — a comunicacao e feita pela porta serial do servidor.
//
// Dependencia: npm install serialport jsmodbus
// ─────────────────────────────────────────────────────────────────────────────

export interface ModbusRtuConnectionConfig {
    meterId: string
    address: string   // caminho da porta serial, ex: "/dev/ttyUSB0" ou "COM3"
    baudRate?: number   // (do campo extra) padrao 9600
    pollingIntervalMs?: number
    unitId?: number
}

export class ModbusRtuConnection implements IConnection {
    readonly meterId: string

    private port: unknown = null
    private client: unknown = null
    private connected = false
    private pollingTimer: ReturnType<typeof setInterval> | null = null
    private dataHandler: ((data: Record<string, unknown>) => void) | null = null
    private readonly config: ModbusRtuConnectionConfig

    constructor(config: ModbusRtuConnectionConfig) {
        this.meterId = config.meterId
        this.config   = config
    }

    async connect(): Promise<void> {
        if (this.connected) {
            return
        }

        const { SerialPort } = await import("serialport")
        const jsmodbus = await import("jsmodbus")

        this.port = new SerialPort({
            path: this.config.address,
            baudRate: this.config.baudRate ?? 9600,
            autoOpen: false,
        })

        const serialPort = this.port as InstanceType<typeof SerialPort>

        this.client = new jsmodbus.client.RTU(serialPort, this.config.unitId ?? 1)

        await new Promise<void>((resolve, reject) => {
            serialPort.open((err) => {
                if (err) {
                    reject(err)
                    return
                }

                this.connected = true
                this._startPolling()
                resolve()
            })
        })
    }

    private _startPolling(): void {
        const intervalMs = this.config.pollingIntervalMs ?? 5000

        this.pollingTimer = setInterval(async () => {
            if (!this.dataHandler || !this.client) {
                return
            }

            try {
                const modbusClient = this.client as {
                    readHoldingRegisters: (addr: number, count: number) => Promise<{
                        response: { body: { values: number[] } }
                    }>
                }
                const result = await modbusClient.readHoldingRegisters(0, 1)
                const value  = result.response.body.values[0]
                this.dataHandler({ port: this.config.address, value, timestamp: new Date().toISOString() })
            } catch (err) {
                logger.error({ module: "ModbusRTU", meterId: this.meterId, err }, "Erro na leitura")
            }
        }, intervalMs)
    }

    async disconnect(): Promise<void> {
        if (!this.connected) {
            return
        }

        if (this.pollingTimer) {
            clearInterval(this.pollingTimer)
            this.pollingTimer = null
        }
        const serialPort = this.port as { close: (cb?: (err?: Error | null) => void) => void }
        await new Promise<void>((resolve) => serialPort.close(() => resolve()))
        this.connected = false
        this.port = null
        this.client = null
    }

    isConnected(): boolean { return this.connected }

    onData(handler: (data: Record<string, unknown>) => void): void {
        this.dataHandler = handler
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EthernetIpConnection
//
// EtherNet/IP e o protocolo da Rockwell/Allen-Bradley para PLCs industriais.
// Roda sobre TCP/IP e usa o protocolo CIP (Common Industrial Protocol).
//
// Dependencia: npm install ethernet-ip (API v2 — classe PLC, plc.connect(host,
// {slot}), plc.read(tag), plc.disconnect() assincrono)
// ─────────────────────────────────────────────────────────────────────────────

export interface EthernetIpConnectionConfig {
    meterId: string
    host: string
    port?: number
    address?: string   // tag CIP a monitorar, ex: "Motor.Speed"
    pollingIntervalMs?: number
}

export class EthernetIpConnection implements IConnection {
    readonly meterId: string

    private plc: import("ethernet-ip").PLC | null = null
    private connected = false
    private pollingTimer: ReturnType<typeof setInterval> | null = null
    private dataHandler: ((data: Record<string, unknown>) => void) | null = null
    private readonly config: EthernetIpConnectionConfig

    constructor(config: EthernetIpConnectionConfig) {
        this.meterId = config.meterId
        this.config = config
    }

    async connect(): Promise<void> {
        if (this.connected) {
            return
        }

        const { PLC } = await import("ethernet-ip")

        this.plc = new PLC()
        await this.plc.connect(this.config.host, { slot: 0 })
        this.connected = true
        this._startPolling()
    }

    private _startPolling(): void {
        const intervalMs = this.config.pollingIntervalMs ?? 5000
        const tag = this.config.address ?? "output"

        this.pollingTimer = setInterval(async () => {
            if (!this.dataHandler || !this.plc) {
                return
            }

            try {
                const value = await this.plc.read(tag)
                this.dataHandler({ tag, value, timestamp: new Date().toISOString() })
            } catch (err) {
                logger.error({ module: "EthernetIP", meterId: this.meterId, err }, "Erro na leitura")
            }
        }, intervalMs)
    }

    async disconnect(): Promise<void> {
        if (!this.connected) {
            return
        }

        if (this.pollingTimer) {
            clearInterval(this.pollingTimer)
            this.pollingTimer = null
        }

        await this.plc?.disconnect()
        this.connected = false
        this.plc = null
    }

    isConnected(): boolean { return this.connected }

    onData(handler: (data: Record<string, unknown>) => void): void {
        this.dataHandler = handler
    }
}

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
            `Consulte a documentacao em src/modules/iot/iot-worker/protocols/ModbusTcpConnection.ts ` +
            `para instrucoes de implementacao. Address configurado: ${this.config.address}`
        )
    }

    async disconnect(): Promise<void> { /* noop — nunca conectou */ }
    isConnected(): boolean { return this.connected }
    onData(_handler: (data: Record<string, unknown>) => void): void { /* noop */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// ProfinetConnection
//
// PROFINET e o sucessor moderno do PROFIBUS — roda sobre Ethernet padrao
// (TCP/IP e UDP) e e amplamente usado em automacao Siemens moderna.
// Suporta comunicacao em tempo real (RT) e isocrona (IRT).
//
// Dependencia: npm install node-snap7  (S7 PLC — protocolo comum com PROFINET)
// ─────────────────────────────────────────────────────────────────────────────

export interface ProfinetConnectionConfig {
    meterId: string
    host: string
    port?: number
    address?: string   // area de memoria, ex: "DB1" (Data Block 1)
    pollingIntervalMs?: number
    rack?: number   // rack do PLC Siemens (padrao 0)
    slot?: number   // slot da CPU (padrao 1)
}

export class ProfinetConnection implements IConnection {
    readonly meterId: string

    private client: unknown = null
    private connected = false
    private pollingTimer: ReturnType<typeof setInterval> | null = null
    private dataHandler: ((data: Record<string, unknown>) => void) | null = null
    private readonly config: ProfinetConnectionConfig

    constructor(config: ProfinetConnectionConfig) {
        this.meterId = config.meterId
        this.config = config
    }

    async connect(): Promise<void> {
        if (this.connected) {
            return
        }

        const S7 = await import("node-snap7").catch(() => {
            throw new Error(`[Profinet] Pacote "node-snap7" nao encontrado. Execute: npm install node-snap7`)
        })

        this.client = new S7.S7Client()
        const client = this.client as {
            ConnectTo: (host: string, rack: number, slot: number, cb: (err: Error | null) => void) => void
        }

        await new Promise<void>((resolve, reject) => {
            client.ConnectTo(
                this.config.host,
                this.config.rack ?? 0,
                this.config.slot ?? 1,
                (err) => { if (err) reject(err); else { this.connected = true; resolve() } }
            )
        })

        this._startPolling()
    }

    private _startPolling(): void {
        const intervalMs = this.config.pollingIntervalMs ?? 5000
        const dbNumber   = parseInt((this.config.address ?? "DB1").replace("DB", ""), 10) || 1

        this.pollingTimer = setInterval(async () => {
            if (!this.dataHandler || !this.client) {
                return
            }

            try {
                const client = this.client as {
                    DBRead: (db: number, start: number, size: number, cb: (err: Error | null, data: Buffer) => void) => void
                }
                const data = await new Promise<Buffer>((resolve, reject) => {
                    client.DBRead(dbNumber, 0, 10, (err, buf) => { if (err) reject(err); else resolve(buf) })
                })
                this.dataHandler({ db: dbNumber, data: Array.from(data), timestamp: new Date().toISOString() })
            } catch (err) {
                logger.error({ module: "Profinet", meterId: this.meterId, err }, "Erro na leitura")
            }
        }, intervalMs)
    }

    async disconnect(): Promise<void> {
        if (!this.connected) {
            return
        }

        if (this.pollingTimer) {
            clearInterval(this.pollingTimer)
            this.pollingTimer = null
        }

        const client = this.client as { Disconnect: () => void }
        client.Disconnect()
        this.connected = false
        this.client    = null
    }

    isConnected(): boolean { return this.connected }

    onData(handler: (data: Record<string, unknown>) => void): void {
        this.dataHandler = handler
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rs232Connection
//
// RS-232 e uma interface serial ponto-a-ponto — conecta um unico dispositivo
// ao servidor. Muito comum em medidores de energia e equipamentos legados.
// Velocidade tipica: 9600 a 115200 baud.
//
// Dependencia: npm install serialport
// ─────────────────────────────────────────────────────────────────────────────

export interface Rs232ConnectionConfig {
    meterId: string
    address: string
    baudRate?: number
    dataBits?: 5 | 6 | 7 | 8
    stopBits?: 1 | 1.5 | 2
    parity?: "none" | "even" | "odd" | "mark" | "space"
    pollingIntervalMs?: number
}

export class Rs232Connection implements IConnection {
    readonly meterId: string

    private port: unknown = null
    private connected = false
    private buffer: string  = ""
    private dataHandler: ((data: Record<string, unknown>) => void) | null = null
    private readonly config: Rs232ConnectionConfig

    constructor(config: Rs232ConnectionConfig) {
        this.meterId = config.meterId
        this.config   = config
    }

    async connect(): Promise<void> {
        if (this.connected) {
            return
        }

        const { SerialPort } = await import("serialport")

        const serialPort = new SerialPort({
            path: this.config.address,
            baudRate: this.config.baudRate ?? 9600,
            dataBits: this.config.dataBits ?? 8,
            stopBits: this.config.stopBits ?? 1,
            parity: this.config.parity ?? "none",
            autoOpen: false,
        })
        this.port = serialPort

        await new Promise<void>((resolve, reject) => {
            serialPort.open((err) => { if (err) reject(err); else { this.connected = true; resolve() } })
        })

        // RS-232 e ponto-a-ponto orientado a eventos — o dispositivo envia
        // dados quando tem algo a reportar, sem precisar ser interrogado.
        // Acumulamos fragmentos no buffer e processamos linhas completas ().
        serialPort.on("data", (chunk: Buffer) => {
            this.buffer += chunk.toString()
            const lines  = this.buffer.split("\n")
            this.buffer  = lines.pop() ?? ""
            for (const line of lines) {
                const trimmed = line.trim()

                if (!trimmed || !this.dataHandler) {
                    continue
                }

                try {
                    const parsed = JSON.parse(trimmed) as Record<string, unknown>
                    this.dataHandler(parsed)
                } catch {
                    this.dataHandler({ raw: trimmed, timestamp: new Date().toISOString() })
                }
            }
        })
    }

    async disconnect(): Promise<void> {
        if (!this.connected) {
            return
        }

        const serialPort = this.port as { close: (cb?: (err?: Error | null) => void) => void }
        await new Promise<void>((resolve) => serialPort.close(() => resolve()))
        this.connected = false
        this.port = null
        this.buffer = ""
    }

    isConnected(): boolean { return this.connected }

    onData(handler: (data: Record<string, unknown>) => void): void {
        this.dataHandler = handler
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rs485Connection
//
// RS-485 e uma interface serial multipoint (multi-drop) — permite conectar
// ate 32 dispositivos no mesmo par de fios. Muito usado com Modbus RTU,
// medidores de energia e sensores industriais em longas distancias (ate 1200m).
//
// A diferenca principal para RS-232: RS-485 e half-duplex (nao envia e recebe
// ao mesmo tempo) e usa sinal diferencial (mais robusto contra ruido eletrico).
//
// Dependencia: npm install serialport
// ─────────────────────────────────────────────────────────────────────────────

export interface Rs485ConnectionConfig {
    meterId: string
    address: string   // porta serial, ex: "/dev/ttyUSB0" ou "COM3"
    baudRate?: number
    dataBits?: 5 | 6 | 7 | 8
    stopBits?: 1 | 1.5 | 2
    parity?: "none" | "even" | "odd" | "mark" | "space"
    pollingIntervalMs?: number
}

export class Rs485Connection implements IConnection {
    readonly meterId: string

    private port: unknown = null
    private connected = false
    private buffer: string  = ""
    private dataHandler: ((data: Record<string, unknown>) => void) | null = null
    private readonly config: Rs485ConnectionConfig

    constructor(config: Rs485ConnectionConfig) {
        this.meterId = config.meterId
        this.config   = config
    }

    async connect(): Promise<void> {
        if (this.connected) {
            return
        }

        const { SerialPort } = await import("serialport")

        this.port = new SerialPort({
            path: this.config.address,
            baudRate: this.config.baudRate ?? 9600,
            dataBits: this.config.dataBits ?? 8,
            stopBits: this.config.stopBits ?? 1,
            parity: this.config.parity   ?? "none",
            autoOpen: false,
        })

        const serialPort = this.port as InstanceType<typeof SerialPort>

        await new Promise<void>((resolve, reject) => {
            serialPort.open((err) => { if (err) reject(err); else { this.connected = true; resolve() } })
        })

        // RS-485 multipoint — dispositivos enviam dados de forma assincrona.
        // O mesmo padrao de buffer de linhas que o Rs232Connection.
        serialPort.on("data", (chunk: Buffer) => {
            this.buffer += chunk.toString()
            const lines  = this.buffer.split("")
            this.buffer  = lines.pop() ?? ""
            for (const line of lines) {
                const trimmed = line.trim()

                if (!trimmed || !this.dataHandler) {
                    continue
                }

                try {
                    const parsed = JSON.parse(trimmed) as Record<string, unknown>
                    this.dataHandler(parsed)
                } catch {
                    this.dataHandler({ raw: trimmed, port: this.config.address, timestamp: new Date().toISOString() })
                }
            }
        })
    }

    async disconnect(): Promise<void> {
        if (!this.connected) {
            return
        }

        const serialPort = this.port as { close: (cb?: (err?: Error | null) => void) => void }
        await new Promise<void>((resolve) => serialPort.close(() => resolve()))
        this.connected = false
        this.port = null
        this.buffer = ""
    }

    isConnected(): boolean { return this.connected }

    onData(handler: (data: Record<string, unknown>) => void): void {
        this.dataHandler = handler
    }
}