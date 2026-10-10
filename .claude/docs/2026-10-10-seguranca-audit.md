# Auditoria de Segurança — 2026-10-10

**Escopo:** branch `staging`, HEAD `b2f7edc`, working tree limpo. Backend (Express 5, Prisma 7), frontend (React 19/Vite), iot-simulator, banco/migrações, `.github/`, `render.yaml`, `Dockerfile`s, `docker-compose.yml`, `deploy/`. A análise foi estática e somente-leitura. As seções do `12` lidas foram React, Express, REST, WebSocket/SSE, JWT, Sessão, MFA/TOTP, Hash de senha, Prisma, PostgreSQL, nginx (para comparar com o Caddy), Containers e E-mail transacional.

**Contexto considerado:** pela ADR-0014, os dois ambientes publicados são permanentemente de demonstração, sem titular real. Com isso, a severidade de itens que dependem de conta real foi ponderada para baixo. Os itens que expõem dado de **visitantes reais** (IP, user-agent) não foram rebaixados. Itens já apontados no laudo de 2026-08-22 e ainda abertos estão marcados como **(persistente)**.

## Resumo (nº de achados por severidade)

| Severidade | Qtde |
|---|---|
| Crítica | 0 |
| Alta | 1 |
| Média | 9 |
| Baixa | 20 |
| **Total** | **30** |

Os pontos que pesam mais nas Fases 29–30 (sessões ativas):
1. O "dado de terceiros na conta demo" foi resolvido só na listagem de sessões. A exportação do titular (DSAR) ainda devolve as sessões reais e o audit log completo da conta demo.
2. A detecção de reuso do refresh token não revoga os JWTs de acesso. Só o encerramento de sessão (Fase 30) revoga.
3. O schema do endpoint admin de audit log ficou para trás e não aceita filtrar as duas ações novas.
4. O novo `describeDevice` tem uma regex com backtracking quadrático sobre o `User-Agent`.

---

## Achados

### [ALTA] Exportação de dados da conta de demonstração entrega IP e user-agent completos de todos os visitantes, além das sessões reais deles — A01 (Broken Access Control) / PII de terceiros
- **Local:**
  - `backend/src/modules/export/export.service.ts:144` (`auditRepository.findByUserId(userId)`) e `:148` (`sessionRepository.findAllForExport(userId)`)
  - `backend/src/shared/audit/audit.repository.ts:48-53` (sem `select`, devolve `ipAddress` e `userAgent` brutos)
  - `backend/src/modules/auth/auth.controller.ts:124-132` (demo-login audita com `...getRequestContext(req)`)
  - `backend/src/shared/audit/requestContext.ts:13` (`ipAddress: req.ip`, IP completo)
  - `backend/src/modules/export/export.routes.ts:51` (sem nenhum tratamento para `isDemo`)
- **Evidência:**
  - A conta demo é compartilhada e acessível sem senha (`POST /api/auth/demo-login`, `DEMO_LOGIN_ENABLED=true` no `render.yaml:36` e recomendado em produção no `backend/.env.example:262`).
  - Todo login demo grava um `AuditLog` com `userId` = conta demo, IP completo e user-agent bruto. O mesmo vale para `ACCESS_DENIED` (escritas bloqueadas pelo `blockDemoWrite`), `DATA_EXPORT` e outras ações.
  - `GET /api/users/me/data-export?format=json|pdf` agrega `auditLogs` e `sessions` por `userId` sem considerar `isDemo`. Qualquer visitante faz demo-login e baixa IP, user-agent e horário de acesso de todos os demais visitantes dos últimos 730 dias (`DATA_RETENTION_AUDIT_LOG_DAYS`). Também baixa `deviceLabel`/`origin` das sessões reais deles.
  - A ADR-0025 §5 reconheceu exatamente esse risco ("a lista real expõe sessões de terceiros") e resolveu só `GET /api/sessions` (`session.service.ts:42`, `buildDemoSessions`). A exportação, que passou a incluir sessões na Fase 29 (ADR-0025 §4), ficou de fora.
  - Efeito colateral: o audit log da conta demo cresce sem teto e é carregado inteiro (`findMany` sem `take`) e renderizado em PDF a cada export. É um vetor de DoS barato e não autenticado.
  - Não há teste de exportação com conta demo (`export/` não tem nenhuma ocorrência de "demo").
- **Recomendação:**
  - Para `isDemo`, devolver na exportação um payload fixo e representativo (mesmo padrão do `buildDemoSessions`), ou bloquear com 403 via `blockDemoWrite`/guard equivalente. Nunca consultar `audit_logs` ou tokens da conta compartilhada.
  - Adicionar teste de rota que falhe se o export da conta demo contiver `ipAddress`, `userAgent` ou sessão real.
  - Avaliar o expurgo dos `audit_logs` já acumulados na conta demo (cruza com `09`, incidente). Este ponto é de conformidade.

### [MÉDIA] Detecção de reuso do refresh token não revoga os JWTs de acesso; logout também deixa vivos os JWTs anteriores da sessão — A07
- **Local:**
  - `backend/src/modules/auth/auth.service.ts:514` → `backend/src/modules/auth/auth.repository.ts:563-568` (`revokeAllRefreshTokensForUser` só faz `refreshToken.updateMany`)
  - `backend/src/modules/auth/auth.service.ts:404-426` (`logout` revoga só o token da requisição e os refresh da sessão)
- **Evidência:**
  - No reuso real (sinal de roubo), o atacante que usou o refresh roubado mantém todo JWT de acesso já emitido válido por até `JWT_WEB_EXPIRES_IN` (1 h). Tokens MOBILE do usuário (90 d) também continuam válidos.
  - No logout, os JWTs de acesso emitidos antes do último refresh da mesma sessão continuam aceitos pelo `authenticate`.
  - Já o encerramento de sessão da Fase 30 revoga corretamente `authToken` por `sessionId` (`session.repository.ts:155-170`). O comportamento é inconsistente entre os três caminhos.
- **Recomendação:**
  - No reuso, revogar na mesma transação `authToken` (WEB e MOBILE) e `refreshToken` do usuário, reaproveitando o padrão de `resetPasswordAndRevokeSessions`.
  - No logout, revogar `authToken.updateMany({ userId, sessionId, revokedAt: null })`.
  - Teste: depois do reuso ou do logout, um JWT anterior da sessão precisa receber 401.

### [MÉDIA] Sessão WEB sem timeout absoluto: cada rotação renova o refresh por mais 7 dias (persistente) — A07
- **Local:** `backend/src/modules/auth/auth.service.ts:585-587` (`expiresAt = now + JWT_REFRESH_EXPIRES_IN` a cada rotação) e `:439-467` (o `refresh` não compara com o início da sessão)
- **Evidência:** a sessão nunca termina enquanto houver uso a cada 7 dias. O `05` (A07) exige timeout absoluto além do idle. O `sessionId` da Fase 29 agora permite derivar o início da sessão, que é o primeiro token da cadeia, mas isso não é usado.
- **Recomendação:** guardar `sessionStartedAt` (ou ler o `createdAt` do primeiro token do `sessionId`) e recusar o refresh após um teto absoluto, por exemplo 30 d (`SESSION_ABSOLUTE_MAX`). O `expiresAt` do refresh deve ser `min(now + 7d, início + teto)`. Incluir teste.

### [MÉDIA] MFA: código TOTP reutilizável dentro da janela, `mfaToken` de uso múltiplo e consumo de backup code não atômico (persistente, ampliado) — A07 / MFA (`12`)
- **Local:**
  - `backend/src/shared/crypto/totp.ts:33` (sem registro do último passo aceito)
  - `backend/src/modules/auth/auth.service.ts:168-172` e `:187-215` (`mfaToken` sem `jti` nem contador)
  - `backend/src/modules/auth/auth.repository.ts:417-422` (`markBackupCodeUsed` faz `update` por id, sem condição `usedAt: null`)
- **Evidência:**
  - O mesmo código de 6 dígitos vale por até ~90 s (`epochTolerance: 1`) e pode ser reapresentado. O `12` exige rejeitar o reuso.
  - O `mfaToken` vale 5 min e aceita tentativas ilimitadas. O único freio é o `authRateLimiter`, chaveado por `ip:` (o corpo não tem e-mail), de modo que um ataque distribuído contorna o limite.
  - Duas requisições concorrentes com o mesmo backup code podem passar ambas pelo `bcrypt.compare` antes da marcação.
- **Recomendação:**
  - Persistir `mfaLastUsedStep` no `User` e recusar `step <= último`.
  - Dar `jti` ao `mfaToken` e limitar as tentativas por token (invalidar após N erros).
  - Consumir o backup code com `updateMany({ where: { id, usedAt: null } })` e aceitar só se `count === 1`.
  - Incluir testes dos três pontos.

### [MÉDIA] Erro de parse do corpo cai no ramo "erro inesperado": responde 500 e loga o corpo cru, inclusive senha — A09 / A10
- **Local:** `backend/src/shared/middlewares/errorHandler.ts:61-71`, com os parsers em `backend/src/app.ts:190-191`
- **Evidência:**
  - O `body-parser` lança um erro com `status: 400`, `type: "entity.parse.failed"` e a propriedade `body` contendo o texto cru da requisição. Como esse erro não é `ZodError` nem `AppError`, o handler faz `logger.error({ err, ... })`.
  - O serializador de erro do pino copia as propriedades enumeráveis, então o `err.body` (por exemplo `{"email":"x","password":"Segredo1!",...` malformado) vai para o log. O redact `*.password` não alcança o conteúdo dentro de uma string.
  - O mesmo vale para `PayloadTooLargeError` (413 vira 500).
  - Resultado: credencial em log, status errado ao cliente e ruído de nível `error`. Não há teste para esse caminho.
- **Recomendação:**
  - No handler, tratar erros com `status`/`statusCode` 4xx do `body-parser` (`type` começando com `entity.`) devolvendo 400/413 genérico, sem logar `err.body`.
  - Adicionar `err.body` aos `logRedactPaths` como defesa extra.
  - Teste: JSON malformado contendo `password` deve gerar 400 e nenhuma ocorrência da senha no stream do logger, no mesmo padrão de `app.log-redaction.test.ts`.

### [MÉDIA] ReDoS em `describeDevice`: regex de Safari com backtracking quadrático sobre o `User-Agent` — A06 / hardening de runtime
- **Local:** `backend/src/shared/session/sessionOrigin.ts:17` (`/Version\/[\d.]+.*Safari\//`), chamado em `auth.service.ts:556` (login, demo-login, MFA e cada refresh)
- **Evidência:**
  - Com um UA `"Version/" + "1"×~16000` (dentro do `maxHeaderSize` padrão do Node) e sem `Safari/`, o par `[\d.]+` / `.*` testa ~N²/2 ≈ 1,3·10⁸ posições. A estimativa é de centenas de ms de event loop bloqueado por requisição; confirmar com benchmark.
  - O ataque não precisa de credencial: o demo-login é público, e com uma sessão demo o `POST /api/auth/refresh` pode ser repetido sob o limiter global (1000/15 min por IP).
  - O UA é entrada do usuário, e o `05` proíbe backtracking catastrófico.
- **Recomendação:**
  - Truncar o UA antes de classificar (por exemplo, os primeiros 512 caracteres).
  - Reescrever o padrão sem `.*` intermediário (por exemplo, testar `/Version\/[\d.]+/` e `/Safari\//` separadamente).
  - Teste: UA adversarial de 16 KB processado em menos de X ms.

### [MÉDIA] Força bruta de senha por endpoints autenticados que pedem a senha atual; exclusão de conta sem reautenticação — A07
- **Local:**
  - `backend/src/modules/user/user.service.ts:164-175` (troca de e-mail via `PUT /api/users/:id`)
  - `backend/src/modules/auth/auth.service.ts:308-311` (`POST /api/auth/mfa/disable`)
  - `backend/src/app.ts:211-223` (o `authRateLimiter` não cobre essas rotas)
  - `backend/src/modules/user/user.controller.ts:115-124` e `user.service.ts:194-208` (`DELETE /api/users/:id` sem senha)
- **Evidência:**
  - Com uma sessão roubada (XSS em outro ponto, dispositivo destravado), o atacante testa senhas pelos dois endpoints a 1000 tentativas/15 min por IP. Vale também para os 6 dígitos do MFA no `disable`, já que a senha precisa acertar primeiro.
  - A exclusão definitiva da conta, que é irreversível, exige só a sessão e o CSRF.
- **Recomendação:**
  - Aplicar um limiter estrito por usuário (chave `user.id`) aos endpoints que verificam senha.
  - Exigir senha (e código MFA, se habilitado) no `DELETE /api/users/:id`.
  - Incluir testes.

### [MÉDIA] Cookies de sessão/CSRF sem prefixo `__Host-` e double-submit não assinado (persistente) — A07 / segurança de cliente
- **Local:** `backend/src/config/env.ts:66-69,167-169` (nomes `lumitrack_session`, `lumitrack_csrf`, ...) e `backend/src/shared/security/csrf.ts:21-29,65-81`
- **Evidência:**
  - O `05` (A07) exige o prefixo `__Host-`.
  - Sem ele, e com o token CSRF comparado só contra o cookie (não vinculado à sessão), um subdomínio irmão comprometido consegue plantar o cookie CSRF (cookie tossing) e anular a proteção.
- **Recomendação:**
  - Em produção, usar `__Host-` nos cookies de path `/`. Para os de path `/api/auth`, usar `__Secure-`, porque `__Host-` exige `Path=/`.
  - Vincular o token CSRF à sessão, por exemplo com um HMAC do `sessionId`.
  - Atualizar `csrf.test.ts`.

### [MÉDIA] Site estático do staging (Render) sem nenhum cabeçalho de segurança HTTP (persistente) — A02
- **Local:** `render.yaml:107-167` (serviço `lumitrack`, sem `headers:`)
- **Evidência:**
  - A SPA do staging não emite `frame-ancestors`/`X-Frame-Options`; a diretiva `frame-ancestors` na `<meta>` CSP de `frontend/index.html:30` é ignorada pelo navegador.
  - Também faltam HSTS, `X-Content-Type-Options`, `Referrer-Policy` e `Permissions-Policy`.
  - Com isso a tela de login e as telas autenticadas podem ser enquadradas em iframe (clickjacking). Produção cobre parte disso no `Caddyfile`; staging não.
- **Recomendação:** declarar `headers:` no serviço estático do `render.yaml` com o mesmo conjunto do `deploy/Caddyfile`, mais `Referrer-Policy` e `Permissions-Policy`.

### [MÉDIA] Conexão MQTT de saída sempre em texto claro, com credencial do medidor (persistente) — A04
- **Local:** `backend/src/modules/iot/iot-worker/protocols/MqttConnection.ts:48` (`mqtt://` fixo) e `:63-69`
- **Evidência:** usuário e senha MQTT, cifrados em repouso, trafegam em claro na rede até o broker. Em produção o tráfego fica na rede interna do compose, mas qualquer medidor real fora dela expõe a credencial.
- **Recomendação:** suportar `mqtts://` (TLS, com verificação de certificado) por configuração do medidor e torná-lo padrão para hosts fora da allowlist interna.

### [BAIXA] Enumeração de conta por tempo: login sem hash falso e forgot-password aguardando o SMTP (persistente, ampliado) — A07 / hash de senha (`12`)
- **Local:** `backend/src/modules/auth/auth.service.ts:112` (`user ? bcrypt.compare(...) : false`) e `:345-358` (insert e `await sendPasswordResetEmail` só quando o e-mail existe)
- **Evidência:** e-mail inexistente responde em poucos ms; e-mail existente custa o bcrypt de 12 rounds (~200 ms) ou o envio SMTP. A diferença é mensurável.
- **Recomendação:**
  - Fazer `bcrypt.compare` contra um hash falso fixo quando o usuário não existir.
  - Disparar o envio do e-mail fora do caminho da resposta (fire-and-forget com log de falha), ou equalizar o tempo de resposta.

### [BAIXA] Rate limit de autenticação chaveado por IP+e-mail: não limita spraying de um IP nem ataque distribuído contra uma conta — A06 / A07
- **Local:** `backend/src/shared/middlewares/rateLimiter.ts:42-46`
- **Evidência:**
  - Trocar o e-mail renova a cota no mesmo IP; o teto passa a ser só o global (1000/15 min).
  - Muitos IPs contra a mesma conta não encontram nenhum teto.
  - O lockout de conta é decisão em aberto no `07` (não assumida aqui).
- **Recomendação:** somar um segundo limiter só por IP nos endpoints de auth e um contador por conta, por exemplo com backoff progressivo. Para lockout, decidir conforme o `07` e registrar ADR.

### [BAIXA] Schema do endpoint admin de audit log desatualizado em relação às ações novas — A09
- **Local:** `backend/src/modules/admin/admin.schema.ts:6-22` em comparação com `backend/src/shared/audit/audit.types.ts:20-21`
- **Evidência:** `SESSION_REVOKE` e `REVOKED_TOKEN_USE` (Fases 29–30) não constam do `z.enum`. Filtrar por elas resulta em 422, e a investigação de uso de token cortado fica sem filtro. O comentário do arquivo afirma "mesmos valores", mas nada garante isso.
- **Recomendação:** derivar o enum de uma constante única (`as const`) compartilhada com `AuditAction`, ou criar um teste de paridade.

### [BAIXA] `jwt.verify` sem allowlist de algoritmo e sem `iss`/`aud`; `mfaToken` e sessão usam o mesmo segredo (persistente) — JWT (`12`)
- **Local:** `backend/src/shared/middlewares/authenticate.ts:79` e `backend/src/modules/auth/auth.service.ts:191`
- **Evidência:** `jsonwebtoken@9` já recusa `none` com segredo string, mas o `12` exige algoritmo explícito e `aud`. A separação entre `mfaToken` e sessão depende só do claim `purpose` e do lookup no banco.
- **Recomendação:** usar `{ algorithms: ["HS256"], issuer, audience }` em todas as chamadas, com `aud` distinto para `mfa-pending`.

### [BAIXA] Revalidação SSRF não cobre as reconexões internas dos adaptadores (DNS rebinding residual) — A01 (SSRF)
- **Local:**
  - `backend/src/modules/iot/iot-worker/IoTConnectionManager.ts:219-240` (checa só em `start()`)
  - `backend/src/modules/iot/iot-worker/protocols/MqttConnection.ts:61,71` (`reconnectPeriod: 1000`)
  - `backend/src/modules/iot/iot-worker/protocols/EthernetIpConnection.ts:84-88` (`reconnect: () => this.connect()`)
- **Evidência:** a cada reconexão automática o hostname é resolvido de novo sem passar pelo `checkOutboundHost`. Um DNS controlado pelo atacante consegue apontar para um endereço interno depois da validação.
- **Recomendação:** fixar (pin) o IP validado na conexão, ou fazer as reconexões passarem pelo funil validado do manager.

### [BAIXA] Sem teto de conexões SSE por usuário nem limiter dedicado no `stream-ticket` (persistente) — WebSocket/SSE (`12`)
- **Local:** `backend/src/modules/iot/iot-stream.routes.ts:281-348` e `:369-383`
- **Evidência:** cada conexão mantém listeners e dois `setInterval`. Não existe limite por `userId`; numa conta demo compartilhada isso vira exaustão de sockets e memória.
- **Recomendação:** criar um contador por usuário, com teto (por exemplo 5), e rejeitar com 429 acima dele. Aplicar um limiter por usuário no `stream-ticket`.

### [BAIXA] `trust proxy: 1` não verificado no staging, agravado pelo rewrite do site estático (persistente) — Express (`12`)
- **Local:** `backend/src/app.ts:90-96` e `render.yaml:159-161`
- **Evidência:**
  - A cadeia no staging é cliente → edge do site estático (rewrite) → edge do serviço → app. Com 1 hop confiável, o `req.ip` pode ser o IP do proxy do rewrite para todos os usuários.
  - Nesse caso, os limiters por IP passam a ser globais. Dez tentativas falhas bloqueariam o login de qualquer e-mail para o mundo inteiro, e o IP do audit log ficaria errado.
- **Recomendação:** registrar `req.ip` e `X-Forwarded-For` reais no staging, ajustar a contagem de hops ou a lista de proxies confiáveis, e documentar o resultado no `DEPLOY.md`.

### [BAIXA] IP completo e ticket SSE nos logs de requisição — A09
- **Local:** `backend/src/app.ts:175-185` (pino-http com serializers padrão) e `frontend/src/lib/sse/appStream.ts:53` (`?ticket=` na URL)
- **Evidência:**
  - O serializer padrão grava `req.url` (com o ticket) e `req.remoteAddress` (IP completo) em toda linha de log.
  - O ticket é de uso único e de 30 s, e quase sempre já foi consumido quando a linha é escrita, por isso a severidade foi reduzida em relação ao laudo anterior.
  - O IP completo em todo log de aplicação contraria o "PII nunca em log" do `CLAUDE.md`.
- **Recomendação:** criar um serializer customizado do `req` que remova a query string (ou o parâmetro `ticket`) e omita ou mascare `remoteAddress` com o `maskIp` existente.

### [BAIXA] API JSON aceita `application/x-www-form-urlencoded` e fica sujeita a login CSRF — A01 / A07
- **Local:** `backend/src/app.ts:191`
- **Evidência:**
  - Um formulário cross-site faz `POST /api/auth/login` (ou `demo-login` / `forgot-password`) como requisição simples, sem preflight.
  - O `Set-Cookie` da resposta de navegação top-level é aceito pelo navegador, o que permite logar a vítima numa conta do atacante. Os endpoints autenticados estão protegidos pelo CSRF.
- **Recomendação:** remover `express.urlencoded` (nenhuma rota usa formulário) ou recusar com 415 o `Content-Type` diferente de JSON nas rotas públicas.

### [BAIXA] Conta demo: relatórios e notificações sem `blockDemoWrite` — A01
- **Local:** `backend/src/modules/report/report.routes.ts:53-54` e `backend/src/modules/notification/notification.routes.ts:16-17`
- **Evidência:** um visitante pode apagar relatórios gerados por outros visitantes, ou ocupar o teto `MAX_MANUAL_REPORTS_PER_USER = 100` da conta compartilhada e negar o recurso aos demais. As notificações têm o mesmo problema.
- **Recomendação:** aplicar `blockDemoWrite` no `DELETE`. Para o `POST`, retornar o relatório sem persistir quando for demo, ou bloquear.

### [BAIXA] E-mail transacional: HTML sem escape, STARTTLS não obrigatório e coerção booleana errada no `SMTP_SECURE` — A02 / A04 / e-mail (`12`)
- **Local:**
  - `backend/src/modules/auth/email.service.ts:142` (`${newEmail}` interpolado no HTML)
  - `email.service.ts:17-25` (sem `requireTLS`)
  - `backend/src/config/env.ts:39` (`z.coerce.boolean()`: `"false"` vira `true`)
- **Evidência:**
  - Hoje o `z.email()` restringe os caracteres de `newEmail`, mas a interpolação não escapa nada.
  - Com `secure:false`, o nodemailer faz STARTTLS oportunista, então o link de reset pode sofrer downgrade.
  - O padrão `stringbool` já é usado para as outras flags do arquivo.
- **Recomendação:** escapar HTML nas interpolações, usar `requireTLS: true` quando `secure` for falso, e trocar para `z.stringbool()`.

### [BAIXA] Sem regra de lint contra `$queryRawUnsafe`/`$executeRawUnsafe` e `dangerouslySetInnerHTML` — A05
- **Local:** `backend/eslint.config.js` (sem `no-restricted-properties`) e `frontend/eslint.config.js` (sem `react/no-danger`)
- **Evidência:**
  - O código atual está limpo. O único `$executeRawUnsafe` (`backend/src/shared/database/withPurgeTimeout.ts:23`) usa valor de env validado.
  - A proibição, porém, depende só de revisão manual. O `05` (DoD) pede regra que falhe se o controle for removido.
- **Recomendação:** proibir as duas APIs via lint, com `eslint-disable` comentado no único uso justificado.

### [BAIXA] Ausência de `.dockerignore` na raiz para o `Dockerfile` da demo (persistente, reclassificado) — Containers (`12`)
- **Local:** `Dockerfile:31` (`COPY backend/ ./`) e `:53` (`COPY iot-simulator/server ./server`), sem `.dockerignore` na raiz (só existem `backend/.dockerignore` e `iot-simulator/.dockerignore`, que não valem para o contexto `.`)
- **Evidência:** num build local, `backend/.env` e `node_modules` do host entram na camada do builder. O Render builda a partir de clone limpo, por isso a severidade foi reduzida.
- **Recomendação:** criar `.dockerignore` na raiz (ou `Dockerfile.dockerignore`) com `**/.env*`, `**/node_modules`, `.git`, `**/dist`.

### [BAIXA] Containers sem `cap_drop`/`no-new-privileges`/limites, imagens por tag mutável, sem varredura nem Dependabot `docker` (persistente) — Containers (`12`) / A03
- **Local:**
  - `docker-compose.yml:12,90,106` (`postgres:16`, `caddy:2`, `louislam/uptime-kuma:1`)
  - `Dockerfile:20,44,57` e `backend/Dockerfile:9,31` (`node:24-slim`)
  - `.github/workflows/ci.yml:57` (`zricethezav/gitleaks:v8.30.1`)
  - `.github/dependabot.yml` (sem ecossistema `docker` e sem `npm` na raiz)
- **Recomendação:** pinar imagens por digest; adicionar `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]` e `mem_limit`/`cpus`; incluir Trivy no CI e Dependabot para `docker` e para o `npm` da raiz.

### [BAIXA] CI sem SAST (CodeQL) e sem dependency review em PR (persistente) — `11` §2 (P1)
- **Local:** `.github/workflows/ci.yml` (nenhum job de CodeQL ou `dependency-review-action`)
- **Recomendação:** criar um workflow CodeQL (JS/TS) e um `actions/dependency-review-action` pinado por SHA, com `permissions` mínimas por job.

### [BAIXA] Inventário de segredos e ordem do procedimento de vazamento não documentados (persistente) — `11` §4 (P0, DoD)
- **Local:** `.claude/docs/DEPLOY.md` e `.claude/docs/RUNBOOK_INCIDENTES.md:48` (menciona rotação, mas sem inventário, dono, escopo e data da última rotação, e sem a ordem "revogar → só então limpar o histórico")
- **Recomendação:** criar a tabela de inventário (segredo, onde vive, quem acessa, última rotação, intervalo) e o procedimento de vazamento na ordem do `11`.

### [BAIXA] SPA de produção sem `Referrer-Policy`/`Permissions-Policy`; CSP com `style-src 'unsafe-inline'` — A02 / hardening de cabeçalhos
- **Local:** `deploy/Caddyfile:51-62` e `frontend/index.html:30`
- **Evidência:**
  - A página `/reset-password?token=` depende do default do navegador para não vazar o token por `Referer`.
  - `script-src`/`connect-src` existem só via `<meta>`; o header CSP do Caddy cobre só três diretivas.
- **Recomendação:** adicionar `Referrer-Policy: no-referrer` (no mínimo nas rotas de token), `Permissions-Policy` restritiva e a CSP completa via header; avaliar a remoção de `'unsafe-inline'` em `style-src`.

### [BAIXA] Backups só na própria VM, sem cópia off-site — `11` §1 (P0, backup)
- **Local:** `deploy/backup-postgres.sh:34` (`/opt/lumitrack/backups`)
- **Evidência:** a perda ou o comprometimento da VM leva junto o banco e todos os backups. A cifra com `age` e o teste de restauração registrado (`deploy/BACKUP-RESTORE-LOG.md`, 2026-08-23) estão OK.
- **Recomendação:** copiar o `.age` para um destino off-site na região Brasil (por causa da trava da ADR-0008) e agendar um novo teste de restauração periódico.

### [BAIXA] Política de senha: bcrypt trunca em 72 bytes, sem teto de tamanho e sem checagem contra senhas vazadas — hash de senha (`12`)
- **Local:** `backend/src/shared/validation/passwordSchema.ts:7-13` e `backend/src/modules/auth/auth.service.ts:34,384`
- **Recomendação:** limitar a 72 bytes UTF-8 (ou pré-hash consistente) e considerar uma lista de senhas vazadas offline. O `12` prioriza comprimento sobre composição.

### [BAIXA] `DATABASE_URL` de produção sem TLS e sem verificação no boot — `11` §1 (P0)
- **Local:** `backend/src/config/env.ts:12` (aceita qualquer URL), mais o `DEPLOY.md:682` (VPS sem `sslmode`)
- **Evidência:** o tráfego na VPS fica na rede interna do compose (risco aceitável); no Neon o `sslmode=require` está documentado. Mesmo assim, nada no código impede que uma URL sem TLS para um host externo vá para produção. `statement_timeout` e o pool já foram corrigidos.
- **Recomendação:** criar um `.refine` em produção que exija `sslmode=require` (ou `verify-full`) quando o host não for o serviço interno `postgres`.

### [BAIXA] Simulador: `/api/status/stream` e `/api/broker/info` sem autenticação (persistente) — A01 (superfície do simulador)
- **Local:** `iot-simulator/server/src/api/app.ts:49-59`
- **Evidência:** não há exposição pública (sem `ports:` no compose e `API_HOST=127.0.0.1` no Render). Fica como defesa em profundidade.
- **Recomendação:** usar um ticket de uso único, no mesmo padrão do backend, para o SSE do simulador.

---

## Controles verificados OK

**Sessões ativas (Fases 29–30)**
- Dono sempre vindo do token, nunca do parâmetro.
- `DELETE /api/sessions/:id` responde 404 uniforme para sessão inexistente ou alheia.
- Revogação transacional de refresh e JWTs por `sessionId`.
- `uuid` validado na borda.
- Corrida de dois pedidos simultâneos resolvida pela contagem do `updateMany`.
- A janela de graça não reativa sessão encerrada (`hasLiveRefreshTokenInSession`).
- `REVOKED_TOKEN_USE` auditado sem derrubar outras sessões.
- Listagem demo fixa.
- Só rótulo reduzido e IP mascarado nos tokens; os campos são limpos do token substituído na rotação.
- `blockDemoWrite` com falha fechada.
- Cobertura forte em `session-revoke.routes.test.ts`.

**Autenticação**
- Tokens de sessão, refresh, reset e troca de e-mail persistidos só como hash.
- Reset de senha e troca de e-mail revogam todas as sessões na mesma transação.
- `role` lida do banco a cada requisição.
- CSRF double-submit com `timingSafeEqual` em métodos não seguros via cookie.
- Cookies `HttpOnly`/`Secure`/`SameSite=Lax`; refresh com path `/api/auth`.
- Reinscrição de MFA bloqueada.
- Segredo TOTP cifrado em repouso.
- Backup codes com bcrypt, apagados ao regerar.
- Forgot-password com resposta idêntica.
- Exigência de senha na troca de e-mail, com aviso ao endereço antigo.

**A01**
- Checagem de ownership em todos os services de domínio amostrados (meter, goal, report, report-schedule, notification).
- `requireRole("ADMIN")` no audit log e no `PUT` de tariff-flag.
- Guard SSRF com resolução de DNS, negação por padrão de faixas internas, portas negadas e revalidação em `start()`.

**A05**
- Todo `$queryRaw`/`$executeRaw` usa tagged template / `Prisma.sql`; `Prisma.raw` só com identificadores de allowlist constante.
- Zod na borda com allowlist de campos (sem `data: req.body`).
- Neutralização de fórmula no CSV.

**A02 / hardening**
- Helmet com CSP deny-all na API, HSTS e `frame-ancestors 'none'`.
- CORS de origem única, com `.refine` contra `*` em produção.
- Host canônico fixo no redirect HTTPS.
- Rate limit global + estrito em auth.
- Paginação com teto (31/200).
- `statement_timeout` e timeout de pool.
- Backpressure no SSE com revalidação periódica da sessão.
- Flags com falha fechada no `env.ts` (`REGISTRATION_ENABLED`, `DEMO_LOGIN_ENABLED`, `DEBUG_QUERY_LOGGING_ENABLED`).

**A09 / A10**
- Redaction no pino com teste (`app.log-redaction.test.ts`).
- Audit log separado do log de aplicação (o `AuditService` loga só um resumo).
- Prisma em produção com `log: ["error"]`.
- Handler central de 4 parâmetros com mensagem genérica (exceto o caso de body-parser apontado acima).

**Banco / infraestrutura**
- Papel `lumitrack_app` só com DML, com teste de regressão (`dbRuntimeRole.test.ts`); migração com usuário administrativo.
- Postgres sem `ports:`; Kuma só em loopback.
- Backup cifrado com `age` (só a chave pública na VM) e restauração testada e registrada.
- Seed demo com senha aleatória.
- `.env.example` só com placeholders; segredos do Render com `sync: false`.
- Containers com `USER node`; multi-stage.

**CI/CD**
- Actions pinadas por SHA completo.
- `permissions: contents: read` no topo.
- Sem `pull_request_target`.
- gitleaks bloqueante com allowlist específica e comentada.
- `npm audit` em high por pacote.
- Dependabot semanal nos três pacotes e em `github-actions`.

**Frontend**
- Sem `dangerouslySetInnerHTML`/`innerHTML`.
- Nenhum token em storage (só tema e propriedade selecionada).
- `withCredentials` + cookie.
- Markdown apenas de conteúdo estático.
- `href` só com constantes.
- `VITE_*` sem segredo (o token do simulador saiu do bundle).
- Source maps desligados (default do Vite).
- `redirectTo` vindo do `state` do router (interno).

### Controles críticos com teste que falha se removidos

| Controle | Situação |
|---|---|
| A01 | Coberto: ownership, `requireRole`, `blockDemoWrite`, SSRF (`outboundHost.test.ts`). **Lacuna:** exportação da conta demo. |
| A04 | Coberto: cifras e blind index; papel de runtime sem DDL. **Lacuna:** TLS do banco e do MQTT sem teste (infra). |
| A05 | Coberto: schemas Zod. **Lacuna:** proibição de raw unsafe sem regra automatizada. |
| A07 | Coberto: `authenticate.test.ts` (CSRF, revogado, role), rate limit (`auth.rate-limit.routes.test.ts`), sessões. **Lacunas:** reuso revogando access tokens, timeout absoluto, replay de TOTP, tempo constante no login. |
| A10 | Coberto: `errorHandler.test.ts`. **Lacuna:** erros de body-parser (400/413) e não-vazamento do corpo no log. |

---

## Próximos passos sugeridos

1. **Imediato (Alta):** neutralizar a exportação da conta demo (payload fixo ou 403), adicionar o teste correspondente e avaliar o expurgo dos `audit_logs` já acumulados na conta demo (cruza com `09`).
2. **Endurecimento de sessão (Médias A07):**
   - Revogar os JWTs de acesso no reuso e no logout.
   - Criar o timeout absoluto aproveitando o `sessionId`.
   - Implementar anti-replay de TOTP, `mfaToken` com tentativas limitadas e consumo atômico do backup code.
   - Criar o limiter por usuário nos endpoints que verificam senha e exigir reautenticação na exclusão de conta.
3. **Correções pontuais de baixo custo:**
   - Tratar erros do body-parser no `errorHandler` e adicionar `err.body` ao redact.
   - Truncar o UA e reescrever a regex do `describeDevice`.
   - Sincronizar o enum do audit log do admin.
   - Remover `express.urlencoded`.
   - Usar `z.stringbool` no `SMTP_SECURE`.
4. **Cabeçalhos e cookies:** prefixo `__Host-`/`__Secure-` com CSRF vinculado à sessão; `headers:` no site estático do `render.yaml`; `Referrer-Policy`/`Permissions-Policy` no Caddy.
5. **Infraestrutura (persistentes):** `.dockerignore` na raiz; pinagem por digest; `cap_drop`/limites; Trivy; CodeQL; dependency review; Dependabot `docker`; inventário de segredos; backup off-site; confirmação empírica do `trust proxy` no staging.
6. **Pendente de decisão (`07`):** lockout de conta. Não implementar sem ADR.
7. Oferecer a abertura das issues destes achados via skill `criar-issues`, com aprovação em lote.
