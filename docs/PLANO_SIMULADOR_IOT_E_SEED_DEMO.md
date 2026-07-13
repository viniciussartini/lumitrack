# Plano — Simulador de dispositivos IoT e seed de demonstração realista

> **Status:** em implementação na branch `feat/demo-environment`. Fase 1 (simulador) **completa** em 13/07/2026 — servidor (Sub-issue 1) e UI (Sub-issue 2) implementados e verificados (ver log de implementação em [LOG_SIMULADOR_IOT.md](./LOG_SIMULADOR_IOT.md)). Fases 2-4 (seed, login demo, proteção) ainda não implementadas.
>
> **Data do planejamento:** 11/07/2026.
>
> **Issues:** ver [ISSUES_SIMULADOR_IOT_E_SEED_DEMO.md](./ISSUES_SIMULADOR_IOT_E_SEED_DEMO.md) (épico + sub-issues para o GitHub).

## Contexto

O backend do LumiTrack só recebe consumo hoje via medidores IoT reais (`Meter` conectando por MQTT/Modbus/etc. — ver a reformulação em [PLANO_REFORMULACAO_IOT.md](./PLANO_REFORMULACAO_IOT.md)), e não há hardware IoT disponível para testar o fluxo ponta a ponta (tempo real, alertas, gráficos). Duas necessidades complementares, mais duas features de suporte a demonstração pública do projeto (portfólio):

1. **Simulador de dispositivos IoT** — ferramenta de dev standalone que finge ser uma rede de medidores reais publicando via MQTT, para exercitar o pipeline de ingestão, o card de tempo real e os alertas ao vivo sem hardware.
2. **Seed de demonstração** — dados históricos realistas (1 ano, até 10/07/2026) para dois usuários (PF e PJ), para navegar a UI (gráficos, relatórios, alertas) com um banco que pareça "de verdade" desde o primeiro login.
3. **Login de demonstração** — dois botões na tela de login que autenticam direto com os usuários do seed, para que um visitante (ex.: recrutador olhando o portfólio) explore a aplicação em um clique, sem criar conta.
4. **Proteção da conta demo** — a senha das contas de demonstração não pode ser alterada por quem as usa.

Achados de pesquisa no código que moldam a solução:

- Só **MQTT** está de fato integrado ponta a ponta no backend (`backend/src/modules/iot/iot-worker/protocols/MqttConnection.ts` repassa o JSON recebido direto pro processor; os demais protocolos — Modbus TCP incluso — só emitem `{register, value, timestamp}` ou equivalente, que nunca passa na validação do `IoTDataProcessor`).
- **Não existe broker MQTT no ambiente de dev** — o backend só guarda `host`/`port`/`topic` no `Meter` e conecta como client.
- `MeterReading` só existe em grão de **minuto** (`@@unique([meterId, minuteStart])`), sem tabela agregada por hora/dia — um seed fiel de 1 ano por medidor é ~525.600 linhas, sem atalho.
- O app **não tem** "trocar senha enquanto logado" — o único caminho que muda uma senha é `POST /auth/forgot-password` → `POST /auth/reset-password` (token por e-mail).

**Decisões tomadas:**

- Simulador = app standalone (`iot-simulator/`) com broker MQTT embutido (via `aedes`), não depende de broker externo.
- Simulação rica: múltiplos dispositivos virtuais agrupados em "redes", com controle individual (liga/desliga, parâmetros elétricos, injeção de anomalia).
- Seed de demo = script separado e opcional (`backend/prisma/seed-demo.ts`), não roda automaticamente em `prisma migrate reset`.
- Escopo dos usuários demo: CPF residencial simples (1 propriedade, 1 medidor) + CNPJ comercial rico (2 áreas, dispositivos, medidores em níveis diferentes — propriedade/área/dispositivo).
- Login de demonstração: dois botões ("Ver demo residencial"/"Ver demo comercial"), visíveis só atrás de uma flag de ambiente (`VITE_DEMO_MODE`), reaproveitando o login real com credenciais conhecidas — sem endpoint novo de auth.
- A conta demo é protegida contra alteração de senha no único ponto do sistema que permite trocar senha (`forgot-password`), reaproveitando o padrão de anti-enumeração de e-mail já existente.

---

## Fase 1 — Simulador de dispositivos IoT (`iot-simulator/`, novo app standalone) ✅ Concluída (13/07/2026)

### Estrutura

```
iot-simulator/
├── package.json              # raiz com npm workspaces locais ["server","ui"] + script "dev" via concurrently
├── server/
│   └── src/
│       ├── index.ts               # bootstrap: broker aedes + API HTTP + engine de simulação
│       ├── config/env.ts          # zod: BROKER_PORT, API_PORT, CORS_ORIGIN
│       ├── broker/broker.ts       # instancia Aedes + net.Server, start/stop
│       ├── simulation/
│       │   ├── types.ts           # VirtualNetwork, VirtualDevice, DeviceParams, AnomalyState
│       │   ├── store.ts           # Map em memória + EventEmitter("changed") pro SSE
│       │   ├── signalGenerator.ts # gera {voltage,current,powerW,powerFactor} por tick (Box-Muller p/ ruído)
│       │   ├── deviceRunner.ts    # setInterval 1s por device ligado: gera + publica + atualiza estado
│       │   └── simulationEngine.ts # orquestra start/stop de runners, expira anomalias por tempo
│       ├── mqtt/internalPublisher.ts  # cliente `mqtt` (mesma versão do backend) publicando em localhost:<BROKER_PORT>
│       ├── api/{app.ts, routes/{networks,devices,status}.routes.ts}
│       └── shared/logger.ts       # pino, mesmo padrão do backend
└── ui/
    └── src/
        ├── components/ui/         # Button/Input/Select/cn.ts copiados de frontend/src/components/ui (subset mínimo)
        ├── components/network/NetworkCard.tsx
        ├── components/device/{DeviceCard,DeviceControls,AnomalyButton}.tsx
        ├── hooks/{useNetworks,useLiveStatus}.ts   # TanStack Query + SSE, mesmo padrão de frontend/src/hooks/queries
        ├── pages/Dashboard.tsx    # página única
        └── services/api.ts
```

Projeto genuinamente separado do `backend`/`frontend` (sem imports cross-projeto). Componentes de UI copiados (não importados via path relativo), aceitável para uma ferramenta interna pequena.

### Contrato MQTT a respeitar

Fonte: `backend/src/modules/iot/iot-worker/IoTDataProcessor.ts`. Payload por amostra, publicado no tópico do `Meter`, ~1×/s:

```json
{ "deviceTimestamp": "2026-07-11T14:32:01.123Z", "voltage": 219.8, "current": 6.71, "powerW": 1475.3, "powerFactor": 0.923 }
```

Regras: `voltage`/`current`/`powerW` finitos e `>= 0`; `powerFactor` finito em `[0,1]`; `deviceTimestamp` é só diagnóstico (nunca usado pro cálculo de energia — feito no backend via `Δt` desde o recebimento, clamp em `[0,5]s`). Payload inválido é descartado com log, sem derrubar a conexão.

### Modelo de dados do simulador (em memória, sem banco próprio)

```ts
interface DeviceParams {
    nominalVoltage: number; nominalPowerW: number; powerFactorBase: number
    noiseAmplitudePercent: number; profile: "RESIDENTIAL_STEADY" | "COMMERCIAL_HVAC" | "INDUSTRIAL_MOTOR" | "CUSTOM"
}
interface AnomalyState { active: boolean; multiplier: number; endsAt: number | null }
interface VirtualDevice {
    id: string; networkId: string; name: string; topic: string; poweredOn: boolean
    params: DeviceParams; anomaly: AnomalyState
    lastSample: {voltage:number;current:number;powerW:number;powerFactor:number} | null
    lastPublishedAt: number | null; publishCount: number; connected: boolean
}
interface VirtualNetwork { id: string; name: string; devices: Map<string, VirtualDevice> }
```

Reiniciar o simulador zera tudo — aceitável (ferramenta de dev, sem estado que precise sobreviver a restart).

### Geração de sinal + anomalia sob demanda

Por tick (1 Hz, por device ligado): variação suave (soma de senoide de período longo) + ruído gaussiano (Box-Muller, sem dependência externa) sobre `nominalPowerW`; deriva `current = powerW / (voltage * powerFactor)` mantendo `P = V·I·PF` fisicamente coerente. Anomalia (`POST /api/devices/:id/anomaly` com `{multiplier?, durationSeconds}`) multiplica a potência-alvo e aplica leve sag de tensão (~3%) enquanto `Date.now() < endsAt`; um scan periódico desativa automaticamente ao expirar — cobre "injetar pico de potência fora do padrão por N segundos" para testar o `AlertEvaluator` real em tempo real.

### API de controle (REST + SSE)

```
GET/POST     /api/networks                 DELETE /api/networks/:id
GET/POST     /api/networks/:id/devices
PATCH/DELETE /api/devices/:id
POST         /api/devices/:id/power         { on: boolean }
POST         /api/devices/:id/anomaly       { multiplier?, durationSeconds }
DELETE       /api/devices/:id/anomaly
GET          /api/status/stream             SSE — snapshot a cada mudança
GET          /api/broker/info               { host, port }
```

Validação com `zod`, sem autenticação (ferramenta local — README deve avisar para nunca expor publicamente).

### UI

Página única (`Dashboard.tsx`): header com `host:port` do broker embutido em destaque + botão copiar; lista de redes expansíveis; card por dispositivo com nome, tópico (copiável), toggle liga/desliga, controles de tensão/potência/PF/ruído, indicador "publicando" (bolinha verde + timestamp da última amostra) vs "desligado", botão "Injetar anomalia" (multiplicador + duração, defaults 3×/30s) com badge "anomalia ativa — encerra em Xs". Dados via TanStack Query + SSE.

### Portas (ajustáveis via `.env` se colidirem com algo já rodando)

| Serviço | Porta |
|---|---|
| Broker MQTT embutido (Aedes) | `1883` |
| API de controle | `4100` |
| UI (Vite dev) | `5180` |

Backend do LumiTrack usa `3333`, frontend `5173` — sem colisão.

### Fora de escopo

Modbus TCP e demais protocolos (`MODBUS_RTU`, `ETHERNET_IP`, `PROFIBUS`, `PROFINET`, `RS232`, `RS485`) não são alvo — o backend real não tem decodificação de registrador implementada para eles.

**Verificação:** `npm run dev` sobe broker + API + UI; criar um `Meter` no LumiTrack apontando pro broker embutido e ligar um dispositivo virtual faz o `RealTimeCard` do LumiTrack atualizar ao vivo; "Injetar anomalia" faz o `WarningBadge` acender.

**Nota de implementação:** executado como planejado (servidor e UI, Sub-issues 1 e 2), com os desvios abaixo (documentados também no log de implementação):

1. **`npm workspaces` raiz criado só quando a UI começou** — `iot-simulator/package.json` com `["server","ui"]` + script `dev` via `concurrently` foi adiado da Sub-issue 1 pra Sub-issue 2, quando `ui/` passou a existir de fato; `server/package-lock.json` próprio foi removido e consolidado no lockfile raiz do workspace.
2. **Vitest 4 não exclui `dist/` por padrão** (diferente de versões anteriores) — depois do primeiro build, os testes rodavam em dobro (fonte + compilado); corrigido com `exclude` explícito no `vitest.config.ts` do servidor.
3. **Aedes 1.x exige `await aedes.listen()`** antes de aceitar conexões — sem isso o handshake MQTT trava silenciosamente (o socket TCP conecta, mas nenhum CONNACK/erro é emitido); não documentado nos exemplos públicos da lib.
4. **`exactOptionalPropertyTypes: true` rejeitava o merge de `params` parcial** (zod `.partial()`) sobre `DeviceParams` — corrigido com um helper `mergeDefined()` e tipos de input declarando `| undefined` explicitamente, espelhando a inferência real do zod.
5. **`EmbeddedBroker.start(port)` retorna a porta efetivamente vinculada** (`Promise<number>`, não `void`) — permite testes pedirem porta `0` (SO escolhe) sem colisão entre execuções paralelas.
6. **Arquivos extras não previstos na árvore da Estrutura**, mas consistentes com o padrão do backend: `api/schemas.ts` (schemas zod centralizados) e `shared/errors.ts` (`NotFoundError`).
7. **`POST /api/networks` tinha um bug de serialização** — devolvia a `VirtualNetwork` crua (`devices` é um `Map`, que vira `"{}"` no JSON em vez de `"[]"`), inconsistente com o resto da API. Encontrado testando o fluxo completo pela UI; corrigido para serializar `devices: []` explicitamente, com teste de regressão.
8. **`Button` da UI é um subset do original** — sem a variante `asChild`/Radix `Slot` (não há necessidade de botão polimórfico aqui), evitando uma dependência extra.
9. **`useLiveStatus` usa `EventSource` nativo do browser**, não `@microsoft/fetch-event-source` (lib usada no frontend principal) — o endpoint SSE do simulador não exige headers customizados/credenciais, então a API nativa basta.
10. **Sem `useQuery` de leitura para redes/devices na UI** — só o hook de SSE (`useLiveStatus`). O primeiro evento já chega com o snapshot completo ao conectar, tornando uma query REST inicial redundante.
11. **Verificação em browser real não foi possível** — sem acesso à internet no sandbox usado para baixar o Chromium via Playwright (mesma limitação já registrada na reformulação IoT, `LOG_IMPLEMENTACAO_IOT.md` Fase 5 desvio #6). Verificação alternativa: fluxo completo exercitado via HTTP direto contra o proxy `/api` da UI (`localhost:5180`), incluindo consumo do SSE stream via `fetch` com leitura manual de chunks — mesmo caminho que o browser usaria.

---

## Fase 2 — Seed de demonstração realista (`backend/prisma/seed-demo.ts`, script opcional)

### Estrutura

```
backend/src/shared/config/demoAccounts.ts   # fonte única: DEMO_ACCOUNT_EMAILS (Set) — usado pelo seed E pelo guard da Fase 4
backend/prisma/seed-demo.ts                 # main(): resetDemoData → identities → topology → alerts → readings → AlertTriggerEvents → printSummary
backend/prisma/seed-demo/
  ├── constants.ts      # senha demo, nomes, janela de datas — importa e-mails de @/shared/config/demoAccounts.js
  ├── identities.ts     # geradores de CPF/CNPJ válidos + criação dos 2 usuários via UserService
  ├── consumptionGen.ts # perfis de carga + gerador puro de amostra por minuto
  ├── anomalies.ts       # janelas de anomalia por medidor
  └── verify.ts          # queries de conferência final
```

Novo script em `backend/package.json`: `"db:seed:demo": "tsx prisma/seed-demo.ts"`, rodado manualmente. **Não mexe** em `prisma.config.ts` (que continua apontando `migrations.seed` só para o `seed.ts` de catálogo, rápido e automático em todo `prisma migrate reset`).

### Usuários demo

`UserService.createUser` (`backend/src/modules/user/user.service.ts`) garante hash bcrypt (12 rounds), `consentedAt`/`consentVersion`, criptografia+blind index de CPF/CNPJ — reuso obrigatório pros usuários conseguirem logar de verdade.

- CPF e CNPJ **sintéticos mas com dígito verificador matematicamente válido** — reimplementando `isValidCpf`/`isValidCnpj` (`backend/src/modules/user/user.schema.ts`) "de trás para frente".
- E-mails: `demo.residencial@lumitrack.dev` (INDIVIDUAL) / `demo.comercial@lumitrack.dev` (COMPANY).
- Senha única: `DemoLumi@2026` (satisfaz `passwordSchema`), documentada no script e impressa no console ao final. Este script **nunca deve rodar contra produção real**.

### Propriedades / áreas / dispositivos / medidores

Reaproveita `PropertyService.create(userId, input)`, `AreaService.create(propertyId, userId, input)`, `DeviceService.create(areaId, propertyId, userId, input)` — garante criptografia de endereço e validação de posse. `Meter` via `prisma.meter.create` direto (não tem service próprio de escrita).

- **CPF — residencial**: 1 `Property` (`BIPHASIC`, `B1`), 1 `Meter` a nível `PROPERTY`.
- **CNPJ — comercial** (padaria/loja): 1 `Property` (`TRIPHASIC`, `B3`, `publicLightingFeeBrl`), 2 `Area` ("Área de Vendas", "Produção/Cozinha"), 3 `Device` (forno industrial, câmara fria, ar-condicionado). Medidores nos 3 níveis: propriedade, área de vendas, forno — 3 medidores para o CNPJ.
- Total: **4 medidores** → ~4 × 525.600 ≈ **2,1 milhões de linhas** de `MeterReading`.

### Geração de consumo de 1 ano (grão de minuto)

Janela: `2025-07-11T00:00 -03:00` até `2026-07-10T23:59 -03:00` (Brasil sem horário de verão desde 2019 — conversão pra UTC é soma fixa de 3h).

Perfis de carga puros, sem I/O:
- **Residencial**: base ~280W + dois lobos de pico (manhã leve, noite forte), fim de semana ~25% mais alto, leve sazonalidade de verão.
- **Comercial geral**: base ~600W, patamar alto 8h-19h com dip no almoço, domingo fechado.
- **Forno**: rajadas curtas no horário de produção.

Por minuto: potência-alvo → deriva `avgVoltage`/`avgPowerFactor` com ruído pequeno → `avgCurrent = avgPowerW / (avgVoltage * avgPowerFactor)` (coerência física por construção) → `kwhConsumed = avgPowerW * 60 / 3_600_000`. RNG com seed fixa (determinístico entre execuções).

### Alertas + anomalias históricas

3 alertas (`Alert`): 1 para o CPF (`referencePowerKw: 4, tolerancePercent: 25`), 2 para o CNPJ (medidor geral `11kW±20%`; forno `5kW±15%`). 6 episódios de anomalia espalhados pelo ano (3-9 min, multiplicador 2.1×-3.5×), com `AlertTriggerEvent` gravado ao fim de cada janela (`startedAt`/`endedAt`/`durationSeconds`/`min`/`max`/`avgPowerW`/`sampleCount`) — nunca via `AlertEvaluator` ao vivo, que não reprocessa histórico.

### Performance

Nunca gerar os ~2,1M registros em memória de uma vez. Por medidor, iterar minuto a minuto, acumular em buffer de `BATCH_SIZE = 10_000` e `prisma.meterReading.createMany({ data: batch, skipDuplicates: true })` a cada lote; medidores processados sequencialmente. Medir o tempo real na primeira execução e ajustar `BATCH_SIZE` se necessário.

### Idempotência

`ON DELETE CASCADE` já cobre `User → Property/Area/Device → Meter → MeterReading/Alert → AlertTriggerEvent`. Primeiro passo do `main()`: `prisma.user.deleteMany({ where: { email: { in: [...DEMO_ACCOUNT_EMAILS] } } })` — rodar 2× nunca duplica. Nunca mexe na tabela de distribuidoras; se `seed.ts` nunca rodou, falha cedo com mensagem clara.

### Verificação final (console)

Por medidor: contagem de leituras, soma de kWh, potência média. Lista dos episódios de alerta gerados. Credenciais de login dos dois usuários demo.

---

## Fase 3 — Login de demonstração (`frontend/src/pages/auth/LoginPage.tsx`)

Objetivo: um visitante acessando um deploy público do portfólio entra direto com os usuários do seed, sem formulário nem conta.

### Mecanismo — reusa o login real, sem endpoint novo

`useAuth().login(input: LoginInput)` (`frontend/src/contexts/AuthContext.tsx`) é a mesma função que a `LoginPage` já chama no submit normal. Os botões de demo chamam essa função com credenciais fixas do seed, seguindo o mesmo caminho de navegação de um login normal — nenhuma rota/sessão nova no backend. Usuários demo têm `mfaEnabled: false`, então o login retorna sessão completa sem etapa de MFA.

- Novo `frontend/src/config/demoUsers.ts` com `DEMO_USERS.residential`/`.commercial` (email/senha/label), comentário apontando sincronia com `backend/prisma/seed-demo/constants.ts`.
- `LoginPage.tsx`: bloco novo, renderizado só quando `import.meta.env.VITE_DEMO_MODE === "true"` (mesmo padrão de `import.meta.env.DEV` já usado em `main.tsx`/`App.tsx`) — dois botões secundários "Ver demo residencial"/"Ver demo comercial" chamando `login()` com as credenciais correspondentes, mesmo tratamento de erro/loading do formulário normal.
- `frontend/.env.example`: `VITE_DEMO_MODE=false` — só vira `true` no ambiente do deploy de demonstração pública.

### Por que não um endpoint dedicado

Um "login sem senha" no backend seria superfície de auth nova. Como as credenciais demo já são públicas por natureza, reaproveitar o login real com credenciais conhecidas é mais simples e não introduz bypass algum — é o mesmo fluxo que digitar as credenciais manualmente teria.

**Verificação:** com a flag desligada, tela idêntica à atual; com a flag ligada e seed rodado, um clique loga e navega; com a flag ligada e seed não rodado, mesmo erro de credenciais inválidas de um login normal.

---

## Fase 4 — Proteção da conta demo contra alteração de senha

O app **não tem** "trocar senha enquanto logado" (`PUT /api/users/:id` não aceita senha; `SecurityPage.tsx` só trata MFA). O único caminho que muda uma senha é `POST /auth/forgot-password` → `POST /auth/reset-password`. É aí que a conta demo precisa ser bloqueada.

`AuthService.forgotPassword` (`backend/src/modules/auth/auth.service.ts`) já segue o padrão de segurança anti-enumeração de e-mail: se o e-mail não existe, retorna silenciosamente. A guarda da conta demo reaproveita exatamente esse padrão:

```ts
// dentro de forgotPassword, logo após localizar `user`
if (!user) return
if (DEMO_ACCOUNT_EMAILS.has(user.email)) return   // conta demo: nenhum token é criado, nenhum e-mail é enviado
```

Como nenhum token de reset é criado, `resetPassword` nunca pode ser concluído para a conta demo — estruturalmente impossível, sem precisar de checagem lá. A resposta HTTP é idêntica nos dois casos (e-mail inexistente vs. conta demo) — nenhum visitante consegue distinguir pela resposta.

`DEMO_ACCOUNT_EMAILS` vem de `backend/src/shared/config/demoAccounts.ts` (fonte única, usada pelo seed e pelo guard).

**Riscos relacionados, fora deste escopo** (sinalizados, não implementados): trocar e-mail via `PUT /api/users/:id`, ativar 2FA via `SecurityPage`, ou excluir a conta via `DELETE /api/users/:id` também quebrariam o demo para futuros visitantes. Se desejado no futuro, o mesmo guard (`DEMO_ACCOUNT_EMAILS.has(...)`) pode ser estendido a `UserService.update`/`.delete`/`AuthService.setupMfa`.

**Verificação:** `POST /auth/forgot-password` com o e-mail demo dá a mesma resposta que um e-mail inexistente; nenhum `PasswordReset` é criado no banco.

---

## Ordem de execução

Fase 1 (simulador) é independente das demais. Fase 2 (seed) não depende de nada além do catálogo de distribuidoras já seedado. Fase 3 (login demo) depende dos usuários existirem (Fase 2) para fazer sentido em uso real, mas tecnicamente só precisa das credenciais conhecidas. Fase 4 (guard) depende só da constante compartilhada `DEMO_ACCOUNT_EMAILS` (pode ser feita a qualquer momento, mas faz mais sentido depois da Fase 2 definir os e-mails). Sugestão de ordem: 2 → 4 → 3, com a Fase 1 em paralelo a qualquer momento.

## Verificação fim a fim

1. `npm run dev` em `iot-simulator/` → UI mostra `host:port` do broker e um dispositivo de exemplo.
2. `npm run db:seed:demo` no backend → console mostra os 4 medidores com totais de kWh e os 6 episódios de alerta.
3. Com `VITE_DEMO_MODE=true`, clicar "Ver demo residencial" → entra direto → propriedade, gráfico Hora/Dia/Mês/Ano com 1 ano de histórico, alertas com episódio histórico.
4. Criar/editar um `Meter` no LumiTrack apontando pro broker do simulador → ligar um dispositivo virtual → `RealTimeCard` atualiza ao vivo.
5. "Injetar anomalia" no simulador → `WarningBadge` acende, episódio novo no histórico ao normalizar.
6. Repetir o passo 3 com "Ver demo comercial" → propriedade com 2 áreas/3 dispositivos/3 medidores.
7. `POST /auth/forgot-password` com o e-mail demo → resposta idêntica a e-mail inexistente, nenhum `PasswordReset` criado.

## Riscos e pontos de atenção

- Porta `1883` do broker embutido pode colidir com outro broker MQTT já rodando localmente — ajustável via `.env` do simulador.
- Tempo real de execução do seed (~2,1M linhas) não foi medido ainda — calibrar `BATCH_SIZE` na primeira rodada.
- Senha demo fixa e visível no código-fonte (`DemoLumi@2026`) — aceitável por ser 100% sintético, mas reforça que `seed-demo.ts` é estritamente dev/local, nunca produção real.
- Riscos relacionados não cobertos (troca de e-mail/MFA/exclusão da conta demo) documentados na Fase 4, deixados como decisão futura.
