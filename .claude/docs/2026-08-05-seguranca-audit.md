# Auditoria de Segurança — 2026-08-05

Escopo: monorepo LumiTrack (`backend/`, `frontend/`, `iot-simulator/`), checklist-base `.claude/project_context/05-security-standards.md` (OWASP Top 10:2025 A01–A10 + segurança de frontend + PII/observabilidade). Todos os achados abaixo têm evidência em código real; nenhum é hipotético.

## Resumo (nº de achados por severidade)

| Severidade | Qtd |
|---|---|
| 🔴 Crítica | 1 |
| 🟠 Alta | 4 |
| 🟡 Média | 8 |
| 🔵 Baixa | 9 |
| **Total** | **22** |

Postura geral: o backend está **acima da média** — autorização por posse implementada de forma consistente e bem testada, Prisma 100% parametrizado, criptografia de PII em repouso com chaves compartimentadas, CSRF double-submit, rotação de refresh token com detecção de reuso, RBAC lido do banco a cada requisição. Os achados concentram-se em **observabilidade (vazamento de token/PII em log)**, **ciclo de vida de sessão após eventos de recuperação de conta**, **SSRF na configuração de medidores IoT** e **gaps de perímetro no pacote `iot-simulator`**.

---

## Achados

### [CRÍTICA] Cookie de sessão, refresh token e Bearer registrados em texto claro em todo log de requisição — A09 (Logging & Alerting) / PII

- **Local:**
  - `backend/src/app.ts:109-117` (pinoHttp sem serializers/redact)
  - `backend/src/shared/logger/logger.ts:32-35` (pino sem `redact`)
- **Evidência:**

  `logger.ts:32-35` instancia o pino sem nenhuma opção `redact`:
  ```ts
  export const logger = pino({
      level: resolveLogLevel(env.NODE_ENV, env.LOG_LEVEL),
      ...(transport && { transport }),
  })
  ```
  `app.ts:109` monta `pinoHttp({ logger, autoLogging: {...}, customLogLevel(...) })` sem `serializers` nem `redact`. Com isso valem os serializers padrão do `pino-std-serializers`:
  - `backend/node_modules/pino-std-serializers/lib/req.js:88` → `_req.headers = req.headers`
  - `backend/node_modules/pino-std-serializers/lib/res.js:38` → `_res.headers = res.getHeaders()`
  - `backend/node_modules/pino-http/logger.js:145` → `log.child({ [reqKey]: req })` (o `req` serializado é anexado a **toda** linha de log daquela requisição)
  - `backend/node_modules/pino-http/logger.js:129-135` → o log de "request completed" inclui `[resKey]: res`

  Consequência concreta: como o canal WEB carrega o JWT de sessão no cookie `lumitrack_session` e o refresh token em `lumitrack_refresh` (`auth.controller.ts:296-313`), **cada linha de log de produção contém o header `cookie` com o JWT de sessão e o refresh token em texto claro**, e as respostas de `/login`/`/refresh` logam o `set-cookie` com os mesmos valores. O canal MOBILE loga o header `authorization: Bearer <jwt>` (token de 90 dias). O log também carrega `user-agent`, IP e a query string.

  Isso viola diretamente dois itens do checklist: A09 ("**nunca** logar dado sensível (senha, token, CPF)") e "Proteção de PII em observabilidade — pino: redaction de campos sensíveis".
- **Recomendação:** adicionar `redact` no pino e/ou serializers customizados no `pino-http`, cobrindo no mínimo:
  ```ts
  redact: {
    paths: [
      'req.headers.cookie', 'req.headers.authorization',
      'res.headers["set-cookie"]',
      'req.headers["x-csrf-token"]', 'req.headers["x-refresh-csrf-token"]',
      'audit.metadata.attemptedEmail', 'entry.metadata.attemptedEmail',
      '*.password', '*.newPassword', '*.token', '*.mfaToken', '*.secret', '*.cpf', '*.cnpj',
    ],
    censor: '[REDACTED]',
  }
  ```
  Adicionar um teste que faz uma requisição autenticada capturando o stream do pino e falha se o valor do cookie de sessão aparecer na saída — é exatamente o tipo de teste exigido pela DoD ("falha se o controle for removido").

---

### [ALTA] SSRF sem allowlist: `host`/`port` do medidor são livres e disparam conexão de saída do servidor — A01 (Broken Access Control / SSRF)

- **Local:**
  - `backend/src/modules/meter/meter.schema.ts:44-45` e `52-53` (validação)
  - `backend/src/modules/meter/meter.controller.ts:42` e `:94` (dispara a conexão)
  - `backend/src/modules/iot/iot-worker/protocols/ModbusTcpConnection.ts:55` (socket real)
  - `backend/src/modules/iot/iot-worker/protocols/MqttConnection.ts:47,62`
- **Evidência:** o schema aceita qualquer string como host:
  ```ts
  protocol: z.literal("MODBUS_TCP"),
  host:     z.string().min(1, { message: "host é obrigatório para MODBUS_TCP" }),
  port:     z.number().int().min(1).max(65535, ...),
  ```
  E `meter.controller.ts:42` inicia a conexão imediatamente após o `create`:
  ```ts
  withConnectionManager((manager) => { void manager.start(toConnectionConfig(meter)) })
  ```
  chegando em `ModbusTcpConnection.ts:55`:
  ```ts
  socket.connect({ host: this.config.host, port: this.config.port }, () => {...})
  ```
  e em `MqttConnection.ts:47`: ``const brokerUrl = `mqtt://${this.config.host}:${this.config.port}` ``.

  Qualquer usuário autenticado (role `USER`) pode, portanto, forçar o servidor a abrir conexões TCP arbitrárias para `127.0.0.1`, faixas RFC1918, `169.254.169.254` (metadata de cloud) ou qualquer host externo — inclusive em loop, via `PUT /api/meters/:id` (`meter.controller.ts:94` faz `restart`). O checklist A01 pede explicitamente "proteção SSRF (**allowlist**) em requisições saída-servidor"; não há nenhuma no repositório.
- **Recomendação:** criar um validador compartilhado de destino IoT (ex.: `shared/security/outboundHost.ts`) aplicado no `meter.service` antes de persistir: resolver o hostname e **negar por padrão** loopback, link-local (`169.254.0.0/16`, `fe80::/10`), RFC1918/ULA e multicast, salvo se o host constar de uma allowlist configurável por env (`IOT_ALLOWED_HOSTS`/CIDRs). Restringir também a faixa de portas. Cobrir com teste que falhe se a allowlist for removida.

---

### [ALTA] Token de redefinição de senha armazenado em texto claro no banco — A04 (Cryptographic Failures)

- **Local:** `backend/src/modules/auth/auth.service.ts:238-247` e `:262`; `backend/src/modules/auth/auth.repository.ts:51-69`; `backend/prisma/schema.prisma:217-229`
- **Evidência:**
  ```ts
  const resetToken = randomUUID()
  ...
  await this.authRepository.createPasswordReset({ userId: user.id, token: resetToken, expiresAt })
  await this.sendPasswordResetEmail(email, resetToken)
  ```
  e a busca é por igualdade direta do valor puro (`auth.repository.ts:60`: `findUnique({ where: { token } })`). Isso é **inconsistente com o próprio padrão do projeto**: `AuthToken` e `RefreshToken` guardam apenas o hash SHA-256 (`auth.service.ts:386-391`, `:406-413`), com o comentário explícito "Em caso de vazamento do dump do banco, o hash não permite reconstruir um token de sessão válido" — proteção que o `PasswordReset` não tem. Um dump/leitura do banco (ou um backup vazado) entrega tomada de conta imediata de qualquer reset ativo na janela de 1 h.
- **Recomendação:** aplicar `hashToken(resetToken)` na escrita (`createPasswordReset`) e na leitura (`findPasswordReset`), enviando o valor puro apenas por e-mail — exatamente o padrão já usado para sessão/refresh. Migração: invalidar os resets pendentes existentes.

---

### [ALTA] Redefinição de senha não revoga as sessões e refresh tokens existentes — A07 (Authentication Failures)

- **Local:** `backend/src/modules/auth/auth.service.ts:250-282`
- **Evidência:** o fluxo completo de `resetPassword` termina em:
  ```ts
  const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)

  await Promise.all([
      this.authRepository.updateUserPassword(reset.userId, hashedPassword),
      this.authRepository.markPasswordResetAsUsed(reset.id),
  ])
  ```
  Não há chamada a `revokeAllRefreshTokensForUser` (que existe em `auth.repository.ts:258-263`) nem equivalente para `authToken`. O cenário-alvo do "esqueci minha senha" é justamente recuperar uma conta comprometida — e após o reset o atacante mantém sessão válida por até 15 min (WEB), refresh válido por 7 dias e, no canal MOBILE, **um Bearer válido por 90 dias** (`env.ts:18`).
- **Recomendação:** dentro da mesma transação do reset, revogar todos os `AuthToken` e `RefreshToken` do usuário (`revokedAt = now()`). Adicionar teste de integração: logar (MOBILE), fazer reset, e assertar 401 no token antigo.

---

### [ALTA] Re-inscrição de MFA sem step-up: uma sessão sequestrada substitui o segundo fator da vítima — A07 (Authentication Failures)

- **Local:** `backend/src/modules/auth/auth.service.ts:152-177`; `backend/src/modules/auth/auth.repository.ts:154-159` e `:177-181`; `backend/src/modules/auth/auth.schema.ts:49-52`
- **Evidência:** `verifyMfaSetup` exige apenas `{ secret, code }` — o `secret` vem **do próprio cliente** — e grava direto:
  ```ts
  await this.authRepository.setMfaSecret(userId, encryptMfaSecret(secret))
  await this.authRepository.createBackupCodes(userId, codeHashes)
  ```
  com `setMfaSecret` forçando `mfaEnabled: true` (`auth.repository.ts:157`). Não há checagem de `user.mfaEnabled` prévio, nem exigência de senha atual ou de um código TOTP válido do fator já existente. O contraste com `disableMfa` é gritante e está documentado no próprio código (`auth.service.ts:179-181`): *"Exige senha + código válido — uma sessão sozinha (ex.: roubada via XSS) não deve ser suficiente para desligar o segundo fator"*. Mas **reinscrever** o segundo fator (que dá o mesmo resultado prático, com bônus de expulsar o dono legítimo) não exige nada disso.

  Agravante: `createBackupCodes` usa `createMany` (`auth.repository.ts:178-180`) sem apagar os anteriores — os backup codes da configuração antiga **continuam válidos** após a reinscrição (`findUnusedBackupCodes` só filtra `usedAt: null`).
- **Recomendação:** (a) em `verifyMfaSetup`, se `user.mfaEnabled === true`, exigir senha atual + código válido do fator vigente (reaproveitar `verifyMfaCode`), ou bloquear e obrigar `disable` → `setup`; (b) apagar os `MfaBackupCode` do usuário antes de criar o novo lote; (c) teste que falhe se o step-up for removido.

---

### [MÉDIA] Troca de e-mail sem reautenticação, sem verificação do novo endereço e sem revogação de sessão — A07 (Authentication Failures)

- **Local:** `backend/src/modules/user/user.schema.ts:101-107`; `backend/src/modules/user/user.service.ts:89-97`
- **Evidência:**
  ```ts
  export const updateUserSchema = z.object({
      email: z.email({ message: "E-mail inválido" }).optional(),
      ...
  })
  ```
  e o service só checa colisão:
  ```ts
  if (data.email && data.email !== existing.email) {
      const emailConflict = await this.userRepository.findByEmail(data.email)
      if (emailConflict) throw new ConflictError("E-mail já cadastrado")
  }
  return this.userRepository.update(id, data)
  ```
  Combinado com o fluxo de "esqueci minha senha", isso é uma cadeia completa de tomada de conta a partir de uma sessão sequestrada: `PUT /api/users/:id` com o e-mail do atacante → `POST /api/auth/forgot-password` → o link chega ao atacante. Não há confirmação de senha, nem double opt-in do novo endereço, nem notificação ao endereço antigo.
- **Recomendação:** exigir a senha atual no payload de troca de e-mail; adotar verificação do novo endereço (token de confirmação) antes de efetivar; notificar o e-mail anterior; revogar sessões após a troca.

---

### [MÉDIA] Redirect HTTP→HTTPS usa `Host` do cliente sem validação (open redirect / host header injection) — A02 (Security Misconfiguration)

- **Local:** `backend/src/app.ts:66-72`
- **Evidência:**
  ```ts
  app.use((req, res, next) => {
      if (!req.secure) {
          res.redirect(301, `https://${req.headers.host}${req.originalUrl}`)
          return
      }
      next()
  })
  ```
  `req.headers.host` é controlado pelo cliente. Uma requisição HTTP com `Host: evil.tld` recebe `301 → https://evil.tld/<path>` originado do domínio da API — vetor de phishing e, com um cache/CDN intermediário, de cache poisoning do redirect.
- **Recomendação:** redirecionar para um host canônico derivado de uma env fixa (ex.: `PUBLIC_API_ORIGIN`) ou validar `req.headers.host` contra allowlist, respondendo 400 quando não bater.

---

### [MÉDIA] `iot-simulator` exposto sem autenticação, sem helmet e sem rate limit; broker MQTT anônimo em `0.0.0.0` — A01 / A02 / A07

- **Local:**
  - `iot-simulator/server/src/api/app.ts:18-33`
  - `iot-simulator/server/src/broker/broker.ts:16-38`
  - `iot-simulator/server/src/index.ts:11,21`
- **Evidência:** o app de controle é montado com apenas CORS + JSON, sem `helmet`, sem rate limiter e **sem nenhum middleware de autenticação em nenhuma rota**:
  ```ts
  const app = express()
  app.use(cors({ origin: env.CORS_ORIGIN }))
  app.use(express.json())
  ...
  app.use("/api/networks", networksRoutes(store, engine))
  app.use("/api/devices", devicesRoutes(store, engine))
  ```
  (confirme em `devices.routes.ts:10-47`: `router.patch("/:id", ...)`, `router.delete("/:id", ...)`, `router.post("/:id/power", ...)` — todas públicas). O broker aedes é criado sem hook `authenticate`/`authorizePublish` (`broker.ts:16`: `const aedes = new Aedes()`), aceitando qualquer cliente, e ambos escutam em todas as interfaces (`index.ts:21` `app.listen(env.API_PORT)`; `broker.ts:31` `server.listen(port)` sem host).

  Como o backend de produção pode se conectar a esse broker (o MQTT do `Meter` aponta para `mqtt://host:port`), qualquer um na mesma rede pode publicar leituras forjadas no tópico e envenenar a série de consumo/alertas — ou controlar toda a simulação via API.
- **Recomendação:** ainda que seja ferramenta de desenvolvimento, aplicar defesa mínima e explícita: `helmet` + rate limiter na API, um token estático obrigatório via header (`SIMULATOR_API_TOKEN` no env schema), hook `authenticate` no aedes com usuário/senha, e bind default em `127.0.0.1` (host configurável por env). Documentar no README que o simulador nunca deve ser exposto fora de localhost.

---

### [MÉDIA] SPA sem Content-Security-Policy — Segurança de Frontend

- **Local:** `frontend/index.html:1-35`; `frontend/vite.config.ts:1-47`
- **Evidência:** o `index.html` não contém nenhuma `<meta http-equiv="Content-Security-Policy">` (busca por `Content-Security-Policy` em todo o repositório fora de `node_modules` retorna **zero** ocorrências em `frontend/`). O helmet do backend define CSP só para as respostas da API (`app.ts:79-84`, `default-src 'none'`), o que não protege o documento HTML do SPA. Como não há infra de deploy decidida (`04-tech-stack.md:14`), também não existe config de servidor/CDN que injete o header. O checklist "Segurança de Frontend" exige CSP configurada.

  Observação positiva: `index.html:8-29` contém um script inline (anti-FOUC), o que precisa ser considerado no desenho da política (hash ou nonce).
- **Recomendação:** definir a CSP do SPA agora, mesmo antes do deploy: `default-src 'self'; script-src 'self' 'sha256-<hash do inline anti-FOUC>'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'`. Materializar em `index.html` (meta) enquanto não houver header de servidor, e registrar a decisão no ADR de deploy.

---

### [MÉDIA] Credenciais de demonstração hardcoded no código-fonte e embarcadas no bundle de produção — A02 / A04

- **Local:**
  - `frontend/src/config/demoUsers.ts:5-16`
  - `backend/prisma/seed-demo/constants.ts:6`
  - `backend/prisma/seed-demo/verify.ts:52-53`
  - `frontend/src/pages/auth/LoginPage.tsx:10`
- **Evidência:**
  ```ts
  export const DEMO_USERS = {
      residential: { email: "demo.residencial@lumitrack.dev", password: "DemoLumi@2026", ... },
      commercial:  { email: "demo.comercial@lumitrack.dev",  password: "DemoLumi@2026", ... },
  } as const
  ```
  e `export const DEMO_PASSWORD = "DemoLumi@2026"`. O `LoginPage.tsx:10` importa `DEMO_USERS` **estaticamente**; o gate `VITE_DEMO_MODE` é avaliado em runtime (`LoginPage.tsx:30`), então as credenciais ficam no bundle **mesmo com a flag desligada**. Isso colide frontalmente com o princípio inegociável "Nenhum segredo no código-fonte" (`05`, DoD).

  Agravante de desenho: as contas demo são protegidas contra reset de senha (`auth.service.ts:234-236`), mas nada impede que um visitante logado na conta demo **troque o e-mail** (`PUT /api/users/:id`, ver achado acima) ou **habilite MFA** (`POST /api/auth/mfa/verify-setup`) e sequestre permanentemente a conta pública de demonstração.
- **Recomendação:** mover as credenciais demo para variáveis de ambiente (`VITE_DEMO_EMAIL_*`/`VITE_DEMO_PASSWORD`) injetadas só no ambiente de demo, ou expor um endpoint `POST /api/auth/demo-login` gated por env no backend (sem senha no cliente). Independentemente disso, marcar as contas demo como read-only no servidor (bloquear `PUT /api/users/:id`, MFA setup e troca de senha para os e-mails de `DEMO_ACCOUNT_EMAILS`) e reprovisionar periodicamente.

---

### [MÉDIA] `iot-simulator` fora de todos os gates do CI e do Dependabot — A03 (Software Supply Chain)

- **Local:** `.github/workflows/ci.yml:17-276`; `.github/dependabot.yml:1-49`
- **Evidência:** o `ci.yml` define jobs apenas para `frontend` (lint/build/test/audit) e `backend` (lint/build/audit/test) mais `e2e`. Não há nenhum job com `working-directory: iot-simulator/*` — logo `npm run lint`, `npm run build`, `npm test` e, sobretudo, `npm audit --audit-level=high` **nunca rodam** para esse pacote, que tem lockfile próprio (`iot-simulator/package-lock.json`) e dependências de rede (`aedes`, `mqtt`, `express`). O `dependabot.yml` também só cobre `/backend`, `/frontend` e `github-actions`.
- **Recomendação:** adicionar jobs `iot-simulator-lint/build/test/audit` no `ci.yml` e uma entrada `directory: "/iot-simulator"` no `dependabot.yml`. Considerar também subir o gate para `--audit-level=moderate` (hoje `high`, `ci.yml:80,137`) ou pelo menos registrar as exceções moderadas conhecidas com `npm audit --audit-level=moderate` + allowlist explícita.

---

### [MÉDIA] PII (e-mail tentado, IP, user-agent) escrita em log de aplicação pelo `AuditService` — A09 / PII

- **Local:** `backend/src/shared/audit/audit.service.ts:14` e `:19`; `backend/src/modules/auth/auth.controller.ts:59-69`; `backend/src/shared/audit/requestContext.ts:3-10`
- **Evidência:**
  ```ts
  async record(entry: AuditEntryInput): Promise<void> {
      logger.info({ audit: entry }, `audit:${entry.action}`)
      try { await this.auditRepository.create(entry) }
      catch (error) { logger.error({ err: error, entry }, "Falha ao persistir audit log") }
  }
  ```
  e o `entry` de falha de login carrega o e-mail digitado:
  ```ts
  metadata: {
      attemptedEmail: typeof attemptedEmail === "string" ? attemptedEmail : null,
  },
  ...getRequestContext(req),   // { ipAddress, userAgent }
  ```
  Persistir isso na tabela `audit_logs` é legítimo e desejado (A09/Art. 46), mas **duplicá-lo no log de aplicação** — que tipicamente vai para um agregador de terceiro, com retenção e controle de acesso distintos do banco — não passa pelo crivo de minimização do `05` ("nunca logar dado sensível... e-mail conforme o caso").
- **Recomendação:** logar apenas um resumo não-identificante (`action`, `outcome`, `resourceType`, `userId`) e deixar `metadata`/`ipAddress`/`userAgent` exclusivamente na tabela; alternativamente cobrir esses caminhos pelo `redact` do achado Crítico.

---

### [MÉDIA] Cadastro público sem rate limit dedicado e com enumeração de contas por 409 — A06 (Insecure Design)

- **Local:** `backend/src/modules/user/user.routes.ts:22`; `backend/src/modules/user/user.service.ts:29-49`; `backend/src/app.ts:134-136`
- **Evidência:** `router.post("/", (req, res, next) => userController.create(req, res, next))` é público, e o `authRateLimiter` estrito só é montado em `/api/auth/login`, `/api/auth/forgot-password` e `/api/auth/reset-password` (`app.ts:134-136`) — `POST /api/users` fica apenas sob o limiter global de 1000 req/15 min por IP (`env.ts:33`). O service responde de forma distinguível:
  ```ts
  if (existingEmail) throw new ConflictError("E-mail já cadastrado")
  ...
  if (existingCpf)   throw new ConflictError("CPF já cadastrado")
  ...
  if (existingCnpj)  throw new ConflictError("CNPJ já cadastrado")
  ```
  Isso permite enumerar e-mails **e CPFs/CNPJs** cadastrados (~1000 sondagens por IP a cada 15 min) — apesar de o `forgot-password` ter sido cuidadosamente projetado contra enumeração (`auth.service.ts:226-236`, e teste em `auth.routes.test.ts:453`). O oráculo de CPF/CNPJ é particularmente sensível: confirma vínculo entre um CPF conhecido e a base de titulares.
- **Recomendação:** aplicar um limiter dedicado a `POST /api/users` (chave por IP, limite baixo) e, no mínimo, unificar as mensagens de conflito de CPF/CNPJ em uma resposta genérica; idealmente mover a checagem de duplicidade de documento para depois de uma verificação de e-mail (double opt-in), eliminando o oráculo.

---

### [MÉDIA] Credenciais MQTT do usuário armazenadas em texto claro no `extra` do medidor e devolvidas pela API — A04 (Cryptographic Failures)

- **Local:** `backend/src/modules/meter/meter.schema.ts:26`; `backend/src/modules/iot/iot-worker/IoTConnectionManager.ts:76-86`; `backend/src/modules/meter/meter.repository.ts:37,123,139`; `backend/prisma/schema.prisma:403`
- **Evidência:** o schema aceita qualquer chave em `extra` (`const extraField = { extra: z.record(z.string(), z.unknown()).optional() }`) e o worker lê credenciais de lá:
  ```ts
  const username = extraField<string>(extra, "username")
  const password = extraField<string>(extra, "password")
  ```
  O `MeterRepository` persiste o objeto inteiro (`toJsonInput(...)`, linha 123/139) na coluna `Json? extra` **sem cifra**, e o expõe de volta em toda leitura (`toMeterResponse`, linha 37) — ou seja, `GET /api/meters/:id` devolve a senha do broker em texto claro no JSON. Isso destoa do tratamento dado a CPF/CNPJ, endereço e segredo TOTP, todos cifrados com AES-256-GCM e chaves próprias.
- **Recomendação:** tipar `extra` explicitamente por protocolo (em vez de `record(unknown)`), cifrar `extra.password` em repouso com uma chave dedicada, e **nunca** devolvê-la nas respostas da API (retornar `passwordSet: true`).

---

### [BAIXA] Stream SSE não revalida a sessão: continua transmitindo após logout/revogação — A07

- **Local:** `backend/src/modules/iot/iot-stream.routes.ts:72-121`
- **Evidência:** `authenticate` roda uma única vez na abertura da conexão (`router.get("/stream", authenticate, async (req, res) => {...})`). A partir daí a conexão vive indefinidamente: há refresh periódico da **lista de medidores** (`membershipRefresh`, linha 103-107) e keep-alive (linha 110-112), mas **nenhuma revalidação do token**. Após `POST /api/auth/logout` (que revoga o `AuthToken`), o stream aberto continua entregando leituras e notificações em tempo real.
- **Recomendação:** revalidar o token no mesmo intervalo do `membershipRefresh` (consultar `findActiveToken` + `revokedAt`/`expiresAt`) e encerrar a resposta quando a sessão deixar de ser válida.

---

### [BAIXA] TOTP sem proteção contra replay dentro da janela de validade — A07

- **Local:** `backend/src/shared/crypto/totp.ts:33`; `backend/src/modules/auth/auth.service.ts:421-452`
- **Evidência:** `verify({ secret, token: code, epochTolerance: 1 })` aceita ±1 passo (janela efetiva de ~90 s) e não há registro do último código consumido — diferente dos backup codes, que são marcados como usados (`markBackupCodeUsed`, linha 446). Um código TOTP interceptado pode ser reapresentado dentro da janela.
- **Recomendação:** persistir o último `counter`/código aceito por usuário e rejeitar reapresentação (padrão RFC 6238 §5.2).

---

### [BAIXA] Nenhum teste cobre os controles de A02 (helmet/CSP/HSTS/CORS/redirect HTTPS)

- **Local:** `backend/src/app.ts:75-96` (controles) — sem teste correspondente em nenhum `*.test.ts`
- **Evidência:** a busca por `helmet|strict-transport|content-security-policy|x-frame-options|Access-Control-Allow-Origin` em todo o repositório (fora de `node_modules`) não retorna **nenhuma** ocorrência em arquivos de teste. Existe teste apenas para o *guard de env* de CORS (`config/env.test.ts:19-54`), não para os headers efetivamente emitidos. Remover o bloco `app.use(helmet({...}))` ou trocar `credentials: true` por uma origem permissiva passaria pela suíte inteira sem falhar.
- **Recomendação:** adicionar um `app.security-headers.test.ts` com supertest assertando presença/valor de `content-security-policy`, `strict-transport-security`, `x-frame-options`/`frame-ancestors`, ausência de `x-powered-by`, e o comportamento de `Access-Control-Allow-Origin` para origem permitida vs. não permitida.

---

### [BAIXA] Nenhum teste garante que CPF/CNPJ e endereço estão cifrados **na coluna do banco** — A04 (lacuna de cobertura)

- **Local:** `backend/src/shared/crypto/encryption.test.ts:4-34`; `backend/src/shared/crypto/addressEncryption.test.ts:4-36`; `backend/src/modules/user/user.repository.ts:96-112`
- **Evidência:** os testes de cripto exercitam as funções `encrypt`/`decrypt` em isolamento, mas nenhum teste consulta o banco para verificar que `users.cpf`, `users.cnpj` ou `properties.address` contêm ciphertext. O precedente correto existe para a senha (`user.service.test.ts:87-101` valida `/^\$2[ab]\$/` lendo direto do Prisma) — falta o equivalente para PII cifrada, que é justamente o controle A04 exigido pela DoD.
- **Recomendação:** espelhar o teste da senha: criar usuário/propriedade via service, ler pelo `prismaTest` e assertar que a coluna **não contém** o valor em texto claro e decifra corretamente.

---

### [BAIXA] Promoção a ADMIN não gera registro de auditoria — A09

- **Local:** `backend/scripts/promote-admin.ts:42-45`
- **Evidência:**
  ```ts
  await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } })
  console.log(`Usuário ${email} promovido a ADMIN.`)
  ```
  Nenhuma escrita em `audit_logs`, e o enum `AuditAction` (`schema.prisma:49-66`) não tem uma ação de mudança de papel. Mudança de privilégio é o evento de segurança clássico que precisa estar na trilha (A09 / Art. 48).
- **Recomendação:** adicionar `ROLE_CHANGED` ao enum `AuditAction` (com migração) e registrar a alteração no script, incluindo papel anterior e novo em `metadata`.

---

### [BAIXA] `DATABASE_TEST_URL` / `DATABASE_HTTP_TEST_URL` fora do schema de validação de env — A02

- **Local:** `backend/src/config/env.ts:7-116`; `backend/.env.example:15-16`; `.github/workflows/ci.yml:165-166`
- **Evidência:** ambas as variáveis são documentadas no `.env.example`, definidas no CI e consumidas em runtime (`shared/test/prisma-test.ts`, `prisma-http-test.ts`), mas não aparecem no `envSchema`. O `.env.example:12-13` avisa que "a suíte de testes APAGA os dados dos bancos de teste" — uma variável ausente/errada não é detectada pelo fail-fast de `env.ts`, ficando fora da garantia de "config separada por ambiente".
- **Recomendação:** incluir ambas no `envSchema` como `z.url().optional()` (ou obrigatórias quando `NODE_ENV === "test"`), com um `refine` que impeça que apontem para a mesma URL de `DATABASE_URL`.

---

### [BAIXA] Payload de leitura IoT sem limites superiores — A08 (Software/Data Integrity)

- **Local:** `backend/src/modules/iot/iot-worker/IoTDataProcessor.ts:60-74`
- **Evidência:**
  ```ts
  function isFiniteNonNegative(value: unknown): value is number {
      return typeof value === "number" && Number.isFinite(value) && value >= 0
  }
  ```
  `voltage`, `current` e `powerW` só precisam ser finitos e ≥ 0 — `powerW: 1e300` passa e é multiplicado por Δt em `energyKwh = (powerW * deltaSeconds) / 3_600_000` (linha 131), envenenando o `MinuteBuffer`, as agregações de consumo e a avaliação de alertas. Combinado com o broker MQTT anônimo do simulador, qualquer um na rede consegue injetar isso. A validação aqui é manual (não Zod), destoando da regra "validação por schema (Zod) na borda" do A05.
- **Recomendação:** migrar `isValidPayload` para um schema Zod com tetos plausíveis (ex.: `voltage ≤ 1000`, `current ≤ 1000`, `powerW ≤ 1e6`) e descartar/logar fora de faixa.

---

### [BAIXA] Sem config de `dependency-cruiser` no repositório — gate de fronteiras arquiteturais inexistente

- **Local:** ausência de `.dependency-cruiser.{js,cjs,json}` em qualquer pacote; `.github/workflows/ci.yml` (nenhum step); referenciado como obrigatório em `.github/PULL_REQUEST_TEMPLATE.md:19` e `.claude/project_context/06-code-quality-standards.md:45`
- **Evidência:** o gap é inclusive reconhecido no changelog do projeto (`.claude/log/CHANGELOG.md:711`): *"`npx dependency-cruiser src` não pôde rodar — não há config de dependency-cruiser neste repo, gap pré-existente"*. O checklist do PR marca o item como obrigatório, criando um gate que sempre é assinado sem verificação. Relevante para segurança porque a direção de dependência é o que impede, por exemplo, o domínio importar o worker IoT ou o `shared/crypto` ser contornado.
- **Recomendação:** criar `backend/.dependency-cruiser.cjs` com as regras do `06` (domínio não importa Express/Prisma/worker; módulos não importam repositories de outros módulos) e adicionar `npx depcruise src` como step do job `backend-lint`.

---

### [BAIXA] Sem gate de secret scanning no CI — A03

- **Local:** `.github/workflows/ci.yml:17-276`
- **Evidência:** o pipeline cobre lint, build, test, `npm audit` e E2E, mas não há nenhum step de detecção de segredo commitado (gitleaks/trufflehog) nem CodeQL/SAST. O hook de `.claude/settings.json` bloqueia o **agente** de ler `.env*`, mas não impede um commit humano de vazar chave. Dado que o repositório já contém credenciais hardcoded (achado de severidade Média acima), o risco não é teórico.
- **Recomendação:** adicionar um job `secret-scan` (gitleaks) bloqueante e, se o repositório for público, habilitar Secret Scanning + Push Protection do GitHub.

---

### [BAIXA] Regras de `.gitignore` inertes por ancoragem incorreta — higiene / A08

- **Local:** `.gitignore:12`; `backend/.gitignore:1`
- **Evidência:** `.gitignore:12` declara `prisma/migrations/`, mas o padrão contém separador no meio e portanto é ancorado à raiz do repositório — **não** casa com `backend/prisma/migrations/` (por isso as 13 migrações estão corretamente versionadas e o `prisma migrate deploy` do CI funciona). Da mesma forma, `backend/.gitignore:1` declara `/generated/prisma`, ancorado em `backend/`, que não casa com o caminho real `backend/src/generated/prisma` (por isso o client gerado está versionado). Ambas as regras são hoje inócuas, mas expressam uma intenção oposta ao estado real do repositório — se um pacote for movido ou uma regra "corrigida" sem análise, migrações passariam a ser silenciosamente ignoradas por `git add .`, quebrando a integridade da cadeia de migrações.
- **Recomendação:** remover as duas regras mortas ou reescrevê-las com o caminho correto e a intenção explícita (as migrações **devem** ser versionadas; decidir conscientemente sobre o client gerado).

---

## Controles verificados OK

**A01 — Broken Access Control**
- Autorização por posse implementada de forma consistente e resolvida bottom-up em **todos** os módulos com recurso de usuário: `property.service.ts:49`, `area.service.ts:27`, `device.service.ts:28,39,72`, `meter.service.ts:70-78,90,116`, `alert.service.ts:28-37,61`, `alert-event.service.ts:29`, `consumption.service.ts:77`, `simulation.service.ts:77,165,179,189`, `user.controller.ts:41,59,89`.
- Todas as rotas passam por `authenticate`, exceto as três públicas intencionais e documentadas (`POST /api/users`, rotas públicas de `/api/auth`, `GET /api/tariff-flag` — decisão registrada em `tariff-flag.routes.ts:9-14`).
- `GET /api/users/me/data-export` elimina o IDOR de raiz não aceitando `:id` (`export.routes.ts:36-41`).
- RBAC lido do banco a cada requisição, nunca do JWT (`authenticate.ts:96-98`), com teste que valida promoção em pleno meio de sessão (`authenticate.test.ts:205-223`).
- 62 asserções de 403/"Acesso negado" distribuídas por 12 suítes de rota — o controle A01 **falha se removido**.

**A02 — Security Misconfiguration**
- Helmet com CSP explícito deny-all para API JSON pura e HSTS de 1 ano com `includeSubDomains`/`preload` (`app.ts:75-92`).
- CORS restrito por env com `credentials: true`, e guard que **rejeita a inicialização** se `CORS_ORIGIN === "*"` em produção (`env.ts:110-116`), com teste (`env.test.ts:19-54`).
- `trust proxy` correto (1 hop) e redirect HTTPS apenas em produção (`app.ts:58-73`).
- Stack trace nunca vaza: detalhe do erro só em `NODE_ENV === "development"` (`errorHandler.ts:60-66`).
- Fail-fast de configuração: `process.exit(1)` com erros agregados quando o env não valida (`env.ts:118-125`).

**A03 — Software Supply Chain**
- Lockfiles presentes nos três pacotes; CI usa exclusivamente `npm ci` (`ci.yml:6` documenta a decisão).
- `npm audit --audit-level=high` bloqueante para backend e frontend (`ci.yml:80,137`), com relatório completo não-bloqueante.
- Dependabot semanal com agrupamento minor/patch e major isolado, alinhado à taxonomia de labels do `08` (`dependabot.yml`).

**A04 — Cryptographic Failures**
- Senhas com bcrypt cost 12 (`auth.service.ts:34`, `user.service.ts:10`), com teste que lê a coluna do banco e assere o prefixo `$2[ab]$` (`user.service.test.ts:87-101`).
- AES-256-GCM (IV de 12 bytes aleatório, auth tag verificada) para CPF/CNPJ, endereço e segredo TOTP, com **três chaves independentes** e compartimentadas (`encryption.ts`, `addressEncryption.ts`, `mfaEncryption.ts`; justificativa em `env.ts:44-99`).
- Blind index HMAC-SHA256 com chave separada da chave de cifra (`blindIndex.ts:9-13`) — decisão correta de não reutilizar chave para cifra e MAC.
- `AuthToken` e `RefreshToken` persistem apenas hash SHA-256 (`auth.service.ts:386-391`, `:406-413`), com teste (`auth.routes.test.ts:404`).
- Backup codes de MFA persistidos como hash bcrypt (`auth.service.ts:169-171`).
- Nenhum segredo real em `.env.example` (só placeholders `troque-por-...`); `.env` reais ignorados pelo git e bloqueados por hook.

**A05 — Injection**
- 100% das queries via Prisma. Os três `$queryRaw` existentes (`consumption.repository.ts:58,88,113`) usam `Prisma.sql` com bind parameters em todos os valores — inclusive o argumento de `date_trunc`, que ainda passa por **whitelist explícita** (`TRUNC_UNIT`, linhas 7-12) como segunda camada. Não há `$queryRawUnsafe`/`$executeRawUnsafe` em nenhum lugar do código de aplicação.
- Zod na borda de todos os módulos, com `safeParse` + tradução para `ValidationError`/422. `z.object` do Zod faz strip de chaves desconhecidas por padrão — `role` não é atribuível por mass assignment em `createUserSchema`/`updateUserSchema`.
- Zero `any` no backend (`tsconfig.json` com `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- Frontend: React escapa por padrão; **nenhuma** ocorrência de `dangerouslySetInnerHTML`/`innerHTML`/`eval` em `frontend/src` ou `iot-simulator/*/src`; `react-markdown` usado sem `rehype-raw` (`LegalDocumentPage.tsx:90`, `AboutPage.tsx:20`), portanto HTML embutido é escapado.

**A06 — Insecure Design**
- Rate limiting estrito em login/forgot/reset com chave IP+e-mail (`rateLimiter.ts:39-57`), cobrindo `/login/mfa` por semântica de prefixo — com teste que valida 429 e o isolamento por e-mail (`auth.rate-limit.routes.test.ts`).
- Prevenção de enumeração no `forgot-password`: resposta idêntica para e-mail inexistente e para conta demo (`auth.service.ts:224-236`), com teste (`auth.routes.test.ts:453`).
- Rotação de refresh token com detecção de reuso → revogação em massa das sessões + auditoria `REFRESH_TOKEN_REUSE_DETECTED` (`auth.service.ts:321-340`, `auth.controller.ts:170-179`), com janela de graça deliberada para corrida entre abas.
- Política de senha compartilhada e forte (`passwordSchema.ts`: 8+, maiúscula, minúscula, dígito, especial).
- Retenção/expurgo automático de tokens, resets e audit logs (`RetentionPurgeScheduler`, `retention.service.ts`), com prazos configuráveis.
- Paginação com teto obrigatório em todos os endpoints (`pagination.ts:9` máx. 31; `admin.schema.ts:43` máx. 200).

**A07 — Authentication Failures**
- ADR-0002 implementado corretamente: cookie `HttpOnly` + `Secure` (produção) + `SameSite=Lax` para WEB, Bearer para MOBILE; JWT **nunca** entra no body no canal WEB (`auth.controller.ts:316-318`).
- Cookie de refresh com `path: "/api/auth"` restrito (`csrf.ts:45-53`).
- CSRF double-submit com `timingSafeEqual` e checagem de tamanho prévia (`csrf.ts:65-81`), avaliado **depois** da validação do JWT para preservar a semântica 401 vs. 403 (`authenticate.ts:80-93`) — coberto por 6 testes unitários + 5 de rota.
- Logout revoga sessão e refresh token e limpa os 4 cookies (`auth.controller.ts:120-148`), com teste de token revogado.
- Header `Authorization` tem prioridade sobre cookie, evitando confusão de canal (`authenticate.ts:41-49`), com teste.
- MFA TOTP via `otplib` (lib madura, não implementação própria) com `epochTolerance: 1` justificado; `disableMfa` exige senha **e** código.
- Token MOBILE deixou de ser eterno: `MOBILE_TOKEN_EXPIRES_IN` default 90 d, com teste de expiração (`auth.routes.test.ts:417`).

**A08 — Software/Data Integrity**
- Payload da fonte externa ANEEL validado por schema Zod antes de qualquer uso, com timeout (8 s), retry limitado e **falha fechada** — nunca aplica snapshot parcial ou adivinhado (`AneelTariffFlagSource.ts:54-88,142-171`); URL e `resource_id` são constantes hardcoded, sem input de usuário.
- Nenhuma desserialização de dado não confiável (sem `eval`, `vm`, `node-serialize`); JSON parsing sempre com try/catch.
- Nenhum endpoint de upload de arquivo no repositório.

**A09 — Logging & Alerting**
- Trilha de auditoria estruturada em tabela dedicada com enum de ações, `onDelete: SetNull` no `userId` para sobreviver à exclusão da conta (`schema.prisma:247-275`).
- Login sucesso/falha, logout, MFA enable/disable, exportação de dados, reuso de refresh token e **todo 403** auditados — este último centralizado no error handler, sem instrumentar ~17 pontos (`errorHandler.ts:30-47`), com teste.
- `AuditService.record` nunca derruba a requisição auditada (`audit.service.ts:16-20`).
- Auditoria de `USER_UPDATE` registra apenas os **nomes** dos campos alterados, nunca os valores (`user.controller.ts:64-73`) — decisão explicitamente correta de minimização.

**A10 — Mishandling of Exceptional Conditions**
- Error handler central único, registrado por último (`app.ts:155`), traduzindo ZodError→422, `AppError`→statusCode próprio e qualquer outra coisa→500 genérico com detalhe apenas no log (`errorHandler.ts`), com 5 testes que cobrem todos os ramos.
- Falha fechada nas bordas: `authenticate` converte qualquer exceção inesperada em `UnauthorizedError` (`authenticate.ts:102-108`); `TariffFlagSyncService` mantém o último valor conhecido em caso de falha da fonte; `IoTDataProcessor` isola listener quebrado sem interromper os demais (`IoTDataProcessor.ts:144-151`).
- Graceful shutdown com flush do buffer e encerramento limpo das conexões IoT (`server.ts:191-214`).

**Segurança de Frontend**
- Nenhum token em `localStorage`/`sessionStorage` — a única persistência local é tema e seleção de propriedade (`storage.ts`, `ThemeContext.tsx`, `usePropertySelection.ts`); a flag de sessão vive só em memória (`authState.ts`).
- Interceptor de CSRF automático nos métodos mutáveis (`api.ts:19-27`) e refresh proativo/reativo com deduplicação de Promise (`sessionRefresh.ts:17-25`), sem loop de retry.
- Nenhum segredo em variáveis `VITE_*` (`.env.example` só tem URLs e a flag de demo).

---

## Próximos passos sugeridos

**Bloqueio antes de qualquer deploy público (P0)**
1. `redact` no pino/pino-http + teste de não-vazamento de token (Crítica).
2. Allowlist de destino de saída para `host`/`port` do medidor (Alta — SSRF).
3. Hash do token de reset de senha (Alta).
4. Revogar sessões/refresh no reset de senha (Alta).
5. Step-up auth na re-inscrição de MFA + purga dos backup codes antigos (Alta).

**Antes de expor a demo pública (P1)**
6. Reautenticação + verificação para troca de e-mail; contas demo em modo read-only no servidor.
7. Mover credenciais demo para env (fora do bundle).
8. Redirect HTTPS com host canônico.
9. CSP do SPA definida e aplicada (decidir junto com o ADR de infra/deploy, hoje em aberto no `07`).
10. Perímetro mínimo no `iot-simulator` (token de API, auth no broker, bind em `127.0.0.1`).

**Endurecimento contínuo (P2)**
11. `iot-simulator` no CI e no Dependabot; job de secret scanning; config de `dependency-cruiser`.
12. Rate limiter dedicado em `POST /api/users` + mensagens de conflito genéricas para CPF/CNPJ.
13. Cifrar/ocultar `extra.password` do medidor; tipar `extra` por protocolo.
14. Fechar as lacunas de teste identificadas: headers de segurança (A02), PII cifrada na coluna (A04), revalidação de sessão no SSE (A07).
15. `ROLE_CHANGED` no audit log; anti-replay de TOTP; tetos no payload IoT; `DATABASE_*_TEST_URL` no `envSchema`; limpeza das regras mortas de `.gitignore`.
