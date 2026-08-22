# Auditoria de Segurança — 2026-08-22

**Escopo:** projeto inteiro (backend Express+Prisma, frontend React+Vite, iot-simulator) mais a infraestrutura de deploy (`docker-compose.yml`, `deploy/`, `Caddyfile`, `render.yaml`, `Dockerfile`s, workflows, systemd).
**Referência:** `05-security-standards.md` (A01–A10, hardening, cliente, PII), `11-seguranca-infraestrutura.md` (banco, CI/CD, deploy, segredos), seções de `12-seguranca-por-tecnologia.md` correspondentes ao `04` (React, Express, REST, WebSocket/SSE, JWT, MFA/TOTP, hash de senha, Prisma, PostgreSQL, containers, e-mail transacional). Profundidade ASVS 5.0 L2, L3 em auth/authz/dado sensível.

## Resumo (nº de achados por severidade)

| Severidade | Nº |
|---|---|
| Crítica | 0 |
| Alta | 2 |
| Média | 12 |
| Baixa | 13 |
| **Total** | **27** |

Observação geral: a superfície de aplicação está madura — os 24 achados do laudo de 2026-08-05 foram, em sua maioria esmagadora, remediados e com teste. O centro de gravidade dos achados deste ciclo migrou para **infraestrutura de deploy** (`11`) e para o **endurecimento fino de auth** (ASVS L3), que é exatamente o efeito esperado de um ciclo de trabalho voltado a go-live.

---

## Achados

### [ALTA] Usuário de runtime do banco é o owner do schema e a mesma credencial roda as migrações — Infraestrutura (`11` §1, DoD)

- **Local:**
  - `deploy/.env.example:10-12`
  - `docker-compose.yml:11-25`
  - `.claude/docs/DEPLOY.md:293` e `:305`
  - `backend/package.json:20` (`db:migrate:deploy`)
- **Evidência:** `POSTGRES_USER=lumitrack` é passado ao container oficial `postgres:16` via `env_file`, o que faz dele o **superusuário** da instância e owner de `POSTGRES_DB`. O `DEPLOY.md` instrui explicitamente que `DATABASE_URL` do backend use `<POSTGRES_USER>:<POSTGRES_PASSWORD>` — ou seja, a aplicação em runtime conecta como superusuário. As migrações (`prisma migrate deploy`, rodadas via `docker compose run backend`) usam a mesmíssima credencial. Não existe um segundo papel com DML-only, nem `REVOKE CREATE ON SCHEMA public FROM PUBLIC`.
- **Impacto:** anula a mitigação em profundidade que o `11` exige: qualquer falha futura que produza execução de SQL (regressão em `$queryRaw`, bug em lib, deserialização) deixa de ser leitura indevida e passa a ser `DROP TABLE`, `COPY ... PROGRAM` e criação de função `SECURITY DEFINER`. É o item do DoD de infraestrutura ("Usuário de runtime do banco **não consegue** executar DDL") em estado reprovado.
- **Recomendação:** manter `POSTGRES_USER` apenas como credencial administrativa/de migração (usada só pelo passo de migrate) e criar um papel `lumitrack_app` com `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public`, `USAGE` na sequência, sem `CREATE`, sem ownership; apontar `DATABASE_URL` do backend para ele. Revogar `CREATE ON SCHEMA public FROM PUBLIC` (item PostgreSQL do `12`). Adicionar ao checklist do `DEPLOY.md` e ao gate de go-live um teste negativo verificável (`CREATE TABLE t(x int)` deve falhar com o usuário de runtime).

---

### [ALTA] Backup do PostgreSQL sem criptografia em repouso e sem registro de restauração testada — A04 / Infraestrutura (`11` §1, DoD)

- **Local:** `deploy/backup-postgres.sh:19-32`; `deploy/lumitrack-backup.service:1-10`; `.claude/docs/DEPLOY.md:308-334`
- **Evidência:** o dump é gerado como `pg_dump | gzip > "$BACKUP_DIR/lumitrack-$TIMESTAMP.sql.gz"` em `/opt/lumitrack/backups`, **sem nenhuma camada de cifra**, com retenção de 14 dias. O `12` (PostgreSQL) é explícito: "Backup lógico com `pg_dump` contém PII em texto: criptografe e trate como dado de produção". O conteúdo do dump inclui `users.email`, `firstName`/`lastName`/`companyName`, hashes bcrypt de senha, hashes de backup codes de MFA, e a tabela `audit_logs` com `ipAddress` e `userAgent` por evento — tudo em claro (CPF/CNPJ e endereço estão cifrados na coluna, o resto não). Além disso, o procedimento de restauração está documentado no `DEPLOY.md`, mas **não há registro da data do último teste bem-sucedido** em lugar nenhum do repositório — o DoD do `11` exige "Restauração de backup testada, com data registrada".
- **Recomendação:** (1) cifrar o dump no próprio pipe (`... | gzip | age -r <chave-pública>` ou `gpg --encrypt`), com a chave privada fora da VM; (2) restringir `chmod 700` no `BACKUP_DIR` e conferir que o usuário `lumitrack` é o dono; (3) criar um arquivo versionado (ex.: `deploy/BACKUP-RESTORE-LOG.md`) com a data de cada restauração testada e transformar isso em item recorrente; (4) considerar `PrivateTmp=yes`/`ProtectSystem=strict` na unidade systemd.

---

### [MÉDIA] Não existe `.dockerignore` na raiz, e o `Dockerfile` da demo copia diretórios inteiros com contexto na raiz — Containers (`12`) / A03

- **Local:** `Dockerfile:31` (`COPY backend/ ./`) e `:53` (`COPY iot-simulator/server ./server`); `render.yaml:14-16` (`dockerContext: .`); ausência de `/.dockerignore`
- **Evidência:** `backend/.dockerignore` e `iot-simulator/.dockerignore` existem e excluem corretamente `.env`, `.git`, `node_modules` — mas **só valem quando o contexto de build é aquele diretório** (caso do `docker-compose.yml`). O `Dockerfile` da raiz usa contexto `.` e não há `.dockerignore` correspondente, então `COPY backend/ ./` inclui `backend/.env` (e `backend/node_modules`, `backend/coverage`) na camada da imagem sempre que a imagem for construída numa máquina onde esses arquivos existam — que é exatamente a máquina de desenvolvimento. O `12` é categórico: "Segredo em `ARG`/`ENV` ou em `COPY` fica na camada da imagem **para sempre** — mesmo que removido em camada posterior".
- **Atenuante:** no fluxo vigente, quem constrói essa imagem é o Render, a partir de um clone limpo do git — nenhum `.env` existe ali. O achado é de **risco latente**, que se materializa no primeiro `docker build .` local (para depurar a demo, por exemplo) seguido de um `docker push`.
- **Recomendação:** criar `/.dockerignore` na raiz replicando o conteúdo de `backend/.dockerignore` com os caminhos ajustados (`**/.env`, `!**/.env.example`, `**/node_modules`, `.git`, `**/dist`, `**/coverage`, `frontend/`, `.claude/`). Bônus imediato: o contexto de build encolhe drasticamente.

---

### [MÉDIA] Actions do CI não pinadas por SHA completo; imagens de container pinadas por tag mutável — A03 / `11` §2 (P0, DoD)

- **Local:** `.github/workflows/ci.yml:36,50,51,66,67,82,83,97,98,118,119,144,145,162,163,210,211,238,239,254,255,275,276,290,291,339,340,382`; `.github/workflows/ci.yml:41` (`zricethezav/gitleaks:v${{ env.GITLEAKS_VERSION }}`); `docker-compose.yml:12,65,81`; `Dockerfile:20,44,57`; `backend/Dockerfile:9,31`
- **Evidência:** todos os `uses:` são por tag (`actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v7`). O `11` §2 exige SHA completo como P0 e o DoD reforça: "Todo workflow declara `permissions:` e usa actions pinadas por SHA" — o primeiro requisito está cumprido (`permissions: contents: read` nos dois workflows, bem justificado), o segundo não. O mesmo princípio, segundo o `12` (Containers), vale para imagem base: `node:24-slim`, `postgres:16`, `caddy:2` e `louislam/uptime-kuma:1` são tags móveis.
- **Atenuante honesto:** todas as actions usadas são de primeira parte (`actions/*`), o que reduz — mas não elimina — o vetor que derrubou `tj-actions/changed-files`.
- **Recomendação:** pinar por SHA40 com comentário da tag (`uses: actions/checkout@<sha> # v7.0.1`); o Dependabot já está configurado para `github-actions` e continuará abrindo os PRs de bump com o SHA novo. Para imagens, migrar para digest (`node:24-slim@sha256:...`) ao menos no `Dockerfile` de runtime.

---

### [MÉDIA] O site estático da demo (Render) não emite nenhum cabeçalho de segurança HTTP — A02

- **Local:** `render.yaml:98-151` (serviço `static`, sem bloco `headers:`); `frontend/index.html:28-31`
- **Evidência:** o CSP do SPA existe apenas como `<meta http-equiv="Content-Security-Policy">`. O próprio comentário do arquivo reconhece que `frame-ancestors`, `base-uri` e `object-src` **não têm efeito nenhum via `<meta>`** — e delega o header equivalente ao "reverse proxy de produção (ADR-0008)". No Caminho B isso está resolvido (`deploy/Caddyfile:21-32` emite HSTS, CSP com as três diretivas e `nosniff`). No **Caminho A, que é o que está no ar hoje**, não existe proxy nenhum sob controle do projeto e `render.yaml` não declara `headers:`. Resultado prático na demo pública: sem proteção a clickjacking (`frame-ancestors`), sem HSTS, sem `X-Content-Type-Options`, sem `Referrer-Policy`.
- **Recomendação:** adicionar ao serviço estático do `render.yaml` um bloco `headers:` com `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` e `Permissions-Policy: camera=(), microphone=(), geolocation=()`. Enquanto o `Caddyfile` e o `render.yaml` forem duas fontes, vale um comentário cruzado em ambos para que não divirjam.

---

### [MÉDIA] Sessão WEB sem timeout absoluto: a rotação de refresh renova a validade indefinidamente — A07

- **Local:** `backend/src/modules/auth/auth.service.ts:470-482` (`issueRefreshToken`) e `:416-419` (`refresh`)
- **Evidência:** cada rotação chama `issueRefreshToken`, que calcula `expiresAt = Date.now() + parseJwtExpiry(env.JWT_REFRESH_EXPIRES_IN)` — sempre 7 dias a partir de **agora**, sem qualquer referência ao instante em que a sessão foi originalmente estabelecida (não há `sessionStartedAt`, `familyId` nem `absoluteExpiresAt` no modelo `RefreshToken`, conforme `backend/prisma/schema.prisma:199-215`). Um usuário (ou um atacante de posse da família de tokens) que renove a cada 6 dias mantém a sessão viva para sempre. O `05` (A07) exige "**timeout absoluto** além do idle", e a ASVS coloca isso em L2/L3 para autenticação.
- **Nota positiva adjacente:** a detecção de reuso com revogação da família inteira e a janela de graça de 5 s estão implementadas corretamente e testadas — este achado é o complemento que falta, não uma falha do mecanismo.
- **Recomendação:** adicionar `absoluteExpiresAt` ao `RefreshToken`, propagado da linhagem original na rotação (`replacesTokenId` já existe e dá o encadeamento); em `refresh()`, recusar quando `now > absoluteExpiresAt`, independentemente do `expiresAt` rotativo. Valor sugerido: 30 dias para WEB. Cobrir com um teste que falhe se o controle for removido.

---

### [MÉDIA] Cookies de sessão/CSRF sem prefixo `__Host-` — A07 / segurança de cliente

- **Local:** `backend/src/shared/security/csrf.ts:21-60`; `backend/src/config/env.ts:66-68` e `:134-136`
- **Evidência:** os quatro cookies (`lumitrack_session`, `lumitrack_csrf`, `lumitrack_refresh`, `lumitrack_refresh_csrf`) são emitidos com `httpOnly`/`secure`/`sameSite: "lax"` corretos, mas **sem o prefixo `__Host-`**, que o `05` (A07) e o `12` (Sessão) listam explicitamente. A consequência não é teórica: o esquema de CSRF é double-submit *stateless* (`validateCsrf` compara cookie vs. header, sem estado no servidor). Sem `__Host-`, um subdomínio comprometido — ou qualquer origem capaz de escrever cookie no domínio pai — pode **fixar** o cookie CSRF em um valor conhecido e então montar uma requisição cross-site que satisfaz a comparação. O `__Host-` é justamente a garantia de que o cookie não pode ter vindo de outro host nem de outro path.
- **Recomendação:** renomear os defaults para `__Host-lumitrack_session` e `__Host-lumitrack_csrf` (exigem `Secure`, `Path=/`, sem `Domain` — condições já satisfeitas em produção). O par de refresh usa `path: "/api/auth"`, incompatível com `__Host-`; ali a alternativa é `__Secure-` + manter o path restrito, ou mover para `Path=/` e usar `__Host-`. Atualizar `frontend/src/lib/csrf.ts:3-4`, que hardcoda os nomes. Manter os defaults antigos fora de produção para não quebrar dev em HTTP.

---

### [MÉDIA] TOTP aceita reuso do mesmo código dentro da janela de validade — A07 / MFA (`12`)

- **Local:** `backend/src/shared/crypto/totp.ts:33`; `backend/src/modules/auth/auth.service.ts:488-519`
- **Evidência:** `verify({ secret, token: code, epochTolerance: 1 })` — a tolerância de ±1 passo é a escolha certa, mas não há **nenhum** registro de código já consumido (o `schema.prisma` não tem modelo para isso; só `MfaBackupCode`, que é uso único). O `12` (MFA/TOTP) exige "rejeição de reuso do mesmo código dentro da janela (senão o código é replicável durante ~30s)" — aqui a janela efetiva é ~90 s. Um código interceptado (ombro, phishing em tempo real, log de proxy) permanece válido para uma segunda autenticação.
- **Atenuante:** o achado já constava como BAIXA no laudo de 2026-08-05 e permanece aberto; o rate limiter estrito nos endpoints de login limita a exploração em volume, não a replicagem única.
- **Recomendação:** persistir `(userId, counter)` do último passo aceito — uma coluna `mfaLastUsedStep Int?` em `User` é suficiente e evita tabela nova: rejeitar qualquer código cujo passo seja `<= mfaLastUsedStep`. Custo baixo, fecha o requisito ASVS L2 de anti-replay de OTP.

---

### [MÉDIA] `GET /api/meter-readings` não pagina e não limita a janela consultada — A06 / hardening de runtime

- **Local:** `backend/src/modules/meter/meter-reading.schema.ts:14-20`; `backend/src/modules/meter/meter-reading.service.ts:57-62`; `backend/src/modules/meter/meter-reading.repository.ts:88-113`
- **Evidência:** o schema exige `from`/`to`, mas **não impõe teto ao intervalo** nem à quantidade de buckets; o comentário do arquivo assume que "a janela já vem limitada por quem chama" — o cliente é quem chama. `granularity=minute&from=1970-01-01&to=2100-01-01` executa um `GROUP BY date_trunc('minute', ...)` sobre toda a partição de `meter_readings` daquele medidor e serializa o resultado inteiro em JSON, sem `LIMIT`. O `05` exige "**Paginação obrigatória com teto** em listagens (default + máximo)" e o `11` §1 repete como P1 ("sem isso, `?limit=999999` é exaustão de recurso"). O irmão `/api/consumption` faz isso certo (`paginationQuerySchema`, teto 31, `LIMIT/OFFSET` no SQL) — a inconsistência é o achado.
- **Recomendação:** adicionar um `.refine()` no schema limitando `to - from` por granularidade (ex.: `minute` ≤ 24 h, `hour` ≤ 90 dias) e um `LIMIT` defensivo na query. Autorização e posse já estão corretas aqui (`resolveRootProperty` + comparação de `userId`), então é puramente controle de recurso.

---

### [MÉDIA] Token de API do simulador é injetado no bundle do cliente via `VITE_SIMULATOR_API_TOKEN` — segurança de cliente (`05`) / React-Vite (`12`)

- **Local:** `iot-simulator/ui/src/services/api.ts:13-14`; `iot-simulator/ui/.env.example:4`
- **Evidência:** `headers["Authorization"] = \`Bearer ${import.meta.env.VITE_SIMULATOR_API_TOKEN}\``. O `05` é explícito: "todo build tool expõe variáveis por convenção de prefixo, e o prefixo é o **mecanismo do vazamento**, não uma proteção — no Vite, `VITE_` é substituído literalmente no bundle". O token que protege `/api/networks` e `/api/devices` (controle total sobre os dispositivos simulados) fica em texto no artefato estático.
- **Atenuante importante:** a `ui/` do simulador **não é publicada** em nenhum dos dois caminhos de deploy — o `Dockerfile` da raiz compila só o workspace `server` (`Dockerfile:54`) e o `docker-compose.yml` também (`iot-simulator/server/Dockerfile`). O risco é de futuro: no dia em que essa UI for servida, o token vai junto.
- **Recomendação:** registrar a decisão em comentário funcional no próprio arquivo ("ferramenta de desenvolvimento local — este bundle nunca deve ser publicado") e, se algum dia a UI for exposta, trocar o token estático por sessão emitida pelo próprio simulador. Alternativa barata hoje: a UI só é servida pelo `vite dev` e o token vive apenas em `.env` local.

---

### [MÉDIA] Credencial fixa de conta de demonstração versionada no código-fonte e suprimida no gitleaks — A04 / `11` §4

- **Local:** `backend/prisma/seed-demo/constants.ts:6` (`export const DEMO_PASSWORD = "DemoLumi@2026"`); `.gitleaks.toml:21-33`; `backend/prisma/seed-demo/verify.ts:42` (imprime e-mail e senha no console)
- **Evidência:** a senha das duas contas de demonstração está no repositório público. O `.gitleaks.toml` cria uma regra própria para o achado e, na linha seguinte, o **allowlista** — o comentário reconhece que "a correção de verdade (rotacionar, ou parar de versionar) é da Fase 13 do roadmap". O laudo anterior registrou o item como MÉDIA e ele continua aberto. Relevante: `AuthService.login` (`auth.service.ts:72-96`) **não** bloqueia contas demo, ao contrário de `verifyMfaSetup`/`disableMfa`/`updateUser`/`deleteUser` — logo a senha publicada funciona no formulário de login normal, não só via `demo-login`.
- **Atenuante:** as contas demo são, por desenho, públicas e somente-leitura para as operações que permitiriam sequestro (troca de e-mail, MFA, exclusão), e `REGISTRATION_ENABLED=false` na demo. O impacto real é próximo de zero **enquanto o seed demo não for aplicado a um ambiente com dados de terceiros**.
- **Recomendação:** mover `DEMO_PASSWORD` para variável de ambiente (`DEMO_SEED_PASSWORD`, sem default), gerando aleatoriamente quando ausente e imprimindo apenas no console do seed; com isso a regra e o allowlist do gitleaks somem juntos, que é o estado correto. Remover a impressão de senha em `verify.ts` ou marcá-la explicitamente como saída de desenvolvimento.

---

### [MÉDIA] Conexão MQTT de saída sempre em texto claro (`mqtt://`), com credencial do medidor na rede — A04

- **Local:** `backend/src/modules/iot/iot-worker/protocols/MqttConnection.ts:47,52-62`
- **Evidência:** `const brokerUrl = \`mqtt://${this.config.host}:${this.config.port}\`` — o esquema é fixo, sem opção de `mqtts://`, e `username`/`password` (decifrados de `Meter.extra` em `meter.repository.ts:87-91`, justamente porque são credenciais que merecem cifra em repouso) são enviados no pacote CONNECT sem TLS. O `05` (A04) exige "TLS em prod" para tráfego de credencial.
- **Atenuante:** hoje o único destino real é o broker embutido do simulador em loopback (`IOT_ALLOWED_HOSTS=127.0.0.1/32` / `localhost`), onde não há rede a interceptar. O guard de SSRF (`checkOutboundHost`) permite, porém, qualquer host **público** sem entrada na allowlist — ou seja, um medidor real na internet é configurável hoje e falaria em claro.
- **Recomendação:** adicionar `tls: boolean` (ou aceitar `mqtts` como protocolo) ao schema do medidor, montando a URL conforme; recusar credencial (`username`/`password`) em destino não-loopback sem TLS. Mesma checagem cabe ao `ModbusTcpConnection` no que diz respeito a destino público.

---

### [MÉDIA] `DATABASE_URL` do Caminho B sem `sslmode`, e nenhum `statement_timeout`/limite de pool configurado — `11` §1 (P0/P1), PostgreSQL (`12`)

- **Local:** `.claude/docs/DEPLOY.md:293`; `backend/.env.example:14`; `backend/src/shared/database/prisma.ts:17-24`
- **Evidência:** a string de produção prescrita para o self-hosted é `postgresql://...@postgres:5432/...?schema=public` — sem `sslmode`, e o container `postgres:16` não é configurado com certificado, então o tráfego atravessa a bridge do Docker em claro. O `11` §1 lista "TLS explícito na string de conexão" como **P0**, com o aviso "não confie no default do provedor". Separadamente, `new PrismaPg({ connectionString })` não define `max` (pool), `connectionTimeoutMillis` nem `statement_timeout` — o `11` §1 P1 e o `12` (PostgreSQL) pedem os dois ("exaustão de conexões é o DoS mais barato contra API com banco"; "transação ociosa segura locks e derruba o banco").
- **Atenuante:** no Caminho A (vigente), o Neon exige `?sslmode=require` e o `DEPLOY.md:57,119` documenta corretamente. O achado é do Caminho B.
- **Recomendação:** para o Caminho B, ou habilitar TLS no container Postgres e usar `sslmode=verify-full`, ou registrar em ADR a aceitação do risco com a justificativa de rede interna (o `11` admite registrar divergência justificada, não omissão). Independente disso, configurar `max` no pool e `statement_timeout`/`idle_in_transaction_session_timeout` — via `options=-c statement_timeout=10000` na connection string ou no `postgresql.conf` do serviço.

---

### [MÉDIA] Ticket de autenticação do SSE viaja em query string e é registrado no log de requisição — A09

- **Local:** `backend/src/modules/iot/iot-stream.routes.ts:84-91`; `backend/src/app.ts:156-166`; `render.yaml:116-117`
- **Evidência:** `GET /api/iot/stream?ticket=<64 hex>` é a única forma de autenticar o stream cross-origin. O `pino-http` registrado em `app.ts` serializa `req.url` por padrão e a lista de `redact` (`shared/logger/logger.ts:40-55`) cobre `req.headers.cookie`, `authorization`, `*.token` etc. — **mas não a query string da URL**. Toda abertura de stream grava uma credencial válida na trilha de log; o mesmo vale para o log de acesso do Caddy/Render, fora do controle do redactor. O `05` é direto: "**nunca** logar dado sensível (senha, token, CPF)".
- **Atenuante forte:** o desenho do ticket é bom — 32 bytes aleatórios, TTL de 30 s, **uso único com remoção no mesmo passo da leitura** (`sse-ticket.service.ts:43-51`), e a justificativa técnica de por que o cookie não serve ali está documentada. A janela de exploração é curta e o token queima no primeiro uso.
- **Recomendação:** adicionar `req.query.ticket` (ou um `customAttributeKeys`/serializer de `req` que reescreva a query) à configuração de redaction do pino, e trocar `autoLogging.ignore` por um serializer que remova qualquer `?ticket=` da URL registrada. No `Caddyfile`, o log de acesso não está habilitado explicitamente — confirmar que continua assim ou filtrar a query lá também.

---

### [BAIXA] `jwt.verify` sem allowlist explícita de algoritmo e sem validação de `iss`/`aud` — JWT (`12`)

- **Local:** `backend/src/shared/middlewares/authenticate.ts:69`; `backend/src/modules/auth/auth.service.ts:157` e `:449`
- **Evidência:** `jwt.verify(token, env.JWT_SECRET)` sem `{ algorithms: ["HS256"], issuer, audience }`. O `12` pede "declare o algoritmo esperado na verificação (allowlist), nunca derive do header do próprio token" e "Validação completa, sempre: assinatura, `exp`, `nbf`, `iss`, `aud`".
- **Atenuante:** com segredo HMAC (string), o `jsonwebtoken` v9 já restringe internamente a `HS256/384/512` e rejeita `alg: none`; e a defesa real deste projeto contra token forjado é o lookup do hash em `auth_tokens` (um JWT válido sem linha correspondente é rejeitado). O risco prático hoje é baixo — o valor está em não depender de um default de biblioteca.
- **Recomendação:** passar `{ algorithms: ["HS256"] }` nas três chamadas de `verify` e considerar `issuer`/`audience` (`lumitrack-api`) no `sign`/`verify`, especialmente antes de introduzir qualquer segundo consumidor do mesmo segredo.

---

### [BAIXA] Enumeração de conta por diferença de tempo no login — hash de senha (`12`)

- **Local:** `backend/src/modules/auth/auth.service.ts:82-88`
- **Evidência:** `const isValidPassword = user ? await bcrypt.compare(password, user.password) : false`. Com `BCRYPT_ROUNDS = 12`, um e-mail existente custa ~200-300 ms a mais que um inexistente. O `12` exige "resposta de erro idêntica para usuário inexistente e senha errada (**inclusive no tempo** — verifique um hash falso quando o usuário não existir)". A mensagem é idêntica ("Credenciais inválidas"), o tempo não.
- **Atenuante:** o rate limiter de auth é chaveado por `ip:email`, o que encarece a varredura, e `UserService.createUser` já unificou as mensagens de conflito de cadastro justamente por esse motivo (`user.service.ts:25`) — a mesma preocupação, aplicada ali e não aqui.
- **Recomendação:** manter um hash bcrypt fixo (constante de módulo, gerado uma vez) e executar `bcrypt.compare(password, DUMMY_HASH)` no ramo `!user`, descartando o resultado.

---

### [BAIXA] Sem teto de conexões SSE por usuário e sem rate limit dedicado no `stream-ticket` — WebSocket/SSE (`12`)

- **Local:** `backend/src/modules/iot/iot-stream.routes.ts:112-198,218-224`
- **Evidência:** cada `GET /stream` registra um listener no `IoTDataProcessor` e no `UserEventHub`, mais dois `setInterval`, e a conexão fica aberta indefinidamente. Não há contador por usuário. O `12` pede "teto de conexões por identidade" e "SSE: conexões abertas consomem *sockets*: limite por usuário". `POST /stream-ticket` é coberto apenas pelo limiter global (1000/15 min por IP).
- **Atenuante:** a revalidação periódica de sessão (`isSessionStillValid`, a cada 60 s) e o cleanup em `req.on("close")` estão corretos e fecham o achado BAIXA do laudo anterior; o problema restante é só volume.
- **Recomendação:** manter um `Map<userId, count>` no módulo do stream, recusando com 429 acima de ~5 conexões simultâneas por usuário.

---

### [BAIXA] Payload de leitura IoT sem limites superiores — A08

- **Local:** `backend/src/modules/iot/iot-worker/IoTDataProcessor.ts:60-76,130-136`
- **Evidência:** `isFiniteNonNegative` aceita qualquer número finito ≥ 0; só `powerFactor` tem teto (≤ 1). Um `powerW: 1e300` publicado no tópico MQTT propaga para `energyKwh`, para o `MinuteBuffer`, para o `AlertEvaluator` e para a coluna `Decimal` de `meter_readings` (onde vira erro de overflow em runtime, ou dado absurdo). Achado já registrado como BAIXA em 2026-08-05, ainda aberto.
- **Recomendação:** definir tetos físicos plausíveis por grandeza (ex.: `voltage ≤ 1000 V`, `current ≤ 1000 A`, `powerW ≤ 1e7`) e descartar a amostra fora da faixa com o mesmo `log.warn` já existente.

---

### [BAIXA] `trust proxy: 1` assume exatamente um hop, sem verificação no ambiente vigente — Express (`12`)

- **Local:** `backend/src/app.ts:79-85`
- **Evidência:** o valor é fixo e correto para o Caminho B (Caddy é o único proxy, e `req.ip` resolve para o IP real do cliente mesmo com `X-Forwarded-For` forjado — verificado contra a semântica do `proxy-addr`). Para o Caminho A (Render), o número de hops da borda não está documentado nem verificado. Se houver mais de um, `req.ip` passa a devolver o IP de um proxy interno **para todos os clientes**, colapsando o rate limit global e o de auth num único balde compartilhado — falha silenciosa, na direção de indisponibilidade e de não-proteção.
- **Recomendação:** logar `req.ip` numa requisição de teste na demo e comparar com o IP real de origem; ajustar o valor (ou usar a forma por lista de CIDR confiáveis) e registrar o resultado no `DEPLOY.md`. Nota complementar para o Caddy: `reverse_proxy` **acrescenta** ao `X-Forwarded-For` recebido do cliente; declarar `trusted_proxies` ou `header_up X-Forwarded-For {remote_host}` torna o comportamento explícito em vez de dependente do default.

---

### [BAIXA] Sem varredura de imagem de container no CI e sem Dependabot para Docker — A03 / Containers (`12`)

- **Local:** `.github/workflows/ci.yml` (15 jobs, nenhum de imagem); `.github/dependabot.yml:1-65` (npm ×3 + github-actions, sem `docker`)
- **Evidência:** o `12` (Containers) pede "varredura de imagem (Trivy/Grype) no CI, junto com o `npm audit` do A03". Os três `Dockerfile`s constroem sobre `node:24-slim` e nada verifica CVEs do sistema base — o `npm audit` cobre só o ecossistema npm.
- **Recomendação:** adicionar um job `image-scan` (Trivy em modo `--severity HIGH,CRITICAL --exit-code 1`) sobre a imagem do backend, e um bloco `package-ecosystem: "docker"` no `dependabot.yml` para cada diretório com `Dockerfile`.

---

### [BAIXA] Containers sem `cap_drop`, `no-new-privileges`, filesystem somente-leitura ou limites de recurso — Containers (`12`)

- **Local:** `docker-compose.yml:10-89`
- **Evidência:** o compose acerta o essencial (nenhuma porta de banco/broker publicada, `network_mode: service:backend` para o simulador, Kuma só em `127.0.0.1`, healthchecks, `stop_grace_period`) e os `Dockerfile`s usam `USER node` e multi-stage. Faltam os itens de endurecimento que o `12` lista: `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`, `read_only: true` (com `tmpfs` onde necessário) e `deploy.resources.limits` de CPU/memória — "contêiner sem limite é DoS por vizinho barulhento", relevante numa VM Always Free compartilhando recursos entre 5 serviços.
- **Recomendação:** aplicar `cap_drop`/`no-new-privileges` em todos os serviços e `mem_limit`/`cpus` ao menos em `backend`, `simulator` e `postgres`.

---

### [BAIXA] `express.urlencoded({ extended: true })` sem limite de tamanho nem `parameterLimit` explícitos — Express (`12`)

- **Local:** `backend/src/app.ts:171-172`
- **Evidência:** ambos os parsers usam os defaults (100 kb, 1000 parâmetros). O `12` alerta que "o default (100kb) existe, mas `urlencoded({ extended: true })` sem limite (…) frequentemente não" — aqui o default do `body-parser` cobre, mas nenhuma rota da API consome `application/x-www-form-urlencoded`, então o parser é superfície desnecessária (`extended: true` usa `qs`, com sua própria história de CVEs de explosão de parâmetros).
- **Recomendação:** ou remover o `urlencoded` (a API é JSON pura), ou declarar `{ extended: false, limit: "10kb", parameterLimit: 50 }`. Declarar `limit` explicitamente no `express.json()` também documenta a intenção em vez de herdá-la.

---

### [BAIXA] `Permissions-Policy` ausente na API — hardening de cabeçalhos (`05`)

- **Local:** `backend/src/app.ts:118-137`
- **Evidência:** o `helmet` está bem configurado (CSP `default-src 'none'` para API JSON, HSTS 1 ano com `includeSubDomains` e `preload`, `frame-ancestors 'none'`), e cobre `Referrer-Policy: no-referrer` por default. `Permissions-Policy` não é emitido pelo helmet e o `05` o lista entre os "cabeçalhos além do helmet default".
- **Recomendação:** acrescentar um middleware simples emitindo `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`. Impacto baixo numa API JSON, mas fecha o item.

---

### [BAIXA] CI sem SAST (CodeQL) e sem dependency review em PR — `11` §2 (P1)

- **Local:** `.github/workflows/ci.yml`
- **Evidência:** o pipeline tem 15 jobs bloqueantes cobrindo lint, build, test, `npm audit`, `depcruise`, gitleaks e E2E — cobertura acima da média. Faltam os dois itens P1 do `11` §2: "SAST no pipeline (CodeQL) + dependency review em PR, além do `npm audit`".
- **Recomendação:** adicionar `github/codeql-action` (JavaScript/TypeScript) num workflow próprio e `actions/dependency-review-action` no evento de `pull_request`. Ambos são gratuitos em repositório público.

---

### [BAIXA] Inventário de segredos e procedimento de vazamento não documentados — `11` §4 (P0, DoD)

- **Local:** ausência de documento correspondente em `.claude/docs/`; menções apenas em `.claude/project_context/11-seguranca-infraestrutura.md`
- **Evidência:** o DoD do `11` exige "Todo segredo tem dono, escopo e data da última rotação" e "Procedimento de vazamento documentado e conhecido por quem tem acesso". Existem hoje ~15 segredos distintos (JWT, 5 chaves de criptografia, SMTP ×2, `SIMULATOR_API_TOKEN`, `BROKER_*`, `POSTGRES_PASSWORD`, credenciais do Neon/Render), documentados de forma dispersa entre `backend/.env.example`, `deploy/.env.example`, `render.yaml` e a tabela de `.claude/docs/DEPLOY.md:288-306`. Não há data de rotação registrada em lugar nenhum, e o `RUNBOOK_INCIDENTES.md` existe mas trata do fluxo LGPD (Art. 48), não do procedimento "revogar primeiro, limpar o histórico depois" do `11` §4.
- **Recomendação:** consolidar a tabela do `DEPLOY.md` num `deploy/SEGREDOS.md` com colunas `segredo | onde vive | escopo | última rotação`, e acrescentar ao `RUNBOOK_INCIDENTES.md` uma seção "Vazamento de segredo" com a ordem correta (1. revogar/rotacionar, 2. reescrever histórico, 3. verificar uso indevido, 4. registrar conforme `09`).
- **Nota:** os gates de go-live da ADR-0008 já exigem regeneração de todas as chaves para produção (`backend/.env.example:175-176`, `DEPLOY.md:294-295`) — o que falta é o registro do fato, não a intenção.

---

### [BAIXA] `npm audit` não bloqueia severidade `moderate` — A03

- **Local:** `.github/workflows/ci.yml:107,169,297`
- **Evidência:** `npm audit --audit-level=high` nos três pacotes; `moderate` gera só relatório não bloqueante, com a justificativa comentada no próprio arquivo (vuln moderada conhecida em devDependency sem fix).
- **Recomendação:** manter, mas revisitar periodicamente se a exceção que motivou a escolha ainda existe — o comentário aponta para um achado de `.claude/docs/AUDITORIA_SEGURANCA.md`, e uma exceção sem prazo tende a virar política permanente por inércia.

---

### [BAIXA] Imagem de runtime carrega `devDependencies` completas — Containers (`12`)

- **Local:** `backend/Dockerfile:36-45`; `Dockerfile:62-73`
- **Evidência:** `COPY --from=builder /app/node_modules ./node_modules` traz o toolchain inteiro (tsx, vitest, eslint, prisma CLI, dependency-cruiser) para a imagem de produção. O trade-off está documentado com honestidade nos dois arquivos (o CLI `prisma` é devDependency e é necessário para `migrate deploy`), e o `12` pede "multi-stage build para não publicar toolchain e código-fonte na imagem final".
- **Recomendação:** aceitável na escala do projeto. Se quiser fechar sem perder a simplicidade: `npm ci --omit=dev` no estágio de runtime + `npx --yes prisma@<versão> migrate deploy` no passo de migração, ou um estágio `migrator` separado.

---

### [BAIXA] `/api/status/stream` e `/api/broker/info` do simulador sem autenticação — A01 (superfície do simulador)

- **Local:** `iot-simulator/server/src/api/app.ts:49-59`
- **Evidência:** `requireApiToken` protege `/api/networks` e `/api/devices`, mas `/api/status` (incluindo o stream SSE de status) e `/api/broker/info` são anônimos — decisão consciente e comentada ("EventSource nativo não permite headers customizados"). Expõem topologia de rede simulada e a porta do broker.
- **Atenuante:** em ambos os caminhos de deploy a API do simulador está inalcançável de fora (`API_HOST=127.0.0.1` + `network_mode: service:backend` no compose, mesmo container no Render, sem regra de ufw para 4100). O achado só se materializa se alguém expuser a porta.
- **Recomendação:** manter, com o comentário atual. Se o stream de status vier a ser exposto, usar o mesmo padrão de ticket de uso único já implementado no backend real (`sse-ticket.service.ts`) — a solução já existe no repositório.

---

## Controles verificados OK

**A01 — Broken Access Control**
- Posse verificada bottom-up e de forma consistente em todos os módulos com recurso de usuário: `meter.service.ts:88-96` (`assertOwnership` + `resolveTargetOwnerId` cobrindo os 3 caminhos property/area/device), `alert.service.ts:33-39`, `alert-event.service.ts:32-33`, `property.service.ts:50-51`, `meter-reading.service.ts:48-50`, `user.controller.ts:40,58,88`. `ExportService.generate` recebe o `userId` do middleware e não aceita `:id` na URL.
- RBAC lido do banco a cada requisição (`authenticate.ts:104-105`), nunca de claim do JWT — promoção/rebaixamento tem efeito imediato.
- 72 asserções de 403/"Acesso negado" distribuídas por 15 arquivos de teste de rota: o controle A01 **falha se removido**, conforme o DoD.
- Guard de SSRF (`shared/security/outboundHost.ts`) nega por padrão loopback/link-local/RFC1918/ULA/multicast, resolve DNS de verdade, nega se **qualquer** endereço resolvido for interno, trata `::ffff:` mapeado, tem denylist de portas de serviços internos e falha fechada em CIDR malformado. Aplicado **antes de persistir** (`meter.service.ts:105-114`).

**A02 — Security Misconfiguration**
- Helmet com CSP `default-src 'none'` para a API JSON, HSTS 1 ano com `includeSubDomains`+`preload`, `frame-ancestors 'none'`.
- CORS restrito por env, com `.refine` no `envSchema` proibindo `"*"` em produção quando combinado com `credentials: true`.
- Redirect HTTP→HTTPS por **host canônico fixo** (`PUBLIC_API_ORIGIN`), com rejeição 400 de `Host` forjado — decisão isolada em função pura testada (`httpsRedirect.ts` + `.test.ts`), e `.refine` impedindo o default de localhost em produção.
- Nenhum stack trace ao usuário: `detail` só em `NODE_ENV === "development"`.
- `envSchema` com fail-fast no boot e travas cruzadas inteligentes (bancos de teste não podem apontar para `DATABASE_URL`; `z.stringbool()` em vez de `z.coerce.boolean()` para que `"false"` realmente desligue a flag).

**A03 — Software Supply Chain**
- `npm ci` em todos os jobs, lockfile versionado nos três pacotes.
- gitleaks bloqueante sobre o **histórico completo** (`fetch-depth: 0`), com `--redact`, imagem em versão fixa, sem action de terceiro; `.gitleaks.toml` estende o ruleset default e documenta cada entrada do allowlist individualmente, com justificativa — exatamente o padrão que o `05` exige (nunca regra desligada, nunca allowlist genérica).
- Dependabot semanal cobrindo backend, frontend, iot-simulator e github-actions, com agrupamento minor/patch e major individual.
- `permissions: contents: read` declarado no topo dos dois workflows, com justificativa escrita.

**A04 — Cryptographic Failures**
- bcrypt custo 12 em senha e backup codes.
- AES-256-GCM com IV aleatório de 12 bytes e authTag, **cinco chaves segregadas por finalidade** (CPF/CNPJ, blind index, MFA, endereço, credencial de medidor), validadas por regex de 64 hex no `envSchema`. Blind index HMAC-SHA256 com chave própria para unicidade e busca — chave de cifra nunca reutilizada como chave de MAC.
- Tokens de sessão, refresh e reset de senha persistidos **apenas como hash** (`hashToken`); o valor puro nunca é gravado.
- `Meter.extra.password` cifrado em repouso e sanitizado na resposta da API (`passwordSet: boolean` em vez do valor).
- Segredo TOTP cifrado em repouso e nunca retornado após o cadastro.

**A05 — Injection**
- 100% das queries via Prisma. As quatro ocorrências de `$queryRaw` usam `Prisma.sql` com interpolação parametrizada; os dois pontos onde SQL não aceita bind (`date_trunc` unit e direção de `ORDER BY`) passam por **mapa fechado** (`TRUNC_UNIT`, `ORDER_DIRECTION: Record<BucketOrder, Prisma.Sql>`), com o racional comentado. Nenhuma ocorrência de `$queryRawUnsafe`/`$executeRawUnsafe`.
- `rangeFilter` compõe fragmentos com `Prisma.join`, nunca concatenação de string.
- Zod na borda em todos os módulos, com **allowlist de campos** — `createUserSchema` é `discriminatedUnion` fechado, sem `role`/`isAdmin`/`ownerId`; nenhuma ocorrência de `data: req.body`; nenhum objeto `where` vindo do cliente.

**A06 — Insecure Design**
- Rate limit global (1000/15 min) + estrito (10/15 min) chaveado por `ip:email`, aplicado **depois** do parser JSON e cobrindo login, `/login/mfa` (por semântica de prefixo do `app.use`, com o racional escrito), demo-login, forgot/reset-password, confirm-email-change e `POST /api/users`.
- Paginação com teto rígido (`pageSize` ≤ 31) em todas as listagens do `paginationQuerySchema`.
- MFA com step-up correto: `disableMfa` exige senha **e** código; re-inscrição sobre MFA ativo é recusada; backup codes com hash, uso único e purga dos anteriores.

**A07 — Authentication Failures**
- Cookie `HttpOnly` + `Secure` (produção) + `SameSite=lax` no canal WEB, conforme ADR-0002; JWT nunca entra no corpo da resposta WEB. Nenhum token em `localStorage` — `frontend/src/lib/storage.ts` restringe as chaves a tema e propriedade selecionada por tipo.
- Rotação de refresh token com **detecção de reuso e revogação da família inteira**, mais janela de graça de 5 s para corrida entre abas — implementado e testado.
- Reset de senha revoga todas as sessões e refresh tokens na mesma transação.
- Troca de e-mail exige reautenticação por senha, confirma pelo novo endereço e avisa o antigo.
- CSRF double-submit com comparação em tempo constante, avaliado **depois** da validação do JWT (garante 401 vs. 403 semanticamente corretos), com cookie de refresh de escopo `Path=/api/auth`.
- Stream SSE revalida a sessão a cada 60 s e encerra em logout/revogação (fecha o achado BAIXA do laudo anterior).

**A08 — Software/Data Integrity**
- Todo payload validado por schema antes de processar, inclusive a resposta da API externa da ANEEL (`aneel-response.schema.ts`) — sem desserialização de dado não confiável.

**A09 — Logging & Alerting**
- `redact` do pino cobrindo cookie, `authorization`, `set-cookie`, headers CSRF e os wildcards `*.password`, `*.token`, `*.mfaToken`, `*.secret`, `*.cpf`, `*.cnpj`; com **teste de regressão dedicado** (`app.log-redaction.test.ts`) que falha se o cookie de sessão aparecer em qualquer linha de log.
- Log estruturado (nunca interpolado), `/health` excluído do autologging.
- Trilha de auditoria separada do log de aplicação, com retenção própria (730 dias) e expurgo agendado; e-mail de tentativa de login registrado como **blind index**, não em claro; `USER_UPDATE` registra os nomes dos campos alterados, nunca os valores.
- `ACCESS_DENIED` auditado centralmente no error handler, sem instrumentar os ~17 pontos que lançam `ForbiddenError`.

**A10 — Mishandling of Exceptional Conditions**
- Error handler central com os 4 parâmetros, registrado por último, mensagem genérica ao usuário, detalhe só no log; `errorHandler.test.ts` cobre o comportamento.
- Falha fechada como padrão consistente: `throwRequestEmailChangeNotConfigured` quebra alto em vez de retornar 200 silencioso; `matchesCidr` nega em CIDR malformado; `TariffFlagSyncService` mantém o último valor conhecido em falha da fonte.

**Segurança de cliente**
- CSP no SPA com `script-src` por hash (sem `unsafe-inline` para script), sem source maps em produção (default do Vite mantido), sem `dangerouslySetInnerHTML` nem manipulação de `innerHTML` em todo o `frontend/src`, sem PII em storage do cliente, sem script de terceiro.
- Nenhuma variável `VITE_` do frontend carrega segredo (`VITE_DEMO_MODE`, `VITE_SSE_URL`, `VITE_CSP_CONNECT_EXTRA`, `VITE_PRIVACY_CONTACT_EMAIL` são todas públicas por natureza).
- Redirect pós-login vem de `state.from.pathname` do router, nunca de parâmetro de URL — sem open redirect.

**Infraestrutura**
- Postgres, broker MQTT (1883), API do simulador (4100) e Uptime Kuma **não publicam porta** ao host ou à internet; `provision-vm.sh` abre apenas 22/80/443 no ufw com comentário explicando a ausência deliberada das demais.
- `network_mode: "service:backend"` para o simulador é mais estrito que o bind em 127.0.0.1 anterior — decisão bem raciocinada e documentada.
- Nenhum `pull_request_target` em nenhum workflow; nenhum `echo`/`set -x` de variável secreta; os valores de env do CI são descartáveis, comentados como tal e allowlistados individualmente no gitleaks.
- `.env.example` de todos os pacotes contêm apenas placeholders; `.gitignore` com `.env` + `!.env.example` cobrindo qualquer profundidade (a regra inerte por ancoragem do laudo anterior foi corrigida).
- `demo-entrypoint.sh` encaminha SIGTERM corretamente aos dois processos, preservando o graceful shutdown que persiste o buffer — com o racional escrito.
- Seed de demonstração usa CPF/CNPJ **sintéticos matematicamente válidos**, gerados em código, jamais dados reais (`11` §1 P0 cumprido).

---

## Próximos passos sugeridos

**Antes de qualquer usuário real (bloqueantes de go-live)**
1. Separar o papel de runtime do banco do owner/migrador e adicionar o teste negativo de DDL ao checklist de go-live *(achado ALTA #1)*.
2. Cifrar o backup e registrar a data da primeira restauração testada *(achado ALTA #2)*.
3. Criar o `.dockerignore` da raiz — correção de um arquivo, elimina risco irreversível *(MÉDIA #3)*.
4. Emitir cabeçalhos de segurança no site estático do Render *(MÉDIA #5)* — é o único ponto onde a demo pública hoje está objetivamente pior que o Caminho B.

**Endurecimento de auth (ASVS L3), agrupável numa fatia só**
5. Timeout absoluto de sessão *(MÉDIA #6)*, prefixo `__Host-` *(MÉDIA #7)*, anti-replay de TOTP *(MÉDIA #8)*, `algorithms` explícito no `jwt.verify` *(BAIXA #15)* e equalização de tempo no login *(BAIXA #16)*. São cinco mudanças pequenas na mesma área do código, com testes que devem falhar se o controle for removido.

**Higiene de pipeline e infraestrutura**
6. Pinagem por SHA das actions *(MÉDIA #4)*, CodeQL + dependency review *(BAIXA #24)*, Trivy + Dependabot docker *(BAIXA #20)*, endurecimento do compose *(BAIXA #21)*.
7. Teto de janela em `/api/meter-readings` *(MÉDIA #9)* e redaction da query string do ticket SSE *(MÉDIA #14)*.
8. Consolidar o inventário de segredos e o procedimento de vazamento — fecha dois itens do DoD do `11` com trabalho puramente documental *(BAIXA #25)*.

**Dívida de demonstração, a resolver junto da Fase 13**
9. Tirar `DEMO_PASSWORD` do código-fonte e, com isso, remover a regra e o allowlist correspondentes do `.gitleaks.toml` *(MÉDIA #11)* — o objetivo é que o allowlist do gitleaks volte a não ter nenhuma entrada de credencial.
10. TLS na conexão MQTT de saída, antes de qualquer medidor físico fora de loopback *(MÉDIA #12)*.

**Verificações a executar (não são mudanças de código)**
11. Confirmar no painel do GitHub que *secret scanning* e *push protection* estão ativos (o gitleaks no CI complementa, não substitui) e que a branch protection de `main` exige os status checks e proíbe force-push — ambos são controles do `11` §2 que não se verificam a partir do repositório.
12. Medir `req.ip` na demo do Render para validar `trust proxy: 1` *(BAIXA #19)*.
