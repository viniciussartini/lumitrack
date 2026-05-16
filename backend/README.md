# ⚡ LumiTrack - Documentação Back-end

---

## Índice

- [Sobre](#sobre)
- [Arquitetura e Tecnologias](#arquitetura-e-tecnologias)
- [Diagramas](#diagramas)
  - [Casos de Uso](#1-diagrama-de-casos-de-uso)
  - [Entidade-Relacionamento](#2-diagrama-entidade-relacionamento-er)
  - [Classes da Aplicação](#3-diagrama-de-classes)
  - [Fluxo de Autenticação](#4-diagrama-de-fluxo-de-autenticação)
  - [Fluxo de Usuário](#5-diagrama-de-fluxo-de-usuário)
  - [Fluxo de Requisição HTTP](#6-diagrama-de-fluxo-de-requisição-http)
  - [Pipeline IoT em Tempo Real](#7-diagrama-do-pipeline-iot-em-tempo-real)
  - [Hierarquia de Recursos](#8-diagrama-de-hierarquia-de-recursos)
  - [Ciclo de Vida de um Alerta](#9-diagrama-de-ciclo-de-vida-de-um-alerta)
  - [Arquitetura de Módulos](#10-diagrama-de-arquitetura-de-módulos-backend)
- [Como Executar](#como-executar)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Testes](#testes)
- [API Reference — Endpoints e Exemplos](#api-reference)
  - [Autenticação](#autenticação)
  - [Usuários](#usuários)
  - [Distribuidoras](#distribuidoras)
  - [Propriedades](#propriedades)
  - [Áreas](#áreas)
  - [Aparelhos (Devices)](#aparelhos-devices)
  - [Consumo](#consumo)
  - [Alertas](#alertas)
  - [Simulação](#simulação)
  - [Relatórios](#relatórios)
  - [IoT Config](#iot-config)
  - [IoT Stream (SSE)](#iot-stream-sse)
- [Estrutura de Pastas](#estrutura-de-pastas)

---

## Sobre

Este documento descreve a API REST do **LumiTrack**.

O back-end foi construído seguindo **TDD (Test-Driven Development)**, com cobertura de testes unitários, de integração e ponta a ponta. A arquitetura é baseada em módulos independentes com separação clara entre Controller → Service → Repository.

---

## Arquitetura e Tecnologias

| Camada | Tecnologia |
| --- | --- |
| Linguagem | TypeScript |
| Runtime | Node.js |
| Framework HTTP | Express 5 |
| ORM | Prisma 7 |
| Banco de Dados | PostgreSQL |
| Validação | Zod 4 |
| Autenticação | JWT (jsonwebtoken) + bcryptjs |
| E-mail | Nodemailer |
| Testes | Vitest + Supertest |
| Técnica de desenvolvimento | TDD |

### Padrão Arquitetural

O back-end segue o padrão **Controller → Service → Repository** com injeção de dependência manual, o que permite substituir implementações nos testes sem alterar código de produção.

```plaintext
Request → Router → Controller → Service → Repository → Banco de Dados
```

---

## Diagramas

### 1. Diagrama de Casos de Uso

```mermaid
flowchart TD
    PF([Pessoa Física])
    PJ([Pessoa Jurídica])

    PF & PJ --> UC0(Cadastrar-se e Autenticar)
    PF & PJ --> UC1(Gerenciar Distribuidoras)
    PF & PJ --> UC2(Gerenciar Propriedades)
    PF & PJ --> UC3(Gerenciar Áreas)
    PF & PJ --> UC4(Gerenciar Aparelhos)
    PF & PJ --> UC5(Registrar Consumo)
    PF & PJ --> UC6(Gerar Relatório de Consumo)
    PF & PJ --> UC7(Simular Custos)
    PF & PJ --> UC8(Configurar Alertas)
    PF & PJ --> UC9(Configurar Dispositivo IoT)
    PF & PJ --> UC10(Monitorar em Tempo Real via SSE)

    UC0 --> UC0a(Login Web/Mobile)
    UC0 --> UC0b(Logout)
    UC0 --> UC0c(Recuperar Senha por E-mail)

    UC2 -. depende de .-> UC1
    UC3 -. depende de .-> UC2
    UC4 -. depende de .-> UC3
    UC5 -. inclui .-> UC5a(Cálculo automático de Custo)
    UC8 -. dispara .-> UC8a(Notificação SSE ao Ultrapassar Threshold)
    UC9 -. habilita .-> UC10
```

---

### 2. Diagrama Entidade-Relacionamento (ER)

```mermaid
erDiagram
    USER {
        uuid id PK
        string email UK
        string password
        enum userType
        string firstName
        string lastName
        string cpf UK
        string companyName
        string cnpj UK
        string tradeName
    }

    AUTH_TOKEN {
        uuid id PK
        uuid userId FK
        string token UK
        enum channel
        datetime expiresAt
        datetime revokedAt
    }

    PASSWORD_RESET {
        uuid id PK
        uuid userId FK
        string token UK
        datetime expiresAt
        datetime usedAt
    }

    ENERGY_DISTRIBUTOR {
        uuid id PK
        uuid userId FK
        string name
        string cnpj
        enum electricalSystem
        float workingVoltage
        decimal kwhPrice
        decimal taxRate
        decimal publicLightingFee
    }

    PROPERTY {
        uuid id PK
        uuid userId FK
        uuid distributorId FK
        string name
        string address
        string city
        string state
        string zipCode
    }

    AREA {
        uuid id PK
        uuid propertyId FK
        string name
        string description
    }

    DEVICE {
        uuid id PK
        uuid areaId FK
        string name
        string brand
        string model
        float powerWatts
    }

    CONSUMPTION_RECORD {
        uuid id PK
        uuid propertyId FK
        uuid areaId FK
        uuid deviceId FK
        enum period
        datetime referenceDate
        float kwhConsumed
        float costBrl
        string notes
    }

    ALERT {
        uuid id PK
        uuid userId FK
        uuid propertyId FK
        uuid areaId FK
        uuid deviceId FK
        enum targetType
        float thresholdKwh
        string message
        datetime triggeredAt
        datetime readAt
    }

    IOT_DEVICE_CONFIG {
        uuid id PK
        uuid deviceId FK, UK
        enum protocol
        string host
        int port
        string topic
        string address
        json extra
    }

    USER ||--o{ AUTH_TOKEN : "possui"
    USER ||--o{ PASSWORD_RESET : "possui"
    USER ||--o{ ENERGY_DISTRIBUTOR : "cadastra"
    USER ||--o{ PROPERTY : "possui"
    USER ||--o{ ALERT : "recebe"

    ENERGY_DISTRIBUTOR ||--o{ PROPERTY : "abastece"

    PROPERTY ||--o{ AREA : "contém"
    PROPERTY ||--o{ CONSUMPTION_RECORD : "registra"
    PROPERTY ||--o{ ALERT : "alvo de"

    AREA ||--o{ DEVICE : "contém"
    AREA ||--o{ CONSUMPTION_RECORD : "registra"
    AREA ||--o{ ALERT : "alvo de"

    DEVICE ||--o{ CONSUMPTION_RECORD : "registra"
    DEVICE ||--o{ ALERT : "alvo de"
    DEVICE ||--o| IOT_DEVICE_CONFIG : "configurado via"
```

---

### 3. Diagrama de Classes

```mermaid
classDiagram
    class UserService {
        +createUser(input) UserWithoutPassword
        +findById(id) UserWithoutPassword
        +updateUser(id, input) UserWithoutPassword
        +deleteUser(id) void
    }

    class AuthService {
        +login(input) token
        +logout(token) void
        +forgotPassword(input) void
        +resetPassword(input) void
    }

    class DistributorService {
        +create(userId, input) DistributorResponse
        +findById(id, userId) DistributorResponse
        +findAll(userId) DistributorResponse[]
        +update(id, userId, input) DistributorResponse
        +delete(id, userId) void
    }

    class PropertyService {
        +create(userId, input) PropertyResponse
        +findById(id, userId) PropertyResponse
        +findAll(userId) PropertyResponse[]
        +update(id, userId, input) PropertyResponse
        +delete(id, userId) void
        -validateDistributorOwnership(distId, userId) void
    }

    class AreaService {
        +create(propertyId, userId, input) AreaResponse
        +findById(id, propertyId, userId) AreaResponse
        +findAll(propertyId, userId) AreaResponse[]
        +update(id, propertyId, userId, input) AreaResponse
        +delete(id, propertyId, userId) void
        -validatePropertyOwnership(propId, userId) void
    }

    class DeviceService {
        +create(areaId, propertyId, userId, input) DeviceResponse
        +findById(id, areaId, propertyId, userId) DeviceResponse
        +findAll(areaId, propertyId, userId) DeviceResponse[]
        +update(id, areaId, propertyId, userId, input) DeviceResponse
        +delete(id, areaId, propertyId, userId) void
        -validateAreaOwnership(areaId, propId, userId) void
    }

    class ConsumptionService {
        +createForProperty(propId, userId, input) ConsumptionResponse
        +createForArea(areaId, propId, userId, input) ConsumptionResponse
        +createForDevice(devId, areaId, propId, userId, input) ConsumptionResponse
        +findById(id, propId, userId) ConsumptionResponse
        +update(id, propId, userId, input) ConsumptionResponse
        +delete(id, propId, userId) void
        -validatePropertyAndGetKwhPrice(propId, userId) number
        -triggerAlerts(target, kwh) void
    }

    class AlertService {
        +createForProperty(propId, userId, input) AlertResponse
        +createForArea(areaId, propId, userId, input) AlertResponse
        +createForDevice(devId, areaId, propId, userId, input) AlertResponse
        +findAll(userId, query) AlertResponse[]
        +findById(id, userId) AlertResponse
        +update(id, userId, input) AlertResponse
        +markAsRead(id, userId) AlertResponse
        +delete(id, userId) void
        +checkAndTrigger(target, kwhConsumed) void
    }

    class ReportService {
        +generate(propertyId, userId, input) ReportResult
        -applyDateFilter(records, from, to) ConsumptionResponse[]
        -calculateSummary(records) ReportSummary
        -calculateTrend(records) ReportTrend
    }

    class SimulationService {
        +simulate(propertyId, userId, input) SimulationResult
        -validatePropertyAndGetKwhPrice(propId, userId) number
        -validateTarget(data, propId) void
        -resolveEffectivePowerWatts(data) number
        -calculateKwh(data, watts, days) number
    }

    class IoTService {
        +create(devId, areaId, propId, userId, input) IoTConfigResponse
        +findByDeviceId(devId, areaId, propId, userId) IoTConfigResponse
        +update(devId, areaId, propId, userId, input) IoTConfigResponse
        +delete(devId, areaId, propId, userId) void
    }

    class AlertNotifier {
        +addListener(userId, listener) unsubscribe
        +notify(alert) void
        +activeListenerCount() number
    }

    class IoTDataProcessor {
        +buffer ReadingBuffer
        +start() void
        +addSseListener(listener) unsubscribe
    }

    class HourlyRollupScheduler {
        +start() void
        +stop() void
        +flush() void
        -persistSnapshot(devId, kwh, hourStart) void
    }

    class ReadingBuffer {
        +add(deviceId, kwhIncrement) void
        +getHourlySnapshot(deviceId) HourlySnapshot
        +getAllHourlySnapshots() HourlySnapshot[]
        +clearHourly(deviceId) void
        +getLatest(deviceId) DeviceReading
    }

    ConsumptionService --> AlertService : dispara alertas
    AlertService --> AlertNotifier : notifica SSE
    IoTDataProcessor --> ReadingBuffer : acumula leituras
    HourlyRollupScheduler --> ReadingBuffer : lê e persiste
    HourlyRollupScheduler --> ConsumptionService : cria registros HOURLY
    PropertyService --> DistributorService : valida posse
    AreaService --> PropertyService : valida posse
    DeviceService --> AreaService : valida posse
    ConsumptionService --> PropertyService : valida posse e obtém kwhPrice
    ReportService --> ConsumptionService : lê registros
```

---

### 4. Diagrama de Fluxo de Autenticação

```mermaid
sequenceDiagram
    actor Cliente
    participant API as LumiTrack API
    participant DB as PostgreSQL

    Note over Cliente, DB: Fluxo de Login
    Cliente->>API: POST /api/auth/login {email, password, channel}
    API->>DB: Busca usuário por e-mail
    DB-->>API: Retorna usuário com hash de senha
    API->>API: bcrypt.compare(password, hash)
    alt Credenciais inválidas
        API-->>Cliente: 401 Unauthorized
    else Credenciais válidas
        API->>API: jwt.sign(payload, secret, options)
        API->>DB: INSERT auth_tokens (token, channel, expiresAt)
        API-->>Cliente: 200 { token }
    end

    Note over Cliente, DB: Fluxo de Requisição Autenticada
    Cliente->>API: GET /api/properties (Bearer token)
    API->>API: jwt.verify(token, secret)
    API->>DB: SELECT auth_tokens WHERE token = ?
    alt Token não encontrado ou revogado
        API-->>Cliente: 401 Unauthorized
    else Token expirado (apenas WEB)
        API-->>Cliente: 401 Token expirado
    else Token válido
        API->>DB: Executa a operação solicitada
        API-->>Cliente: 200 { data }
    end

    Note over Cliente, DB: Fluxo de Logout
    Cliente->>API: POST /api/auth/logout (Bearer token)
    API->>DB: UPDATE auth_tokens SET revokedAt = NOW()
    API-->>Cliente: 200 Logout realizado

    Note over Cliente, DB: Recuperação de Senha
    Cliente->>API: POST /api/auth/forgot-password {email}
    API->>DB: Busca usuário (silencioso se não existir)
    API->>DB: INSERT password_resets (token UUID, expiresAt +1h)
    API->>API: Envia e-mail com link reset
    API-->>Cliente: 200 (mesmo se e-mail não existir)
    Cliente->>API: POST /api/auth/reset-password {token, newPassword}
    API->>DB: Valida token (existe, não usado, não expirado)
    API->>DB: UPDATE users SET password = bcrypt(newPassword)
    API->>DB: UPDATE password_resets SET usedAt = NOW()
    API-->>Cliente: 200 Senha redefinida
```

---

### 5. Diagrama de Fluxo de Usuário

```mermaid
flowchart TD
    A([Início]) --> B{Possui conta?}
    B -- Não --> C[Cadastro PF ou PJ]
    C --> D[Login Web ou Mobile]
    B -- Sim --> D

    D --> E[Dashboard Principal]

    E --> F[⚡ Distribuidoras]
    F --> F1[Cadastrar CEMIG, CPFL, Enel...]
    F1 --> F2[Informar kWh, sistema elétrico, tensão]

    E --> G[Propriedades]
    G --> G1[Cadastrar propriedade]
    G1 -. requer .-> F1
    G1 --> G2[Vincular distribuidora]

    G --> H[Áreas]
    H --> H1[Sala, Cozinha, Escritório...]

    H --> I[Aparelhos]
    I --> I1[Ar-condicionado, Geladeira...]
    I --> I2[Configurar IoT opcional]
    I2 --> I2a[MQTT / Modbus / RS485...]

    E --> J[Consumo]
    J --> J1[Inserção manual]
    J --> J2[Automática via IoT]
    J --> J3[Visualizar histórico]
    J3 --> J4[Filtrar por período / data]

    E --> K[Relatórios]
    K --> K1[Gerar relatório por propriedade/área/device]
    K1 --> K2[Ver tendência INCREASING / DECREASING / STABLE]

    E --> L[Simulação]
    L --> L1[Informar kWh direto ou Watts + Horas/dia]
    L1 --> L2[Calcular custo diário / mensal / anual]

    E --> M[Alertas]
    M --> M1[Definir threshold de kWh por alvo]
    M1 --> M2[Receber notificação em tempo real via SSE]

    E --> N[Stream Tempo Real]
    N --> N1[Conectar em /api/iot/stream]
    N1 --> N2[Receber leituras dos devices em tempo real]
    N1 --> N3[Receber alertas disparados em tempo real]
```

---

### 6. Diagrama de Fluxo de Requisição HTTP

```mermaid
flowchart LR
    REQ([HTTP Request]) --> MW1[Helmet\nCORS]
    MW1 --> MW2[express.json]
    MW2 --> ROUTER[Router Express]

    ROUTER --> PUB[Rotas Públicas\nPOST /users\nPOST /auth/login\nPOST /auth/forgot-password\nPOST /auth/reset-password]
    ROUTER --> MW3[Middleware\nAuthenticate JWT]

    MW3 -- Token inválido --> ERR401[401 Unauthorized]
    MW3 -- Token válido --> CTRL[Controller]

    CTRL --> SVC[Service]
    SVC --> VALID[Validação Zod]
    VALID -- Inválido --> ERR422[422 ValidationError]
    VALID -- Válido --> AUTHZ[Verificação de Posse\nForbiddenError / NotFoundError]
    AUTHZ -- Negado --> ERR403[403 / 404]
    AUTHZ -- Permitido --> REPO[Repository]
    REPO --> DB[(PostgreSQL)]
    DB --> REPO
    REPO --> SVC
    SVC --> CTRL
    CTRL --> RES([HTTP Response\n2xx + JSON])

    SVC -- Exceção AppError --> EH[errorHandler\nMiddleware]
    EH --> ERRRES([HTTP Response\n4xx / 5xx])
```

---

### 7. Diagrama do Pipeline IoT em Tempo Real

```mermaid
sequenceDiagram
    actor Sensor as Dispositivo Físico
    participant Conn as IConnection\n(MQTT/Modbus/RS485...)
    participant Mgr as IoTConnectionManager
    participant Proc as IoTDataProcessor
    participant Buf as ReadingBuffer
    participant Sched as HourlyRollupScheduler
    participant DB as PostgreSQL
    participant SSE as Cliente SSE\n(Browser/App)
    participant Alert as AlertService

    Note over Mgr, Sched: Boot do servidor
    Mgr->>DB: Busca todas IoTDeviceConfig
    Mgr->>Conn: Abre conexões para cada device

    Note over Sensor, SSE: Leitura em tempo real
    Sensor->>Conn: Envia dado (ex: {value: 0.003})
    Conn->>Mgr: onData(deviceId, rawData)
    Mgr->>Proc: dataHandler(deviceId, {value: 0.003})
    Proc->>Proc: Valida campo "value" (número >= 0)
    Proc->>Buf: add(deviceId, 0.003)
    Proc->>SSE: SSE event: reading\n{deviceId, kwhConsumed, receivedAt}

    Note over Sched, Alert: A cada virada de hora (XX:00:00)
    Sched->>Buf: getAllHourlySnapshots()
    Buf-->>Sched: [{deviceId, kwhAccumulated, hourStart}]
    Sched->>DB: Resolve device → area → property → distributor
    Sched->>DB: INSERT ConsumptionRecord (HOURLY, kwhAccumulated, costBrl)
    Sched->>Buf: clearHourly(deviceId)
    Sched->>Alert: checkAndTrigger({deviceId}, kwhAccumulated)
    Alert->>SSE: SSE event: alert\n{id, thresholdKwh, triggeredAt}
```

---

### 8. Diagrama de Hierarquia de Recursos

```mermaid
flowchart TD
    USR[Usuário]

    USR --> DIST[Distribuidoras\n/api/distributors]
    USR --> PROP[Propriedades\n/api/properties]
    DIST -. vinculada a .-> PROP

    PROP --> CONS_P[Consumo da Propriedade\n/consumption]
    PROP --> ALERT_P[Alertas da Propriedade\n/alerts]
    PROP --> SIM[Simulação\n/simulation]
    PROP --> REP[Relatório\n/report]
    PROP --> AREA[Áreas\n/areas]

    AREA --> CONS_A[Consumo da Área\n/consumption]
    AREA --> ALERT_A[Alertas da Área\n/alerts]
    AREA --> DEV[Aparelhos\n/devices]

    DEV --> CONS_D[Consumo do Aparelho\n/consumption]
    DEV --> ALERT_D[Alertas do Aparelho\n/alerts]
    DEV --> IOT[Config IoT\n/iot-config]

    USR --> STREAM[Stream Tempo Real\n/api/iot/stream]
```

---

### 9. Diagrama de Ciclo de Vida de um Alerta

```mermaid
stateDiagram-v2
    [*] --> Criado : POST /alerts\n(thresholdKwh definido)
    Criado --> Ativo : triggeredAt = null\nreadAt = null
    Ativo --> Disparado : ConsumptionService detecta\nkwhConsumed > thresholdKwh\n→ alertRepository.trigger()
    Disparado --> Disparado_Lido : PATCH /alerts/:id/read\n→ readAt = NOW()
    Ativo --> Deletado : DELETE /alerts/:id
    Disparado --> Deletado : DELETE /alerts/:id
    Disparado_Lido --> Deletado : DELETE /alerts/:id
    Deletado --> [*]

    note right of Disparado
        SSE event: "alert" enviado
        em tempo real para o cliente
        conectado no stream
    end note
```

---

### 10. Diagrama de Arquitetura de Módulos (Backend)

```mermaid
flowchart LR
    subgraph Entrada
        HTTP[HTTP Request]
        SSE_IN[SSE Client\n/api/iot/stream]
    end

    subgraph Middlewares
        HLM[Helmet + CORS]
        AUTH[authenticate.ts\nJWT + DB check]
        ERR[errorHandler.ts]
    end

    subgraph Módulos de Negócio
        USER[user]
        AUTM[auth]
        DIST[distributor]
        PROP[property]
        AREA[area]
        DEV[device]
        CONS[consumption]
        ALERT[alert]
        SIM[simulation]
        REP[report]
        IOT[iot]
    end

    subgraph Workers
        PROC[IoTDataProcessor]
        BUF[ReadingBuffer]
        SCHED[HourlyRollupScheduler]
        MGR[IoTConnectionManager]
        NOTIF[AlertNotifier]
    end

    subgraph Infraestrutura
        PRISMA[PrismaClient\n+ PrismaPg]
        PG[(PostgreSQL)]
        SMTP[Nodemailer\nSMTP]
    end

    HTTP --> HLM --> AUTH
    AUTH --> USER & AUTM & DIST & PROP & AREA & DEV & CONS & ALERT & SIM & REP & IOT
    SSE_IN --> AUTH --> PROC

    CONS --> ALERT
    ALERT --> NOTIF
    NOTIF --> SSE_IN

    PROC --> BUF
    SCHED --> BUF
    SCHED --> CONS
    MGR --> PROC

    USER & AUTM & DIST & PROP & AREA & DEV & CONS & ALERT & SIM & REP & IOT --> PRISMA
    AUTM --> SMTP
    PRISMA --> PG

    AUTM & PROP & AREA & DEV & CONS --> ERR
```

---

## Como Executar

### Pré-requisitos

- Node.js 20+
- PostgreSQL 14+
- npm ou pnpm

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/lumitrack.git
cd lumitrack/backend
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure as variáveis de ambiente

```bash
cp .env.example .env
# Edite o .env com suas configurações (veja seção abaixo)
```

### 4. Crie os bancos de dados

```bash
createdb lumitrack_dev
createdb lumitrack_test
createdb lumitrack_test_http
```

### 5. Execute as migrations

```bash
npm run db:migrate
```

### 6. Inicie o servidor de desenvolvimento

```bash
npm run dev
# API disponível em http://localhost:3333
# Health check: http://localhost:3333/health
```

---

## Variáveis de Ambiente

Crie um arquivo `.env` na pasta `backend/` com as seguintes variáveis:

```env
# Banco de dados principal
DATABASE_URL="postgresql://usuario:senha@localhost:5432/lumitrack_dev"

# Bancos de dados de teste (para rodar os testes)
DATABASE_TEST_URL="postgresql://usuario:senha@localhost:5432/lumitrack_test"
DATABASE_HTTP_TEST_URL="postgresql://usuario:senha@localhost:5432/lumitrack_test_http"

# JWT
JWT_SECRET="sua-chave-secreta-com-pelo-menos-32-caracteres"
JWT_WEB_EXPIRES_IN="15m"

# SMTP (para e-mails de recuperação de senha)
# Use Mailtrap em desenvolvimento: https://mailtrap.io
SMTP_HOST="smtp.mailtrap.io"
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER="seu-usuario-mailtrap"
SMTP_PASS="sua-senha-mailtrap"
SMTP_FROM="noreply@lumitrack.app"

# URLs
CORS_ORIGIN="http://localhost:3000"
FRONTEND_URL="http://localhost:3000"

# Porta
PORT=3333
NODE_ENV="development"
```

---

## Testes

### Executar todos os testes

```bash
npm test
```

### Executar em modo watch

```bash
npm run test:watch
```

### Gerar relatório de cobertura

```bash
npm run test:coverage
```

### Estrutura dos testes

O projeto possui três tipos de testes, todos usando **Vitest**:

| Tipo | Arquivo | O que testa |
| --- | --- | --- |
| **Unitário** | `*.service.test.ts` | Services com banco de dados de teste isolado |
| **Integração** | `*.routes.test.ts` | Rotas HTTP completas via Supertest |
| **E2E de Stream** | `iot-stream.routes.test.ts` | SSE com servidor TCP real |

> **Importante:** os testes rodam em série (`maxWorkers: 1`) para evitar conflitos no banco de dados compartilhado. Cada teste limpa o banco via `cleanDatabase()` no `beforeEach`.

---

## API Reference

Todas as requisições autenticadas exigem o header:

```plaintext
Authorization: Bearer <token>
```

As respostas seguem o padrão:

```json
// Sucesso
{ "status": "success", "data": { ... } }

// Erro
{ "status": "error", "message": "Mensagem de erro" }
```

### Autenticação

#### `POST /api/auth/login`

Autentica o usuário e retorna um token JWT.

```json
// Body
{
  "email": "joao@example.com",
  "password": "Senha@123",
  "channel": "WEB"
}

// Resposta 200
{
  "status": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

> **channel:** `"WEB"` (token expira) ou `"MOBILE"` (token não expira por tempo)

---

#### `POST /api/auth/logout`

Revoga o token atual.

```json
// Sem body. Requer header Authorization.

// Resposta 200
{
  "status": "success",
  "message": "Logout realizado com sucesso"
}
```

---

#### `POST /api/auth/forgot-password`

Solicita redefinição de senha por e-mail.

```json
// Body
{
  "email": "joao@example.com"
}

// Resposta 200 (mesmo para e-mails não cadastrados)
{
  "status": "success",
  "message": "Se o e-mail estiver cadastrado, você receberá as instruções de redefinição."
}
```

---

#### `POST /api/auth/reset-password`

Redefine a senha usando o token recebido por e-mail.

```json
// Body
{
  "token": "uuid-recebido-por-email",
  "newPassword": "NovaSenha@456"
}

// Resposta 200
{
  "status": "success",
  "message": "Senha redefinida com sucesso"
}
```

---

### Usuários

#### `POST /api/users` — Criar usuário (Público)

**Pessoa Física:**

```json
// Body
{
  "email": "joao@example.com",
  "password": "Senha@123",
  "userType": "INDIVIDUAL",
  "firstName": "João",
  "lastName": "Silva",
  "cpf": "529.982.247-25"
}

// Resposta 201
{
  "status": "success",
  "data": {
    "id": "uuid",
    "email": "joao@example.com",
    "userType": "INDIVIDUAL",
    "firstName": "João",
    "lastName": "Silva",
    "cpf": "529.982.247-25",
    "createdAt": "2025-01-15T10:00:00.000Z"
  }
}
```

**Pessoa Jurídica:**

```json
// Body
{
  "email": "contato@empresa.com",
  "password": "Senha@123",
  "userType": "COMPANY",
  "companyName": "Empresa Ltda",
  "cnpj": "11.222.333/0001-81",
  "tradeName": "Empresa"
}
```

---

#### `GET /api/users/:id`

Retorna dados do usuário autenticado. Só pode acessar o próprio perfil.

```json
// Resposta 200
{
  "status": "success",
  "data": {
    "id": "uuid",
    "email": "joao@example.com",
    "userType": "INDIVIDUAL",
    "firstName": "João",
    "lastName": "Silva"
  }
}
```

---

#### `PUT /api/users/:id`

```json
// Body (todos opcionais)
{
  "firstName": "João Carlos",
  "lastName": "Silva",
  "email": "novo@example.com"
}
```

---

#### `DELETE /api/users/:id`

Remove o usuário e todos seus dados (cascade). Responde `204 No Content`.

---

### Distribuidoras

#### `POST /api/distributors`

```json
// Body
{
  "name": "CEMIG Distribuição S.A.",
  "cnpj": "06.981.180/0001-16",
  "electricalSystem": "TRIPHASIC",
  "workingVoltage": 220,
  "kwhPrice": 0.75,
  "taxRate": 0.12,
  "publicLightingFee": 45.90
}
```

> **electricalSystem:** `"MONOPHASIC"` | `"BIPHASIC"` | `"TRIPHASIC"`  
> **workingVoltage:** `110` | `127` | `220` | `380` | `440` | `660` | `13800`

```json
// Resposta 201
{
  "status": "success",
  "data": {
    "id": "uuid",
    "name": "CEMIG Distribuição S.A.",
    "cnpj": "06.981.180/0001-16",
    "electricalSystem": "TRIPHASIC",
    "workingVoltage": 220,
    "kwhPrice": 0.75,
    "taxRate": 0.12,
    "publicLightingFee": 45.90
  }
}
```

---

#### `GET /api/distributors`

Lista todas as distribuidoras do usuário autenticado, ordenadas por nome.

---

#### `GET /api/distributors/:id`

Retorna uma distribuidora específica.

---

#### `PUT /api/distributors/:id`

```json
// Body (todos opcionais, CNPJ não pode ser alterado)
{
  "name": "CEMIG Atualizada",
  "kwhPrice": 0.85,
  "taxRate": 0.13
}
```

---

#### `DELETE /api/distributors/:id`

Remove a distribuidora. **Retorna 409** se houver propriedades vinculadas.

---

### Propriedades

#### `POST /api/properties`

```json
// Body
{
  "name": "Casa Principal",
  "distributorId": "uuid-da-distribuidora",
  "address": "Rua das Flores, 123",
  "city": "Belo Horizonte",
  "state": "MG",
  "zipCode": "30130-010"
}
```

> **state:** qualquer sigla de UF válida (AC, AL, AM, BA, CE, DF, ES, GO, MA, MG, MS, MT, PA, PB, PE, PI, PR, RJ, RN, RO, RR, RS, SC, SE, SP, TO)  
> **zipCode:** formato `00000-000`

```json
// Resposta 201
{
  "status": "success",
  "data": {
    "id": "uuid",
    "name": "Casa Principal",
    "distributorId": "uuid",
    "userId": "uuid",
    "state": "MG",
    "zipCode": "30130-010"
  }
}
```

---

#### `GET /api/properties`

Lista propriedades do usuário, ordenadas por nome.

---

#### `GET /api/properties/:id`

---

#### `PUT /api/properties/:id`

```json
// Body (todos opcionais)
{
  "name": "Casa Renovada",
  "distributorId": "novo-uuid-de-distribuidora",
  "city": "Contagem"
}
```

---

#### `DELETE /api/properties/:id`

Remove propriedade e toda a hierarquia abaixo (cascade: áreas, devices, consumo, alertas). Responde `204`.

---

### Áreas

> Todas as rotas de área são aninhadas em `/api/properties/:propertyId/areas`

#### `POST /api/properties/:propertyId/areas`

```json
// Body
{
  "name": "Sala de Estar",
  "description": "Área principal de convivência"
}
```

---

#### `GET /api/properties/:propertyId/areas`

Lista áreas da propriedade, ordenadas por nome.

---

#### `GET /api/properties/:propertyId/areas/:areaId`

---

#### `PUT /api/properties/:propertyId/areas/:areaId`

```json
// Body (todos opcionais)
{
  "name": "Sala de Jantar",
  "description": "Reformada em 2025"
}
```

---

#### `DELETE /api/properties/:propertyId/areas/:areaId`

Remove área e devices abaixo (cascade). Responde `204`.

---

### Aparelhos (Devices)

> Aninhados em `/api/properties/:propertyId/areas/:areaId/devices`

#### `POST /api/properties/:propertyId/areas/:areaId/devices`

```json
// Body
{
  "name": "Ar-condicionado",
  "brand": "Daikin",
  "model": "Split 12000 BTU",
  "powerWatts": 1200
}
```

> `brand`, `model` e `powerWatts` são opcionais.  
> `powerWatts` é necessário para simulação no modo `WATTS_HOURS`.

---

#### `GET /api/properties/:propertyId/areas/:areaId/devices`

Lista devices da área, ordenados por nome.

---

#### `GET /api/properties/:propertyId/areas/:areaId/devices/:id`

---

#### `PUT /api/properties/:propertyId/areas/:areaId/devices/:id`

```json
// Body (todos opcionais)
{
  "name": "Ar-condicionado Inverter",
  "powerWatts": 900
}
```

---

#### `DELETE /api/properties/:propertyId/areas/:areaId/devices/:id`

Responde `204`.

---

### Consumo

#### Registrar consumo de propriedade — `POST /api/properties/:propertyId/consumption`

```json
// Body
{
  "period": "MONTHLY",
  "referenceDate": "2025-01-01",
  "kwhConsumed": 320.5,
  "notes": "Mês com pico de calor"
}
```

> **period:** `"HOURLY"` | `"DAILY"` | `"MONTHLY"` | `"ANNUAL"`  
> **referenceDate:** ISO 8601 — o `costBrl` é calculado automaticamente via `kwhPrice` da distribuidora vinculada.

```json
// Resposta 201
{
  "status": "success",
  "data": {
    "id": "uuid",
    "propertyId": "uuid",
    "period": "MONTHLY",
    "referenceDate": "2025-01-01T00:00:00.000Z",
    "kwhConsumed": 320.5,
    "costBrl": 240.375,
    "notes": "Mês com pico de calor"
  }
}
```

---

#### Listar consumo da propriedade — `GET /api/properties/:propertyId/consumption`

```plaintext
GET /api/properties/:id/consumption?period=MONTHLY
```

Filtro por `period` é opcional.

---

#### Registrar consumo de área — `POST /api/properties/:propertyId/areas/:areaId/consumption`

Mesmo body do consumo de propriedade.

---

#### Listar consumo de área — `GET /api/properties/:propertyId/areas/:areaId/consumption`

---

#### Registrar consumo de device — `POST /api/properties/:propertyId/areas/:areaId/devices/:deviceId/consumption`

---

#### Listar consumo de device — `GET /api/properties/:propertyId/areas/:areaId/devices/:deviceId/consumption`

---

#### Buscar registro específico — `GET /api/properties/:propertyId/consumption/:id`

---

#### Atualizar registro — `PUT /api/properties/:propertyId/consumption/:id`

```json
// Body
{
  "kwhConsumed": 350.0,
  "notes": "Corrigido após releitura"
}
```

> Se `kwhConsumed` for alterado, `costBrl` é recalculado automaticamente.

---

#### Deletar registro — `DELETE /api/properties/:propertyId/consumption/:id`

Responde `204`.

---

### Alertas

#### Criar alerta para propriedade — `POST /api/properties/:propertyId/alerts`

```json
// Body
{
  "thresholdKwh": 400,
  "message": "Consumo mensal acima do esperado"
}
```

```json
// Resposta 201
{
  "status": "success",
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "propertyId": "uuid",
    "targetType": "PROPERTY",
    "thresholdKwh": 400,
    "message": "Consumo mensal acima do esperado",
    "triggeredAt": null,
    "readAt": null
  }
}
```

---

#### Criar alerta para área — `POST /api/properties/:propertyId/areas/:areaId/alerts`

---

#### Criar alerta para device — `POST /api/properties/:propertyId/areas/:areaId/devices/:deviceId/alerts`

---

#### Listar alertas do usuário — `GET /api/alerts`

```plaintext
GET /api/alerts
GET /api/alerts?triggered=true    # apenas disparados
GET /api/alerts?triggered=false   # apenas não disparados
```

---

#### Listar alertas da propriedade — `GET /api/properties/:propertyId/alerts`

---

#### Buscar alerta — `GET /api/alerts/:id`

---

#### Atualizar alerta — `PUT /api/alerts/:id`

```json
// Body
{
  "thresholdKwh": 500,
  "message": "Novo limite"
}
```

---

#### Marcar como lido — `PATCH /api/alerts/:id/read`

Sem body. Preenche `readAt`.

```json
// Resposta 200
{
  "status": "success",
  "data": {
    "id": "uuid",
    "readAt": "2025-01-15T14:30:00.000Z"
  }
}
```

---

#### Deletar alerta — `DELETE /api/alerts/:id`

Responde `204`.

---

### Simulação

#### `POST /api/properties/:propertyId/simulation`

Simula o custo de consumo sem criar registros no banco.

**Modo KWH_DIRECT — Propriedade:**

```json
// Body
{
  "period": "MONTHLY",
  "target": { "type": "PROPERTY" },
  "inputMode": "KWH_DIRECT",
  "kwhConsumed": 320
}
```

**Modo WATTS_HOURS — Device (usando potência do cadastro):**

```json
// Body
{
  "period": "ANNUAL",
  "target": {
    "type": "DEVICE",
    "deviceId": "uuid-do-device",
    "areaId": "uuid-da-area"
  },
  "inputMode": "WATTS_HOURS",
  "dailyUsageHours": 8
}
```

> Se `powerWatts` for omitido para `target.type = "DEVICE"`, o sistema usa o `powerWatts` cadastrado no device.

**Modo WATTS_HOURS — Área:**

```json
// Body
{
  "period": "DAILY",
  "target": {
    "type": "AREA",
    "areaId": "uuid-da-area"
  },
  "inputMode": "WATTS_HOURS",
  "powerWatts": 2000,
  "dailyUsageHours": 5
}
```

```json
// Resposta 200
{
  "status": "success",
  "data": {
    "period": "DAILY",
    "target": { "type": "AREA", "areaId": "uuid" },
    "inputMode": "WATTS_HOURS",
    "powerWatts": 2000,
    "dailyUsageHours": 5,
    "kwhConsumed": 10,
    "costBrl": 7.50,
    "kwhPrice": 0.75,
    "projectedDays": 1
  }
}
```

> **target.type:** `"PROPERTY"` | `"AREA"` | `"DEVICE"`  
> **period:** `"DAILY"` | `"MONTHLY"` | `"ANNUAL"`  
> **inputMode:** `"KWH_DIRECT"` | `"WATTS_HOURS"`

---

### Relatórios

#### `GET /api/properties/:propertyId/report`

Gera relatório de consumo com summary e tendência.

**Relatório da propriedade:**

```plaintext
GET /api/properties/:id/report?target=PROPERTY&period=MONTHLY
```

**Relatório de uma área específica:**

```plaintext
GET /api/properties/:id/report?target=AREA&targetId=<areaId>&period=MONTHLY
```

**Relatório de um device específico com filtro de data:**

```plaintext
GET /api/properties/:id/report?target=DEVICE&targetId=<deviceId>&targetAreaId=<areaId>&period=DAILY&dateFrom=2025-01-01&dateTo=2025-01-31
```

```json
// Resposta 200
{
  "status": "success",
  "data": {
    "generatedAt": "2025-01-15T14:00:00.000Z",
    "period": "MONTHLY",
    "target": {
      "type": "PROPERTY",
      "propertyId": "uuid"
    },
    "dateRange": null,
    "summary": {
      "totalKwh": 960.5,
      "totalCostBrl": 720.375,
      "recordCount": 3,
      "avgKwhPerRecord": 320.17,
      "trend": "INCREASING"
    },
    "records": [
      {
        "id": "uuid",
        "referenceDate": "2025-03-01T00:00:00.000Z",
        "kwhConsumed": 380,
        "costBrl": 285,
        "period": "MONTHLY"
      }
    ]
  }
}
```

> **trend:** `"INCREASING"` | `"DECREASING"` | `"STABLE"` | `"INSUFFICIENT_DATA"`  
> O cálculo compara a média das duas metades cronológicas dos registros. Variação > 5% = INCREASING/DECREASING.

**Query params:**

| Parâmetro | Obrigatório | Descrição |
| --- | --- | --- |
| `target` | Sim | `PROPERTY`, `AREA` ou `DEVICE` |
| `period` | Sim | `DAILY`, `MONTHLY` ou `ANNUAL` |
| `targetId` | Para AREA e DEVICE | UUID da área ou device |
| `targetAreaId` | Para DEVICE | UUID da área pai do device |
| `dateFrom` | Não | Filtro inicial de data (ISO 8601) |
| `dateTo` | Não | Filtro final de data (ISO 8601) |

---

### IoT Config

#### `POST /api/properties/:propertyId/areas/:areaId/devices/:deviceId/iot-config`

**MQTT:**

```json
{
  "protocol": "MQTT",
  "host": "broker.hivemq.com",
  "port": 1883,
  "topic": "lumitrack/casa/sala/medidor",
  "extra": {
    "username": "usuario",
    "password": "senha"
  }
}
```

**Modbus TCP:**

```json
{
  "protocol": "MODBUS_TCP",
  "host": "192.168.1.10",
  "port": 502,
  "address": "40001",
  "extra": {
    "unitId": 1,
    "pollingIntervalMs": 5000
  }
}
```

**RS485:**

```json
{
  "protocol": "RS485",
  "address": "/dev/ttyUSB0",
  "extra": {
    "baudRate": 9600,
    "pollingIntervalMs": 10000
  }
}
```

**Modbus RTU:**

```json
{
  "protocol": "MODBUS_RTU",
  "address": "/dev/ttyS0",
  "extra": {
    "baudRate": 9600,
    "unitId": 1,
    "pollingIntervalMs": 5000
  }
}
```

> **Protocolos suportados:** `MQTT`, `MODBUS_TCP`, `MODBUS_RTU`, `ETHERNET_IP`, `PROFIBUS`, `PROFINET`, `RS232`, `RS485`

```json
// Resposta 201
{
  "status": "success",
  "data": {
    "id": "uuid",
    "deviceId": "uuid",
    "protocol": "MQTT",
    "host": "broker.hivemq.com",
    "port": 1883,
    "topic": "lumitrack/casa/sala/medidor",
    "address": null,
    "extra": { "username": "usuario" }
  }
}
```

---

#### `GET /api/properties/:propertyId/areas/:areaId/devices/:deviceId/iot-config`

Retorna a configuração IoT do device.

---

#### `PUT /api/properties/:propertyId/areas/:areaId/devices/:deviceId/iot-config`

Atualiza a configuração (pode trocar de protocolo). Campos do protocolo antigo são zerados.

---

#### `DELETE /api/properties/:propertyId/areas/:areaId/devices/:deviceId/iot-config`

Remove a configuração e encerra a conexão IoT. Responde `204`.

---

### IoT Stream (SSE)

#### `GET /api/iot/stream`

Abre uma conexão **Server-Sent Events** para receber leituras e alertas em tempo real.

O cliente recebe apenas dados dos seus próprios devices.

**No browser ou Postman:**

```plaintext
GET http://localhost:3333/api/iot/stream
Authorization: Bearer <token>
Accept: text/event-stream
```

**Eventos emitidos:**

```plaintext
event: connected
data: {"deviceCount": 3}

event: reading
data: {"deviceId": "uuid", "kwhConsumed": 0.0031, "receivedAt": "2025-01-15T14:37:22.500Z"}

event: alert
data: {"id": "uuid", "userId": "uuid", "thresholdKwh": 100, "triggeredAt": "2025-01-15T14:37:23.000Z", ...}

: keep-alive
```

> Um comentário de keep-alive é enviado a cada 30 segundos para manter a conexão ativa através de proxies e firewalls.

**Exemplo com JavaScript (browser):**

```javascript
const evtSource = new EventSource('http://localhost:3333/api/iot/stream', {
  // EventSource não suporta headers nativamente — use uma lib como eventsource
});

evtSource.addEventListener('connected', (e) => {
  console.log('Conectado, devices:', JSON.parse(e.data).deviceCount);
});

evtSource.addEventListener('reading', (e) => {
  const { deviceId, kwhConsumed } = JSON.parse(e.data);
  console.log(`Device ${deviceId}: ${kwhConsumed} kWh`);
});

evtSource.addEventListener('alert', (e) => {
  const alert = JSON.parse(e.data);
  console.log('Alerta disparado:', alert.message);
});
```

---

## Estrutura de Pastas

```plaintext
backend/
├── prisma/
│   ├── schema.prisma          # Definição do banco de dados
│   └── migrations/            # Migrations geradas pelo Prisma
├── src/
│   ├── app.ts                 # Factory do Express app (injeção de dependências)
│   ├── server.ts              # Entry point — inicia servidor + workers IoT
│   ├── config/
│   │   └── env.ts             # Validação de variáveis de ambiente com Zod
│   ├── generated/
│   │   └── prisma/            # Cliente Prisma gerado (ignorado pelo git)
│   ├── modules/
│   │   ├── auth/              # Login, logout, recuperação de senha
│   │   ├── user/              # Cadastro e gestão de usuários
│   │   ├── distributor/       # Distribuidoras de energia
│   │   ├── property/          # Propriedades
│   │   ├── area/              # Áreas dentro das propriedades
│   │   ├── device/            # Aparelhos dentro das áreas
│   │   ├── consumption/       # Histórico de consumo
│   │   ├── alert/             # Alertas e notificações
│   │   ├── simulation/        # Simulação de custos
│   │   ├── report/            # Geração de relatórios
│   │   └── iot/
│   │       ├── iot.schema.ts          # Validação de configurações IoT
│   │       ├── iot.service.ts         # CRUD de configs IoT
│   │       ├── iot.repository.ts
│   │       ├── iot.routes.ts
│   │       ├── iot-stream.routes.ts   # Endpoint SSE
│   │       └── iot-worker/
│   │           ├── IoTConnectionManager.ts    # Singleton de conexões
│   │           ├── IoTDataProcessor.ts        # Processa leituras e notifica SSE
│   │           ├── ReadingBuffer.ts           # Buffer em memória
│   │           ├── HourlyRollupScheduler.ts   # Persiste acumulado a cada hora
│   │           └── protocols/
│   │               ├── IConnection.ts         # Interface comum
│   │               ├── MqttConnection.ts
│   │               └── ModbusTcpConnection.ts # + RS232, RS485, Profinet, etc.
│   └── shared/
│       ├── database/
│       │   └── prisma.ts          # Singleton do PrismaClient (produção)
│       ├── errors/
│       │   └── AppError.ts        # Hierarquia de erros da aplicação
│       ├── middlewares/
│       │   ├── authenticate.ts    # Middleware JWT + verificação no banco
│       │   └── errorHandler.ts    # Handler global de erros
│       └── test/
│           ├── prisma-test.ts         # PrismaClient para banco de teste unitário
│           ├── prisma-http-test.ts    # PrismaClient para banco de teste HTTP
│           ├── clean-database.ts      # Limpa banco de teste unitário
│           └── clean-http-database.ts # Limpa banco de teste HTTP
└── vitest.config.ts
```

---

## Códigos de Status HTTP

| Código | Significado | Quando ocorre |
| --- | --- | --- |
| `200` | OK | Operação bem-sucedida |
| `201` | Created | Recurso criado |
| `204` | No Content | Deletado com sucesso |
| `400` | Bad Request | Token de reset inválido/expirado |
| `401` | Unauthorized | Token ausente, inválido, expirado ou revogado |
| `403` | Forbidden | Recurso pertence a outro usuário |
| `404` | Not Found | Recurso não encontrado |
| `409` | Conflict | Duplicidade (e-mail, CPF, CNPJ) ou distribuidor com propriedades vinculadas |
| `422` | Unprocessable Entity | Dados inválidos (validação Zod) |
| `500` | Internal Server Error | Erro inesperado do servidor |

---
