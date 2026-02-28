# ⚡ LumiTrack

Projeto do 2º período do curso de Análise e Desenvolvimento de Sistemas - PUC-MG

O Lumitrack é uma aplicação focada no monitoramento e gerenciamento do consumo de energia elétrica para propriedades residenciais, comerciais e industriais. O sistema permite registrar o consumo em tempo real, fornecendo um histórico detalhado por propriedade, áreas específicas e aparelhos. Além de gerar relatórios diários, mensais e anuais, o Lumitrack é capaz de identificar tendências de consumo e disparar alertas quando o uso de energia foge do padrão.

## Principais Funcionalidades

### Autenticação e Segurança: Sistema de login baseado em tokens JWT

- Controle de expiração: tokens da web possuem prazo de validade, enquanto os de dispositivos móveis não expiram por tempo.
- Revogação de tokens em caso de logout ou término do prazo.
- Recuperação de senha segura através de e-mail.

### Gestão de Usuários

- Suporte para cadastro de Pessoa Física (residencial) e Pessoa Jurídica (comercial/industrial).

### Hierarquia de Monitoramento

- **Propriedades:** Cadastro de múltiplas propriedades vinculadas exclusivamente ao usuário.
- **Áreas:** Divisão lógica das propriedades em várias áreas, pertencentes apenas àquela propriedade.
- **Aparelhos:** Cadastro de aparelhos específicos dentro de cada área.

### Distribuidoras de Energia

- Cadastro obrigatório das companhias de distribuição (com CNPJ, tipo de sistema, tensão e preço do kWh).
- Vinculação obrigatória de uma distribuidora à propriedade.

### Histórico e Alertas

- Visualização, inserção, edição e exclusão de histórico de consumo diário, mensal ou anual.
- Configuração de alertas personalizáveis para consumo fora do padrão nos níveis de propriedade, área ou aparelho.

### Integração IoT

- Configuração de dispositivos IoT através de protocolos como MQTT, Modbus, EtherNet/IP, RS485, etc., para coleta de dados em tempo real.

## Tecnologias Utilizadas

### Back-end (em desenvolvimento)

- **Linguagem & Framework:** Node.js (TypeScript) + Express
- **Banco de Dados:** PostgreSQL com Prisma ORM
- **Validação de Dados:** Zod
- **Segurança & Criptografia:** Bcrypt.js, Helmet, CORS e JSON Web Tokens (JWT).
- **Testes (TDD):** Vitest (Testes unitários, integração e E2E) e Supertest.

### Front-end (Planejado)

- React com Next.js (TypeScript)

### Mobile (Planejado)

- Mobile: React Native (TypeScript)

## Diagramas do Sistema

### 1. Diagrama de Casos de Uso

Principais interações dos atores (Pessoa Física ou Jurídica) com o sistema.

```mermaid
flowchart LR
    User([Usuário<br/>PF ou PJ])
    
    User --> UC1(Gerenciar Propriedades e Hierarquia)
    User --> UC2(Cadastrar Distribuidora de Energia)
    User --> UC3(Acompanhar/Editar Consumo e Custos)
    User --> UC4(Configurar Alertas de Consumo)
    User --> UC5(Configurar Dispositivos IoT)
    User --> UC6(Gerar Relatórios de Consumo)
    
    subgraph Funcionalidades Core
        UC1 -.-> |Inclui| UC1_1(Áreas)
        UC1 -.-> |Inclui| UC1_2(Aparelhos)
        UC3 -.-> |Depende de| UC2
    end
```

### 2. Diagrama Entidade-Relacionamento (ER)

```mermaid
erDiagram
    USER ||--o{ PROPERTY : "possui"
    USER ||--o{ ENERGY_DISTRIBUTOR : "cadastra"
    USER ||--o{ AUTH_TOKEN : "gera"
    USER ||--o{ ALERT : "recebe"
    
    ENERGY_DISTRIBUTOR ||--o{ PROPERTY : "abastece"
    
    PROPERTY ||--o{ AREA : "contém"
    PROPERTY ||--o{ CONSUMPTION_RECORD : "registra"
    PROPERTY ||--o{ ALERT : "alvo de"
    
    AREA ||--o{ DEVICE : "contém"
    AREA ||--o{ CONSUMPTION_RECORD : "registra"
    AREA ||--o{ ALERT : "alvo de"
    
    DEVICE ||--o| IOT_DEVICE_CONFIG : "configurado via"
    DEVICE ||--o{ CONSUMPTION_RECORD : "registra"
    DEVICE ||--o{ ALERT : "alvo de"
```

### 3. Diagrama de Classes da Aplicação

Reflete a estrutura de dados baseada nas entidades do sistema.

```mermaid
classDiagram
    class User {
        +String id
        +String name
        +String email
        +String passwordHash
        +UserType type
        +String document
        +DateTime createdAt
        +DateTime updatedAt
        +login()
        +logout()
        +resetPassword()
    }

    class EnergyDistributor {
        +String id
        +String name
        +String cnpj
        +SystemType systemType
        +String voltage
        +Float kwhPrice
        +String userId
        +calculateCost(kwh: Float)
    }

    class Property {
        +String id
        +String name
        +String userId
        +String distributorId
        +addArea(area: Area)
        +getConsumptionHistory()
    }

    class Area {
        +String id
        +String name
        +String propertyId
        +addDevice(device: Device)
    }

    class Device {
        +String id
        +String name
        +Float powerWatts
        +String areaId
        +configureIoT(config: IoTDeviceConfig)
    }

    class ConsumptionRecord {
        +String id
        +DateTime date
        +Float kwhConsumed
        +Float totalCost
        +String propertyId
        +String areaId
        +String deviceId
    }

    class IoTDeviceConfig {
        +String id
        +String protocol
        +String ipAddress
        +Int port
        +String deviceId
        +connect()
        +syncData()
    }

    class Alert {
        +String id
        +String message
        +Float threshold
        +Boolean isTriggered
        +String userId
        +String propertyId
        +triggerAlert()
    }

    %% Relacionamentos
    User "1" *-- "0..*" Property : possui
    User "1" *-- "0..*" EnergyDistributor : cadastra
    User "1" *-- "0..*" Alert : recebe

    EnergyDistributor "1" o-- "0..*" Property : abastece

    Property "1" *-- "0..*" Area : contém
    Property "1" *-- "0..*" ConsumptionRecord : registra
    Property "1" *-- "0..*" Alert : alvo de

    Area "1" *-- "0..*" Device : contém
    Area "1" *-- "0..*" ConsumptionRecord : registra
    
    Device "1" *-- "0..*" ConsumptionRecord : registra
    Device "1" o-- "0..1" IoTDeviceConfig : configurado via
```

### 4. Diagrama de Fluxo de Autenticação e Autorização

Representa o ciclo de vida dos tokens web e mobile.

```mermaid
sequenceDiagram
    participant Cliente (Web/Mobile)
    participant Lumitrack API
    participant Banco de Dados
    
    Cliente (Web/Mobile)->>Lumitrack API: POST /auth/login (email, senha)
    Lumitrack API->>Banco de Dados: Valida credenciais
    alt Credenciais Inválidas
        Lumitrack API-->>Cliente (Web/Mobile): 401 Unauthorized
    else Credenciais Válidas
        Lumitrack API->>Banco de Dados: Salva AuthToken (Define expiresAt para Web)
        Lumitrack API-->>Cliente (Web/Mobile): Retorna Token JWT
    end
    
    Cliente (Web/Mobile)->>Lumitrack API: Requisição Autenticada (Header: Bearer Token)
    Lumitrack API->>Banco de Dados: Verifica se Token não foi revogado
    Lumitrack API-->>Cliente (Web/Mobile): Retorna Dados
    
    Cliente (Web/Mobile)->>Lumitrack API: POST /auth/logout
    Lumitrack API->>Banco de Dados: Define revokedAt no AuthToken
    Lumitrack API-->>Cliente (Web/Mobile): 200 OK (Deslogado)
```

### 5. Diagrama de Fluxo do Usuário (PF/PJ)

Ilustra a jornada de um usuário (Pessoa Física ou Pessoa Jurídica) desde o acesso à plataforma até a utilização das principais funcionalidades (cadastro de hierarquias, visualização de consumo e configuração de alertas/IoT).

```mermaid
flowchart TD
    A[Início / Landing Page] --> B{Possui Conta?}
    B -- Não --> C[Cadastro de Usuário PF/PJ]
    C --> D[Login]
    B -- Sim --> D
    
    D --> E[Dashboard Principal]
    
    E --> F[Gestão de Distribuidoras]
    F --> F1[Cadastrar/Editar Distribuidora]
    
    E --> G[Gestão de Propriedades]
    G --> G1[Cadastrar Propriedade]
    G1 -.-> |Requisito| F1
    G --> G2[Acessar Áreas da Propriedade]
    
    G2 --> G3[Cadastrar/Editar Área]
    G2 --> G4[Acessar Aparelhos da Área]
    
    G4 --> G5[Cadastrar/Editar Aparelho]
    G5 --> G6[Configurar Dispositivo IoT]
    
    E --> H[Monitoramento de Consumo]
    H --> H1[Inserção Manual de Histórico]
    H --> H2[Visualizar Gráficos e Relatórios Diários/Mensais/Anuais]
    H --> H3[Simulação de Custos]
    
    E --> I[Alertas e Notificações]
    I --> I1[Configurar Alertas de Consumo Padrão]
    I --> I2[Visualizar Alertas Disparados]
    
    E --> J[Configurações e Perfil]
    J --> K[Logout]
```
