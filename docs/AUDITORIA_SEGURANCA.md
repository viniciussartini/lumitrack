# Auditoria de Segurança — LumiTrack

> **Escopo:** OWASP Top 10:2025 + conformidade com a LGPD (Lei nº 13.709/2018)
> **Data da auditoria:** 2026-06-27
> **Versão do documento:** 1.6
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

**Estado atual (pós #01/#02/#04/#05/#06/#07/#08 — ver Seção 3 e `IMPLEMENTATION_LOG.md`):**

| Severidade | Quantidade | Categorias |
|------------|-----------|----------|
| 🔴 Crítico | 0 | — |
| 🟠 Alto    | 0 | — |
| 🟡 Médio   | 4 | A03, A04 (endereço da propriedade ainda em texto claro — ver #15), A06, A08 |
| 🟢 Baixo   | 6 | A01, A02, A05, A07, A09, A10 |

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
| A03 | Software Supply Chain Failures | 3 vulns moderadas no backend (`@hono/node-server` via `@prisma/dev` — **dependência de desenvolvimento**, risco real reduzido); sem CI com auditoria automática; sem Dependabot. | 🟡 Médio |
| A04 | Cryptographic Failures | ~~CPF/CNPJ em texto claro~~ **corrigido (#07)** — AES-256-GCM + blind index (HMAC-SHA256) para preservar unicidade/busca. Endereço da propriedade **ainda em texto claro** (gap residual, ver #15 no roadmap — a #07 foi escopada apenas a CPF/CNPJ, decisão registrada com o usuário). ~~JWT armazenado em texto claro~~ **corrigido (#04)** — agora SHA-256. Senhas com bcrypt 12 (✅). | 🟡 Médio (era 🟠 Alto) |
| A05 | Injection | Prisma parametrizado, sem `$queryRaw`; React escapa por padrão, sem `dangerouslySetInnerHTML` (✅). | 🟢 Baixo |
| A06 | Insecure Design | ~~Tokens MOBILE nunca expiram~~ **corrigido (#04)** — expiram após `MOBILE_TOKEN_EXPIRES_IN` (default 90d); sem refresh token; política de senha sem caractere especial; sem rate limit por design. | 🟡 Médio (era 🟠 Alto) |
| A07 | Authentication Failures | ~~Sem rate limiting / proteção brute-force~~ **corrigido (#01)** — limiter global por IP + limiter estrito por IP+e-mail em `/login`, `/forgot-password`, `/reset-password`. ~~Sem proteção CSRF na sessão WEB~~ **corrigido (#06)** — double-submit cookie. Ainda sem lockout de conta e sem MFA (gaps menores, não bloqueantes). Anti-enumeração no forgot-password (✅). | 🟢 Baixo (era 🔴 Crítico) |
| A08 | Software/Data Integrity Failures | Sem CI/CD; sem verificação de integridade de build; scripts de dependência não controlados. | 🟡 Médio |
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
  Pendente (ver #15 no roadmap): endereço da propriedade ainda em texto claro
  — fora do escopo desta sub-issue.
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
  Pendente (fora do escopo desta sub-issue, ver #14 no roadmap): refresh
  token — o JWT WEB continua expirando em 15min sem renovação automática.

---

## 4. Achados — Conformidade LGPD

| Art. LGPD | Requisito | Status | Ação |
|-----------|-----------|--------|------|
| Art. 7º/8º | Base legal / consentimento explícito | ✅ Implementado (#02) | Campo `consentedAt`/`consentVersion` no `User` + checkbox obrigatório no registro (backend e frontend) |
| Art. 9º | Transparência (Política de Privacidade e Termos) | ✅ Implementado (#03) | Documentos versionados em `frontend/src/legal/*.md`, renderizados em `/privacidade` e `/termos` |
| Art. 18 | Acesso e portabilidade | ✅ Implementado (#09) | Endpoint `GET /api/users/me/data-export?format=json\|pdf` — JSON traz perfil, properties, distribuidoras, áreas, dispositivos, alertas, histórico de consumo completo (sem corte) e audit log do titular; PDF traz o mesmo conteúdo com resumo agregado de consumo (não a lista bruta) e identidade visual do LumiTrack |
| Art. 16/18 | Eliminação de dados | ✅ Implementado | `DELETE /api/users/:id` + cascade — manter e auditar |
| Art. 18 | Retificação | ✅ Implementado | `PUT /api/users/:id` — manter |
| Art. 46 | Segurança dos dados | ⚠️ Parcial | ~~Cripto de CPF/CNPJ~~ ✅ (#07); hardening ✅ (#02/#05/#06); ~~audit log~~ ✅ (#08); falta cripto do endereço (#15) |
| Art. 15/16 | Retenção mínima | ✅ Implementado (#10) | `RetentionPurgeScheduler` (roda no boot + 1x/dia) remove `AuthToken`/`PasswordReset` inativos há 30 dias e `AuditLog` com mais de ~2 anos; períodos configuráveis via `DATA_RETENTION_*` |
| Art. 37-39 | Operadores (DPA com SMTP) | ⚠️ Não confirmado | Documentar provedor e DPA |
| Art. 48 | Resposta a incidentes | ❌ Ausente | Runbook (Seção 7) |

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
- **#11** CI/CD com gates de segurança (A03/A08)
- **#12** Política de senha forte + MFA opcional (A06/A07)
- **#13** DPA com operador SMTP + runbook de incidentes (Art. 37-39/48)
- **#14** Refresh token para sessão WEB (A06) — gap conhecido desde a #06
  (JWT WEB expira em 15min sem renovação automática); fora do escopo da #06
  por introduzir superfície de ataque própria (rotação/roubo de refresh
  token) que merece análise de segurança dedicada
- **#15** Criptografia do endereço da propriedade (A04) — gap conhecido desde
  a #07 (o achado original mencionava CPF/CNPJ **e** endereço; a #07 foi
  escopada apenas a CPF/CNPJ, decisão registrada com o usuário); endereço
  geográfico é dado pessoal sob a LGPD e continua em texto claro
- **#16** Endpoint administrativo para consulta do audit log (A09/Art. 48) —
  hoje a tabela `audit_logs` só é consultável via acesso direto ao banco
  (Prisma Studio/SQL); um endpoint HTTP dedicado depende de RBAC real
  (papel admin), que não existe ainda (ver A01 — `userType` não é RBAC) —
  bloqueado até essa base existir

### Decisões de arquitetura
- **Sessão:** migração de `localStorage` → **httpOnly cookies** (Secure + SameSite) + CSRF.
- **CPF/CNPJ em repouso:** **AES-256-GCM na aplicação + blind index (HMAC-SHA256)**
  para preservar unicidade (`@unique`) e busca. ✅ Implementado (#07).

---

## 7. Runbook de resposta a incidentes (LGPD Art. 48)

> *A ser detalhado na sub-issue #13.* Estrutura mínima prevista:
> 1. Detecção e classificação do incidente.
> 2. Contenção e erradicação.
> 3. Avaliação de risco aos titulares.
> 4. Notificação à ANPD e aos titulares quando houver risco relevante.
> 5. Registro e lições aprendidas.

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
