# Auditoria de Segurança — LumiTrack

> **Escopo:** OWASP Top 10:2025 + conformidade com a LGPD (Lei nº 13.709/2018)
> **Data da auditoria:** 2026-06-27
> **Versão do documento:** 2.0
> **Branch de remediação:** `security/owasp-lgpd-remediation`
> **Stack auditado:** Backend Node.js/TypeScript (Express 5, Prisma 7, PostgreSQL) · Frontend React 19/Vite

---

## 1. Sumário executivo

O LumiTrack é uma plataforma de monitoramento de consumo de energia que coleta e
trata **dados pessoais** (email, nome, CPF, CNPJ, endereço/geolocalização via
propriedade e padrões de consumo), o que o submete integralmente à LGPD.

A base de código possui **fundamentos de segurança sólidos**: senhas com bcrypt
(12 rounds), JWT com revogação persistida em banco, autorização por posse de
recurso consistente, validação de entrada com Zod, Helmet, e acesso a dados via
ORM parametrizado (sem SQL raw). Entretanto, foram identificadas **lacunas de
segurança e não-conformidades críticas com a LGPD** que impedem a operação em
produção com usuários reais.

**Principais riscos (estado original da auditoria, 2026-06-27):**

| Severidade | Quantidade | Exemplos |
|------------|-----------|----------|
| 🔴 Crítico | 1 | Ausência de rate limiting na autenticação (brute force) |
| 🟠 Alto    | 5 | CPF/CNPJ e JWT em texto claro; sem consentimento LGPD; sem audit log; token mobile sem expiração; misconfig de CORS/Helmet/HTTPS |
| 🟡 Médio   | 3 | Vulns de dependência (dev); sem CI/CD com gates; política de senha fraca |
| 🟢 Baixo   | 3 | Injection (mitigado); RBAC raso; tratamento de exceções (mitigado) |

**Estado atual (pós #01/#02/#04/#05/#06/#07/#08/#11/#12/#15 — ver Seção 3 e `IMPLEMENTATION_LOG.md`):**

| Severidade | Quantidade | Categorias |
|------------|-----------|----------|
| 🔴 Crítico | 0 | — |
| 🟠 Alto    | 0 | — |
| 🟡 Médio   | 0 | — |
| 🟢 Baixo   | 10 | A01, A02, A03, A04, A05, A06, A07, A08, A09, A10 |

A remediação está organizada em **4 fases** (ver Seção 6), iniciando pelos itens
críticos antes de qualquer ida a produção.

---

## 2. Escopo e metodologia

A auditoria cobriu o código-fonte do backend e do frontend, schema do banco
(Prisma), configuração de ambiente, gerenciamento de segredos e dependências.
A análise foi conduzida por:

- **Revisão estática de código** (autenticação, autorização, criptografia,
  tratamento de erros, validação de entrada).
- **Mapeamento ao OWASP Top 10:2025** (10 categorias).
- **Mapeamento aos artigos da LGPD** relevantes ao tratamento de dados pessoais.
- **Análise de dependências** (`npm audit`).

Evidências são referenciadas no formato `arquivo:linha`.

---

## 3. Achados — OWASP Top 10:2025

| Cat. | Categoria | Achado | Severidade |
|------|-----------|--------|------------|
| A01 | Broken Access Control | Autorização por posse de recurso presente e consistente (✅). Atenção: `userType` (INDIVIDUAL/COMPANY) não é RBAC real — sem papel admin/escopos. | 🟢 Baixo |
| A02 | Security Misconfiguration | ~~Helmet com config padrão~~ ~~CORS sem guard~~ ~~sem HTTPS/HSTS~~ ~~sem `.env.example`~~ **corrigido (#05)** — CSP explícito (deny-all, API pura), HSTS explícito, guard `CORS_ORIGIN='*'` bloqueado em produção, redirect HTTP→HTTPS + `trust proxy` em produção, `.env.example` criado. ~~Cookie de sessão WEB sem atributos de segurança~~ **corrigido (#06)** — `httpOnly`/`Secure` (produção)/`SameSite=Lax`. | 🟢 Baixo (era 🟠 Alto) |
| A03 | Software Supply Chain Failures | ~~Sem CI com auditoria automática~~ ~~sem Dependabot~~ **corrigido (#11)** — GitHub Actions audita `npm audit` (bloqueia em high/critical) em todo PR/push, `.github/dependabot.yml` mantém dependências atualizadas semanalmente. 3 vulns moderadas no backend (`@hono/node-server` via `@prisma/dev` — **dependência de desenvolvimento**, risco real reduzido, sem fix não-breaking disponível) seguem como aviso não-bloqueante, monitoradas pelo gate. ~~Sem ESLint no backend~~ **corrigido (#17)** — flat config espelhando o padrão do frontend, job dedicado `backend-lint` no CI. | 🟢 Baixo (era 🟡 Médio) |
| A04 | Cryptographic Failures | ~~CPF/CNPJ em texto claro~~ **corrigido (#07)** — AES-256-GCM + blind index (HMAC-SHA256) para preservar unicidade/busca. ~~Endereço da propriedade em texto claro~~ **corrigido (#15)** — AES-256-GCM (sem blind index: endereço não tem `@unique` nem é filtro de query), chave própria `ADDRESS_ENCRYPTION_KEY` para compartimentalização; todos os 4 campos cifrados (`address`, `city`, `state`, `zipCode`). ~~JWT armazenado em texto claro~~ **corrigido (#04)** — agora SHA-256. Senhas com bcrypt 12 (✅). | 🟢 Baixo (era 🟡 Médio) |
| A05 | Injection | Prisma parametrizado, sem `$queryRaw`; React escapa por padrão, sem `dangerouslySetInnerHTML` (✅). | 🟢 Baixo |
| A06 | Insecure Design | ~~Tokens MOBILE nunca expiram~~ **corrigido (#04)** — expiram após `MOBILE_TOKEN_EXPIRES_IN` (default 90d). ~~Política de senha sem caractere especial~~ **corrigido (#12)** — exige símbolo, além de maiúscula/minúscula/número. ~~Sem refresh token para sessão WEB~~ **corrigido (#14)** — refresh token opaco (32 bytes, SHA-256) com rotação + detecção de reuso, CSRF dedicado, renovação proativa e reativa no frontend. Sem rate limit por design. | 🟢 Baixo (era 🟠 Alto) |
| A07 | Authentication Failures | ~~Sem rate limiting / proteção brute-force~~ **corrigido (#01)** — limiter global por IP + limiter estrito por IP+e-mail em `/login`, `/forgot-password`, `/reset-password`, `/login/mfa`. ~~Sem proteção CSRF na sessão WEB~~ **corrigido (#06)** — double-submit cookie. ~~Sem MFA~~ **corrigido (#12/#18)** — MFA opcional via TOTP (`otplib`) + backup codes de uso único; API completa (#12) e UI do frontend (#18) — setup com QR code, backup codes e segundo passo no login. Ainda sem lockout de conta (gap menor, não bloqueante). Anti-enumeração no forgot-password (✅). | 🟢 Baixo (era 🔴 Crítico) |
| A08 | Software/Data Integrity Failures | ~~Sem CI/CD~~ ~~sem verificação de integridade de build~~ **corrigido (#11)** — pipeline GitHub Actions (`.github/workflows/ci.yml`) builda/testa backend e frontend (typecheck, testes unitários/integração, e2e via Playwright) em todo PR/push usando `npm ci` (instalação reprodutível a partir do lockfile) em todos os jobs. Scripts de dependência (`postinstall` etc.) continuam não auditados individualmente — gap residual, fora do escopo desta sub-issue. | 🟢 Baixo (era 🟡 Médio) |
| A09 | Logging & Alerting Failures | ~~Apenas `console.*`~~ **corrigido (#08)** — logger estruturado (pino) em todo o backend; ~~sem audit log~~ **corrigido (#08)** — tabela `audit_logs` registra login/logout, acessos negados (403, capturado centralizadamente) e CRUD de User/Property. | 🟢 Baixo (era 🟠 Alto) |
| A10 | Mishandling of Exceptional Conditions | Error handler global cobre Zod/AppError/500 e não vaza stack em produção (✅). Atenção: sem request-id correlacionável e sem handler central documentado de `unhandledRejection`. | 🟢 Baixo |

### 3.1 Detalhamento e evidências

- **A07 — Sem rate limiting — ✅ corrigido (#01).** Limiter global por IP em
  toda a API + limiter estrito por IP+e-mail em `/login`, `/forgot-password`,
  `/reset-password` (`429` via `TooManyRequestsError`). Evidência:
  [rateLimiter.ts](../backend/src/shared/middlewares/rateLimiter.ts),
  [app.ts](../backend/src/app.ts).
- **A04 — JWT em texto claro no banco — ✅ corrigido (#04).** O token agora é
  hasheado (SHA-256) antes de persistir em `auth_tokens.token`; o JWT puro nunca
  é gravado. Evidência: [hashToken.ts](../backend/src/shared/crypto/hashToken.ts),
  [auth.service.ts](../backend/src/modules/auth/auth.service.ts),
  [authenticate.ts](../backend/src/shared/middlewares/authenticate.ts).
- **A04 — CPF/CNPJ em texto claro — ✅ corrigido (#07).** Os campos `cpf`/`cnpj`
  do usuário passam a guardar o valor cifrado com AES-256-GCM (IV aleatório a
  cada criptografia — por isso deixaram de ser `@unique`). Um blind index
  determinístico (HMAC-SHA256, chave separada da chave de cifra) em
  `cpfBlindIndex`/`cnpjBlindIndex` preserva a constraint de unicidade e
  permite busca por igualdade sem nunca expor o valor cifrado para
  comparação. Cifra/decifra acontece na borda do `UserRepository` — o resto
  da aplicação (service, controller, frontend) continua recebendo o valor em
  texto claro, sem nenhuma mudança de contrato de API. Script de backfill
  (`backend/scripts/backfill-cpf-cnpj-encryption.ts`, idempotente) cobre
  dados que já existiam em texto claro antes da #07. Escopo: apenas
  `users.cpf`/`users.cnpj` — o CNPJ da distribuidora de energia
  (`energy_distributors.cnpj`) foi deliberadamente excluído (decisão
  registrada com o usuário): identifica uma pessoa jurídica terceira
  (a concessionária), não o titular dos dados pessoais. Evidência:
  [encryption.ts](../backend/src/shared/crypto/encryption.ts),
  [blindIndex.ts](../backend/src/shared/crypto/blindIndex.ts),
  [user.repository.ts](../backend/src/modules/user/user.repository.ts),
  [schema.prisma](../backend/prisma/schema.prisma).
- **A04 — Endereço da propriedade em texto claro — ✅ corrigido (#15).** Os
  campos `address`, `city`, `state` e `zipCode` do modelo `Property` passam a
  guardar o valor cifrado com AES-256-GCM (chave própria
  `ADDRESS_ENCRYPTION_KEY`, separada de `CPF_CNPJ_ENCRYPTION_KEY` e
  `MFA_SECRET_ENCRYPTION_KEY` — compartimentalização de risco entre categorias
  de dado pessoal). Não há blind index: ao contrário de CPF/CNPJ, endereço não
  tem constraint `@unique` e nunca é usado como filtro de query. Nenhuma
  migration de schema foi necessária (colunas já existiam como `String?`).
  Cifra/decifra centralizada na borda do `PropertyRepository` — contrato de
  API inalterado. Script de backfill idempotente
  (`backend/scripts/backfill-address-encryption.ts`) via heurística
  try-decrypt (AES-GCM auth tag torna falso-positivos negligíveis). CI
  atualizado com `MFA_SECRET_ENCRYPTION_KEY` (que estava faltando desde a
  #12) e `ADDRESS_ENCRYPTION_KEY`. Evidência:
  [addressEncryption.ts](../backend/src/shared/crypto/addressEncryption.ts),
  [property.repository.ts](../backend/src/modules/property/property.repository.ts).
- **A06 — Token MOBILE sem expiração — ✅ corrigido (#04).** Tokens MOBILE agora
  expiram após `MOBILE_TOKEN_EXPIRES_IN` (default 90 dias), tanto no `exp` do
  JWT quanto no `expiresAt` persistido — verificado pelo middleware
  `authenticate.ts` a cada requisição. Evidência:
  [env.ts](../backend/src/config/env.ts), [auth.service.ts](../backend/src/modules/auth/auth.service.ts).
- **A02 — CORS/Helmet/HTTPS — ✅ corrigido (#05).** CSP explícito deny-all
  (`default-src 'none'`, `frame-ancestors 'none'` — apropriado para API JSON
  pura, sem HTML servido); HSTS explícito (1 ano, `includeSubDomains`,
  `preload`); guard que rejeita `CORS_ORIGIN='*'` quando `NODE_ENV=production`
  (boot falha); `trust proxy` + redirect 301 HTTP→HTTPS em produção;
  `backend/.env.example` criado. Evidência: [app.ts](../backend/src/app.ts),
  [env.ts](../backend/src/config/env.ts), [env.test.ts](../backend/src/config/env.test.ts).
- **A09 — Logger estruturado + audit log — ✅ corrigido (#08).** Todas as ~37
  ocorrências de `console.*` substituídas por `pino` (JSON em produção,
  pretty-print em desenvolvimento, silencioso em testes), incluindo
  `pino-http` para log automático de requisição/resposta (com isso, ganha-se
  de bônus uma correlação básica por `req.id` — sem fechar por completo o
  gap de A10 sobre request-id documentado, que segue pendente). Nova tabela
  `audit_logs` (Prisma) registra: `LOGIN`/`LOGOUT` (sucesso e falha, com
  `outcome`), `ACCESS_DENIED` (403 — capturado **centralizadamente** no
  `errorHandler`, cobrindo os ~17 pontos do código que lançam
  `ForbiddenError` sem precisar instrumentar cada um) e CRUD de `User`/
  `Property` (apenas create/update/delete — leitura não é auditada, não é
  considerada um "incidente"). `metadata` nunca guarda valores sensíveis —
  em updates, só os **nomes** dos campos alterados (ex.: `["address"]`),
  nunca o conteúdo. `userId` usa `onDelete: SetNull` (diferente do padrão
  `Cascade` do restante do schema) — de propósito, para o registro
  sobreviver à exclusão da conta. Escopo do CRUD: `User` + `Property`
  (endereço já reconhecido como dado pessoal no gap #15) — decisão
  registrada com o usuário; outras entidades (Distributor, Alert, etc.)
  seguem cobertas apenas pelo `ACCESS_DENIED` automático, não por CRUD
  dedicado. Evidência: [logger.ts](../backend/src/shared/logger/logger.ts),
  [audit.service.ts](../backend/src/shared/audit/audit.service.ts),
  [errorHandler.ts](../backend/src/shared/middlewares/errorHandler.ts),
  [schema.prisma](../backend/prisma/schema.prisma).
- **A02/A07 — Sessão WEB via httpOnly cookies + CSRF — ✅ corrigido (#06).**
  Canal WEB migrou de JWT em `localStorage` (exposto a XSS) para cookie
  `httpOnly` (`Secure` em produção, `SameSite=Lax`); cookie CSRF não-httpOnly
  combinado com header `X-CSRF-Token` (double-submit) em toda requisição
  mutável autenticada via cookie. Canal MOBILE permanece inalterado (Bearer no
  header, isento de CSRF — não é vulnerável por natureza). Novo endpoint
  `GET /api/auth/me` substitui a decodificação local do JWT no frontend
  (impossível agora que o cookie é httpOnly). Evidência:
  [csrf.ts](../backend/src/shared/security/csrf.ts),
  [authenticate.ts](../backend/src/shared/middlewares/authenticate.ts),
  [auth.controller.ts](../backend/src/modules/auth/auth.controller.ts),
  [api.ts](../frontend/src/services/api.ts),
  [auth.service.ts](../frontend/src/services/auth.service.ts).
  ~~Pendente (fora do escopo desta sub-issue, ver #14 no roadmap): refresh
  token — o JWT WEB continua expirando em 15min sem renovação automática.~~ **corrigido (#14)** — ver abaixo.
- **A06 — Refresh token para sessão WEB — ✅ corrigido (#14).** Novo modelo
  `RefreshToken` (token opaco de 32 bytes, SHA-256 persistido, nunca JWT)
  emitido a cada login WEB com `JWT_REFRESH_EXPIRES_IN` (default 7d). Rotação
  a cada uso: token antigo marcado como `revokedAt` + `replacedByTokenId` →
  novo token; reuso de token revogado (fora da janela de graça
  `REFRESH_TOKEN_GRACE_PERIOD_MS=5s`) revoga **todas** as sessões/refresh
  tokens do usuário e registra `REFRESH_TOKEN_REUSE_DETECTED` no audit log
  (compromisso potencial). Janela de graça curta evita falso positivo quando
  duas abas renovam quase simultaneamente. CSRF dedicado: cookies
  `lumitrack_refresh` (httpOnly, `path:/api/auth`) e `lumitrack_refresh_csrf`
  (não-httpOnly, `path:/api/auth`, `maxAge` de 7d) — separados dos cookies
  de sessão (15min) para sobreviver à expiração do JWT. Frontend: renovação
  proativa via timer (~80% = 12min, `scheduleProactiveRefresh`) + fallback
  reativo no interceptor de 401 com retry único (`ensureFreshSession` singleton)
  — evita que o stream SSE quebre silenciosamente. Evidência:
  [schema.prisma](../backend/prisma/schema.prisma),
  [auth.repository.ts](../backend/src/modules/auth/auth.repository.ts),
  [auth.service.ts](../backend/src/modules/auth/auth.service.ts),
  [auth.controller.ts](../backend/src/modules/auth/auth.controller.ts),
  [csrf.ts](../backend/src/shared/security/csrf.ts),
  [sessionRefresh.ts](../frontend/src/lib/sessionRefresh.ts),
  [api.ts](../frontend/src/services/api.ts).

---

## 4. Achados — Conformidade LGPD

| Art. LGPD | Requisito | Status | Ação |
|-----------|-----------|--------|------|
| Art. 7º/8º | Base legal / consentimento explícito | ✅ Implementado (#02) | Campo `consentedAt`/`consentVersion` no `User` + checkbox obrigatório no registro (backend e frontend) |
| Art. 9º | Transparência (Política de Privacidade e Termos) | ✅ Implementado (#03) | Documentos versionados em `frontend/src/legal/*.md`, renderizados em `/privacidade` e `/termos` |
| Art. 18 | Acesso e portabilidade | ✅ Implementado (#09) | Endpoint `GET /api/users/me/data-export?format=json\|pdf` — JSON traz perfil, properties, distribuidoras, áreas, dispositivos, alertas, histórico de consumo completo (sem corte) e audit log do titular; PDF traz o mesmo conteúdo com resumo agregado de consumo (não a lista bruta) e identidade visual do LumiTrack |
| Art. 16/18 | Eliminação de dados | ✅ Implementado | `DELETE /api/users/:id` + cascade — manter e auditar |
| Art. 18 | Retificação | ✅ Implementado | `PUT /api/users/:id` — manter |
| Art. 46 | Segurança dos dados | ✅ Implementado (#07/#15) | ~~Cripto de CPF/CNPJ~~ ✅ (#07); hardening ✅ (#02/#05/#06); ~~audit log~~ ✅ (#08); ~~cripto do endereço~~ ✅ (#15) |
| Art. 15/16 | Retenção mínima | ✅ Implementado (#10) | `RetentionPurgeScheduler` (roda no boot + 1x/dia) remove `AuthToken`/`PasswordReset` inativos há 30 dias e `AuditLog` com mais de ~2 anos; períodos configuráveis via `DATA_RETENTION_*` |
| Art. 37-39 | Operadores (DPA com SMTP) | ⚠️ Parcial | Checklist de requisitos de segurança para provedor SMTP documentado (ver Seção 7.1); nenhum provedor de produção escolhido ainda; DPA pendente de assinatura quando selecionado |
| Art. 48 | Resposta a incidentes | ✅ Implementado (#13) | Runbook operacional completo em `docs/RUNBOOK_INCIDENTES.md` (detecção → contenção → avaliação de risco → notificação ANPD/titulares → lições aprendidas) |

---

## 5. Classificação de risco

A severidade combina **impacto** (confidencialidade de dados pessoais, integridade
de credenciais) e **probabilidade de exploração**. Itens 🔴/🟠 devem ser resolvidos
antes de qualquer ambiente de produção com usuários reais. As multas da LGPD
podem chegar a **R$ 50 milhões ou 2% do faturamento** por infração (Art. 52).

---

## 6. Roadmap de remediação

### Fase 0 — Documentação (este documento) · #00
Registro formal da auditoria — base para governança e Art. 48.

### Fase 1 — Crítico (antes de produção) — ✅ Concluída (2026-06-27)
- **#01** ✅ Rate limiting nos endpoints de autenticação (A07)
- **#02** ✅ Consentimento LGPD no cadastro (Art. 7º)
- **#03** ✅ Política de Privacidade e Termos de Uso (Art. 9º)
- **#04** ✅ Expiração de token MOBILE + hash do JWT no banco (A04/A06)
- **#05** ✅ Hardening de CORS/Helmet/HTTPS + `backend/.env.example` (A02)

### Fase 2 — Alto — ✅ Concluída (2026-06-28)
- **#06** ✅ Sessão via httpOnly cookies + CSRF (A02/A07) — migrado de `localStorage`
  (canal WEB) para cookie `httpOnly`/`Secure`/`SameSite=Lax` + CSRF double-submit
  cookie; canal MOBILE inalterado (Bearer)
- **#07** ✅ Criptografia de CPF/CNPJ + blind index (A04/Art. 46) — AES-256-GCM
  (cifra) + HMAC-SHA256 (blind index, chave separada) para preservar
  unicidade/busca; escopo restrito a `users.cpf`/`users.cnpj`
- **#08** ✅ Logger estruturado (pino) + audit log (A09/Art. 46) — tabela
  `audit_logs` para login/logout/403/CRUD de User+Property; `console.*`
  substituído por pino em todo o backend
- **#09** ✅ Exportação de dados do titular / DSAR (Art. 18) — endpoint
  `GET /api/users/me/data-export?format=json|pdf`; JSON sem corte (inclui
  ConsumptionRecord completo e AuditLog do titular); PDF com resumo
  agregado de consumo e identidade visual do LumiTrack (PDFKit, sem
  Chromium — minimiza superfície de supply chain do A03)

### Fase 3 — Médio
- **#10** ✅ Retenção e expurgo de dados (Art. 15/16) — `RetentionPurgeScheduler`
  (mesmo padrão sem dependência nova do `HourlyRollupScheduler`) roda no boot
  e a cada 24h; remove `AuthToken`/`PasswordReset` inativos há mais de 30
  dias e `AuditLog` com mais de ~2 anos (remoção completa, não anonimização)
  — períodos configuráveis via `DATA_RETENTION_AUTH_TOKEN_DAYS`/
  `DATA_RETENTION_PASSWORD_RESET_DAYS`/`DATA_RETENTION_AUDIT_LOG_DAYS`
- **#11** ✅ CI/CD com gates de segurança (A03/A08) — pipeline GitHub
  Actions (`.github/workflows/ci.yml`): typecheck/build/testes unitários e
  e2e (Playwright) dos dois projetos, `npm audit` (bloqueia high/critical,
  moderate só avisa) em todo PR/push; `.github/dependabot.yml` (npm
  backend+frontend, GitHub Actions, semanal). Lint do backend ficou fora
  do escopo — ver **#17**.
- **#12** ✅ Política de senha forte + MFA opcional (A06/A07) — senha exige
  caractere especial (além de maiúscula/minúscula/número); MFA via TOTP
  (`otplib`, QR code via `qrcode`) + 10 backup codes de uso único (bcrypt);
  login em duas etapas quando habilitado (`mfaToken` de 5min, stateless);
  chave de cifra própria do secret TOTP (`MFA_SECRET_ENCRYPTION_KEY`,
  separada de CPF/CNPJ); escopo restrito ao backend — UI do frontend
  (tela de configuração + segundo passo no login) fica para **#18**
- **#13** ✅ DPA com operador SMTP + runbook de incidentes (Art. 37-39/48)
- **#14** ✅ Refresh token para sessão WEB (A06) — token opaco (32 bytes,
  SHA-256) com rotação a cada uso, detecção de reuso (revogação em cascata
  + `REFRESH_TOKEN_REUSE_DETECTED` no audit log), janela de graça de 5s
  para corrida entre abas, CSRF dedicado (`lumitrack_refresh_csrf`, path
  restrito a `/api/auth`), expurgo pelo `RetentionPurgeScheduler`; frontend
  com renovação proativa em ~12min + interceptor reativo de 401 com retry
  único — resolve o loop SSE silencioso quando o JWT expira
- **#15** ✅ Criptografia do endereço da propriedade (A04/Art. 46) — AES-256-GCM
  com chave própria `ADDRESS_ENCRYPTION_KEY` para todos os 4 campos
  (`address`, `city`, `state`, `zipCode`); sem blind index (não há unicidade
  nem busca por endereço); nenhuma migration de schema; backfill idempotente
  via try-decrypt. Corrigido também o gap de CI: `MFA_SECRET_ENCRYPTION_KEY`
  estava faltando nos jobs `backend-test` e `e2e` desde a #12.
- **#16** Endpoint administrativo para consulta do audit log (A09/Art. 48) —
  hoje a tabela `audit_logs` só é consultável via acesso direto ao banco
  (Prisma Studio/SQL); um endpoint HTTP dedicado depende de RBAC real
  (papel admin), que não existe ainda (ver A01 — `userType` não é RBAC) —
  bloqueado até essa base existir
- **#17** ✅ ESLint no backend (qualidade/A03) — gap conhecido desde a #11:
  o frontend já tem ESLint configurado e lintado no CI, mas o backend não
  tinha nenhuma configuração de lint; ficou fora do escopo da #11 (que focou
  em CI/CD + gates de segurança, não em qualidade de código geral).
  `backend/eslint.config.js` (flat config) espelha exatamente o padrão do
  frontend (`js.configs.recommended` + `tseslint.configs.recommended`, sem
  type-checking), adaptado para Node (`globals.node` em vez de
  `globals.browser`, sem plugins de React); novo job `backend-lint` no CI
  espelha o `frontend-lint`. O lint revelou um bug real pré-existente em
  `server.ts` — o `flush()` final do buffer IoT no shutdown gracioso não
  era `await`ado (precedência do operador `await` fazia com que só a
  comparação numérica fosse aguardada, não a Promise do `flush()`),
  corrigido junto
- **#18** ✅ UI de MFA no frontend (A06/A07) — fecha o gap aberto desde a
  #12: a API já existia e estava testada, faltava a tela. Nova página
  `/seguranca` (`SecurityPage.tsx`, acessível via UserMenu no Header) com
  três estados: setup (QR code via `<img>` + secret manual + confirmação
  do código TOTP), exibição única dos 10 backup codes, e desativação
  (senha + código). Segundo passo do login (`LoginPage.tsx`) — quando o
  backend responde `mfaRequired:true`, a página troca o form de
  credenciais por um campo de código único (`MfaCodeForm`, componente
  compartilhado entre login e setup, já que o backend aceita o mesmo
  formato de campo — TOTP de 6 dígitos ou backup code — nos dois casos).
  `User.mfaEnabled` novo no tipo do frontend; `AuthContext.login()` passou
  a retornar um `LoginResult` (`{mfaRequired,mfaToken}` ou `{user}}`) em
  vez de autenticar direto, para o caller decidir se mostra o segundo
  passo; novos `completeMfaLogin()`/`refreshUser()` no contexto. Mutations
  de setup/verify/disable via `@tanstack/react-query`
  (`useMfaMutations.ts`), mesmo padrão já usado no resto do app.

### Decisões de arquitetura
- **Sessão:** migração de `localStorage` → **httpOnly cookies** (Secure + SameSite) + CSRF.
- **CPF/CNPJ em repouso:** **AES-256-GCM na aplicação + blind index (HMAC-SHA256)**
  para preservar unicidade (`@unique`) e busca. ✅ Implementado (#07).

---

## 7. Runbook de resposta a incidentes (LGPD Art. 48)

Runbook operacional completo em [`docs/RUNBOOK_INCIDENTES.md`](RUNBOOK_INCIDENTES.md) (versionado). Cobre:

1. **Detecção e classificação** — fontes (logs pino, `audit_logs`, CI/CD gates), matriz de severidade.
2. **Contenção e erradicação** — ações imediatas por tipo de incidente (credencial comprometida, acesso não-autorizado, vulnerabilidade de dependência).
3. **Avaliação de risco aos titulares** — como usar `audit_logs` e export DSAR (#09) para reconstruir eventos.
4. **Notificação à ANPD e aos titulares** — critérios de "risco relevante", prazos, template de comunicação.
5. **Registro e lições aprendidas** — documentação do incidente, atualização de procedimentos.

O runbook é um **documento vivo** — deve ser atualizado a cada incidente real e a cada sub-issue de segurança nova.

### 7.1 Requisitos para Data Processing Agreement (DPA) com operadores SMTP

Nenhum provedor de produção foi selecionado ainda. Quando um operador SMTP for escolhido, exigir contratualmente:

| Requisito | Descrição |
|-----------|-----------|
| **TLS obrigatório** | Transporte TLS 1.2+ (STARTTLS ou porta 465). Nenhuma transmissão de credenciais/e-mails em texto claro. |
| **Retenção mínima de logs** | Provedor deve manter logs de envio por pelo menos 30 dias, acessíveis para investigação de incidentes. |
| **Localização de processamento** | Dados pessoais (endereços de e-mail dos titulares) só podem ser processados no Brasil ou em país com adequação LGPD. |
| **Notificação de incidente** | Se houver vazamento/perda de dados no provedor, notificar o controlador (LumiTrack) em prazo razoável (máx. 72h). |
| **Cláusula de revogação** | Direito de revogar acesso a qualquer momento (ex.: mudar de provedor SMTP). Dados residuais devem ser destruídos ou anonimizados. |
| **Subcontratadores** | Provedor deve documentar qualquer subcontratador seu (ex.: provedores de cloud onde os dados são armazenados) e obtém consentimento de LumiTrack antes de adicionar novos. |
| **Auditoria/compliance** | Provedor deve possuir certificação de segurança relevante (SOC 2 Type II, ISO 27001) ou estar disposto a ser auditado. |

Após assinatura da DPA, arquivar uma cópia em local seguro (não no repositório git) e documentar o status no roadmap/auditoria.

---

## 8. Pontos fortes confirmados

- ✅ Senhas com bcrypt (12 rounds) e nunca retornadas pela API.
- ✅ JWT com revogação persistida e verificação de expiração/revogação a cada requisição.
- ✅ Autorização por posse de recurso consistente em todos os módulos.
- ✅ Validação de entrada com Zod (inclui validação de dígitos de CPF/CNPJ).
- ✅ ORM parametrizado (sem SQL injection) e React com escape padrão (sem XSS óbvio).
- ✅ Anti-enumeração de usuários no fluxo de recuperação de senha.
- ✅ Segredos fora do código, `.env` no `.gitignore`.

---

## 9. Referências

- OWASP Top 10:2025 — https://owasp.org/Top10/
- LGPD — Lei nº 13.709/2018
- ANPD — Autoridade Nacional de Proteção de Dados

---

## 10. Histórico de revisões

| Versão | Data | Autor | Mudança |
|--------|------|-------|---------|
| 1.0 | 2026-06-27 | Auditoria de Segurança | Versão inicial (Fase 0) |
| 1.1 | 2026-06-27 | Auditoria de Segurança | Fase 1 concluída (#01-#05): status, severidades e contadores atualizados para refletir as correções aplicadas (rate limiting, consentimento LGPD, Política de Privacidade/Termos, hash de token + expiração MOBILE, hardening CORS/Helmet/HTTPS). Corrigida inconsistência no achado A04 (CPF/CNPJ ainda pendente — não deveria ter sido marcado como Baixo). |
| 1.2 | 2026-06-27 | Auditoria de Segurança | #06 concluída (Fase 2): sessão WEB migrada de `localStorage` para cookie `httpOnly`/`Secure`/`SameSite=Lax` + CSRF via double-submit cookie; canal MOBILE inalterado. Achados A02/A07 atualizados (A07 rebaixado para 🟢 Baixo). Adicionado **#14** ao roadmap (refresh token para sessão WEB, fora do escopo da #06). |
| 1.3 | 2026-06-27 | Auditoria de Segurança | #07 concluída (Fase 2): CPF/CNPJ do usuário criptografados em repouso (AES-256-GCM) com blind index (HMAC-SHA256) preservando unicidade/busca; escopo restrito a `users.cpf`/`users.cnpj` (CNPJ da distribuidora e endereço da propriedade ficaram de fora, decisão registrada com o usuário). Achado A04 atualizado (CPF/CNPJ corrigido, mas permanece 🟡 Médio pelo gap residual do endereço). Adicionado **#15** ao roadmap (criptografia do endereço da propriedade). |
| 1.4 | 2026-06-27 | Auditoria de Segurança | #08 concluída (Fase 2, encerra a Fase 2): logger estruturado (pino) substitui todo `console.*`; nova tabela `audit_logs` registra login/logout (sucesso e falha), acessos negados (403, captura centralizada no `errorHandler`) e CRUD de `User`/`Property`. Achado A09 corrigido e rebaixado para 🟢 Baixo — zero achados 🟠 Alto/🔴 Crítico remanescentes. Adicionado **#16** ao roadmap (endpoint administrativo de consulta do audit log, bloqueado por depender de RBAC ainda inexistente). |
| 1.5 | 2026-06-28 | Auditoria de Segurança | #09 concluída (Fase 2, encerra de fato a Fase 2 — #06 a #09 todos ✅): endpoint `GET /api/users/me/data-export?format=json\|pdf` (Art. 18 LGPD) agrega perfil, properties, distribuidoras, áreas, dispositivos, alertas, histórico de consumo e audit log do titular. JSON sem corte/paginação (inclui `ConsumptionRecord` completo, decisão consciente apesar do volume); PDF gerado com PDFKit (sem Chromium) traz um resumo agregado de consumo por propriedade e a identidade visual do LumiTrack. Nova action `DATA_EXPORT` no enum `AuditAction` (migration aditiva). Achado Art. 18 corrigido de "⚠️ Parcial" para "✅ Implementado". |
| 1.6 | 2026-06-28 | Auditoria de Segurança | #10 concluída (abre a Fase 3): `RetentionPurgeScheduler` (mesmo padrão sem dependência nova do `HourlyRollupScheduler` já existente no módulo IoT) roda no boot e a cada 24h, removendo `AuthToken`/`PasswordReset` inativos há mais de 30 dias e `AuditLog` com mais de ~2 anos — remoção completa, não anonimização (decisão registrada com o usuário). Períodos configuráveis via novas variáveis `DATA_RETENTION_AUTH_TOKEN_DAYS`/`DATA_RETENTION_PASSWORD_RESET_DAYS`/`DATA_RETENTION_AUDIT_LOG_DAYS` (todas com default, nada obrigatório novo). Achado Art. 15/16 corrigido de "❌ Indefinida" para "✅ Implementado". |
| 1.7 | 2026-06-28 | Auditoria de Segurança | #11 concluída: pipeline GitHub Actions (`.github/workflows/ci.yml`) — typecheck/build/testes unitários e e2e (Playwright) de backend e frontend em todo PR/push para `main`, com `npm ci` (build reprodutível) em todos os jobs; `npm audit` bloqueia em high/critical (moderate só avisa, por causa da vuln moderada conhecida em devDependency do Prisma, sem fix não-breaking ainda); `.github/dependabot.yml` adicionado (npm backend+frontend, GitHub Actions, semanal). Achados A03 e A08 corrigidos e rebaixados para 🟢 Baixo. Lint do backend ficou fora do escopo, registrado como **#17** no roadmap. Tabela-resumo executiva (Seção 1) recalculada: 🟡 Médio caiu de 4 para 2 categorias, 🟢 Baixo subiu de 6 para 8. |
| 1.8 | 2026-06-29 | Auditoria de Segurança | #12 concluída: política de senha agora exige caractere especial (gap citado em A06); MFA opcional via TOTP (`otplib`) com QR code (`qrcode`) e 10 backup codes de uso único (bcrypt) — login em duas etapas (`mfaToken` stateless de 5min) quando habilitado, chave de cifra própria para o secret (`MFA_SECRET_ENCRYPTION_KEY`, separada de CPF/CNPJ). Escopo restrito ao backend (API completa e testada); UI do frontend registrada como **#18** no roadmap. Achados A06 e A07 atualizados — A06 rebaixado para 🟢 Baixo. Tabela-resumo executiva (Seção 1) recalculada: 🟡 Médio caiu de 2 para 1 categoria, 🟢 Baixo subiu de 8 para 9. |
| 2.0 | 2026-06-30 | Auditoria de Segurança | #14 concluída (Fase 3): refresh token para sessão WEB (A06) — token opaco (32 bytes, SHA-256), rotação a cada uso, detecção de reuso (revogação em cascata + `REFRESH_TOKEN_REUSE_DETECTED` no audit log), janela de graça de 5s para corrida entre abas, CSRF dedicado (`lumitrack_refresh_csrf`, path restrito `/api/auth`, maxAge 7d), expurgo automático pelo `RetentionPurgeScheduler`. Frontend: renovação proativa via timer em ~12min (`scheduleProactiveRefresh`) + interceptor de 401 com retry único (`ensureFreshSession` singleton) — resolve deslogamento abrupto e loop SSE silencioso. `jti: randomUUID()` adicionado ao payload JWT para garantir unicidade do hash mesmo com logins no mesmo segundo. Backend: 665/665 testes; Frontend: 1227/1227 testes. Achado A06 atualizado (~~Sem refresh token~~). |
| 1.9 | 2026-06-29 | Auditoria de Segurança | #13 concluída (Fase 3): runbook de resposta a incidentes em `docs/RUNBOOK_INCIDENTES.md` (novo arquivo versionado) — detecção/classificação (severidade, fontes de log), contenção (ações por tipo de incidente), avaliação de risco aos titulares (como usar `audit_logs` + export DSAR), notificação à ANPD/titulares (critérios, prazos, templates), registro e lições aprendidas. Seção 7.1 nova: checklist de requisitos de segurança para qualificar futuro operador SMTP (TLS obrigatório, retenção de logs, localização de processamento, notificação de incidente, revogação, subcontratadores, auditoria). Achado Art. 48 corrigido de "❌ Ausente" para "✅ Implementado"; achado Art. 37-39 rebaixado de "⚠️ Não confirmado" para "⚠️ Parcial" (checklist documentado, DPA pendente de assinatura quando provedor for selecionado). Nenhuma mudança de código — sub-issue 100% documental. |
| 2.1 | 2026-06-30 | Auditoria de Segurança | #15 concluída (Fase 3): criptografia do endereço da propriedade (A04/Art. 46) — AES-256-GCM com chave própria `ADDRESS_ENCRYPTION_KEY` (compartimentalizada de `CPF_CNPJ_ENCRYPTION_KEY` e `MFA_SECRET_ENCRYPTION_KEY`) para `address`, `city`, `state` e `zipCode`; sem blind index (endereço não tem `@unique` nem é filtro de query); nenhuma migration de schema; `PropertyRepository` é a única borda onde ocorre cifra/decifra — contrato de API e testes existentes inalterados; backfill idempotente via heurística try-decrypt. CI corrigido: `MFA_SECRET_ENCRYPTION_KEY` (faltava desde a #12) e `ADDRESS_ENCRYPTION_KEY` adicionados aos jobs `backend-test` e `e2e`. Achado A04 corrigido (🟢 Baixo — 0 achados 🟡 Médio remanescentes na auditoria). Achado Art. 46 corrigido de "⚠️ Parcial" para "✅ Implementado". Tabela-resumo executiva: 🟡 Médio → 0, 🟢 Baixo → 10. Backend: 675/675 testes; Frontend: 1227/1227 testes. |
| 2.2 | 2026-07-01 | Auditoria de Segurança | #17 concluída (Fase 3): ESLint no backend (qualidade/A03) — gap aberto desde a #11. `backend/eslint.config.js` (flat config) espelha o padrão já validado no frontend (`js.configs.recommended` + `tseslint.configs.recommended`, variante não type-aware, `globals.node`), com uma única regra de override (`no-unused-vars` ignorando prefixo `_`, convenção já usada no código, ex.: `_next` em assinatura de error handler do Express). Novo job `backend-lint` no CI, espelhando `frontend-lint`. O lint revelou 17 violações reais: a maioria mecânica (2 `require()` estilo CJS trocados por `import { createHash } from "node:crypto"`, 1 uso de `Number` maiúsculo trocado por `number`, 4 usos de `any` trocados por `Prisma.UserCreateInput`/`UserUpdateInput` e por `CreatePropertyInput["state"]`), mas uma foi um **bug real pré-existente**: em `server.ts`, o flush final do buffer IoT no shutdown gracioso (`await condição ? scheduler.flush() : Promise.resolve()`) nunca esperava de fato o `flush()` — a precedência do operador `await` fazia com que só a comparação numérica fosse aguardada, deixando a Promise do flush solta; reescrito como `if`/`await` explícito. Nenhuma mudança de comportamento de runtime além dessa correção. Backend: 675/675 testes. |
| 2.3 | 2026-07-02 | Auditoria de Segurança | #18 concluída (Fase 3, encerra a Fase 3 — só resta a #16, bloqueada por RBAC): UI de MFA no frontend (A06/A07) — gap aberto desde a #12 (API completa e testada, faltava a tela). Nova página `/seguranca` (`SecurityPage.tsx`, link no `UserMenu`) cobre setup (QR code + secret manual + confirmação TOTP), exibição única dos 10 backup codes e desativação (senha + código); segundo passo do login em `LoginPage.tsx` via componente compartilhado `MfaCodeForm` (login e setup usam o mesmo formato de campo — TOTP ou backup code). `AuthContext.login()` passou a retornar um `LoginResult` discriminado (`{mfaRequired,mfaToken}` ou `{user}`) em vez de autenticar direto — o caller decide se mostra o segundo passo; novos `completeMfaLogin()`/`refreshUser()` no contexto. Mutations via `@tanstack/react-query` (`useMfaMutations.ts`), mesmo padrão do resto do app. Achado A07 atualizado (~~UI do frontend pendente~~). Frontend: 1255/1255 testes (+28 em relação ao ciclo anterior). Verificação manual em browser real não foi possível neste ciclo — ambiente sem Chromium do Playwright instalável (download truncava repetidamente); typecheck, lint e suíte automatizada cobriram a mudança, mas o fluxo ponta a ponta (registrar → ativar 2FA → logout → login com código → desativar) não foi observado rodando de fato. |
