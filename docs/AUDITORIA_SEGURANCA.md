# Auditoria de Segurança — LumiTrack

> **Escopo:** OWASP Top 10:2025 + conformidade com a LGPD (Lei nº 13.709/2018)
> **Data da auditoria:** 2026-06-27
> **Versão do documento:** 1.0
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

**Principais riscos:**

| Severidade | Quantidade | Exemplos |
|------------|-----------|----------|
| 🔴 Crítico | 1 | Ausência de rate limiting na autenticação (brute force) |
| 🟠 Alto    | 5 | CPF/CNPJ e JWT em texto claro; sem consentimento LGPD; sem audit log; token mobile sem expiração; misconfig de CORS/Helmet/HTTPS |
| 🟡 Médio   | 3 | Vulns de dependência (dev); sem CI/CD com gates; política de senha fraca |
| 🟢 Baixo   | 3 | Injection (mitigado); RBAC raso; tratamento de exceções (mitigado) |

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
| A02 | Security Misconfiguration | Helmet com config padrão (sem CSP explícito); CORS lê `CORS_ORIGIN` do env sem guard contra `*`; sem enforce de HTTPS/HSTS na aplicação; backend sem `.env.example`. | 🟠 Alto |
| A03 | Software Supply Chain Failures | 3 vulns moderadas no backend (`@hono/node-server` via `@prisma/dev` — **dependência de desenvolvimento**, risco real reduzido); sem CI com auditoria automática; sem Dependabot. | 🟡 Médio |
| A04 | Cryptographic Failures | CPF/CNPJ e endereço em **texto claro**; ~~JWT armazenado em texto claro~~ **corrigido (#04)** — agora SHA-256. Senhas com bcrypt 12 (✅). | 🟢 Baixo (era 🟠 Alto) |
| A05 | Injection | Prisma parametrizado, sem `$queryRaw`; React escapa por padrão, sem `dangerouslySetInnerHTML` (✅). | 🟢 Baixo |
| A06 | Insecure Design | ~~Tokens MOBILE nunca expiram~~ **corrigido (#04)** — expiram após `MOBILE_TOKEN_EXPIRES_IN` (default 90d); sem refresh token; política de senha sem caractere especial; sem rate limit por design. | 🟡 Médio (era 🟠 Alto) |
| A07 | Authentication Failures | **Sem rate limiting / proteção brute-force** em `/login`, `/forgot-password`, `/reset-password`; sem lockout; sem MFA. Anti-enumeração no forgot-password (✅). | 🔴 Crítico |
| A08 | Software/Data Integrity Failures | Sem CI/CD; sem verificação de integridade de build; scripts de dependência não controlados. | 🟡 Médio |
| A09 | Logging & Alerting Failures | Apenas `console.*` (~35 ocorrências); **sem audit log** de login/logout, acessos negados (403) e CRUD de dados pessoais; sem logger estruturado nem alerta. | 🟠 Alto |
| A10 | Mishandling of Exceptional Conditions | Error handler global cobre Zod/AppError/500 e não vaza stack em produção (✅). Atenção: sem request-id correlacionável e sem handler central documentado de `unhandledRejection`. | 🟢 Baixo |

### 3.1 Detalhamento e evidências

- **A07 — Sem rate limiting (Crítico).** Os endpoints públicos de autenticação não
  possuem qualquer limitação de taxa. Evidência: [app.ts](../backend/src/app.ts)
  (cadeia de middlewares) e [auth.routes.ts](../backend/src/modules/auth/auth.routes.ts).
- **A04 — JWT em texto claro no banco — ✅ corrigido (#04).** O token agora é
  hasheado (SHA-256) antes de persistir em `auth_tokens.token`; o JWT puro nunca
  é gravado. Evidência: [hashToken.ts](../backend/src/shared/crypto/hashToken.ts),
  [auth.service.ts](../backend/src/modules/auth/auth.service.ts),
  [authenticate.ts](../backend/src/shared/middlewares/authenticate.ts).
- **A04 — CPF/CNPJ em texto claro.** Evidência:
  [schema.prisma:79-83](../backend/prisma/schema.prisma#L79-L83). Pendente — ver #07.
- **A06 — Token MOBILE sem expiração — ✅ corrigido (#04).** Tokens MOBILE agora
  expiram após `MOBILE_TOKEN_EXPIRES_IN` (default 90 dias), tanto no `exp` do
  JWT quanto no `expiresAt` persistido — verificado pelo middleware
  `authenticate.ts` a cada requisição. Evidência:
  [env.ts](../backend/src/config/env.ts), [auth.service.ts](../backend/src/modules/auth/auth.service.ts).
- **A02 — CORS/Helmet/HTTPS.** Evidência:
  [app.ts:35-39](../backend/src/app.ts#L35-L39), [env.ts:21](../backend/src/config/env.ts#L21).
- **A09 — Logging.** Uso de `console.error` no handler global e ausência de trilha
  de auditoria. Evidência: [errorHandler.ts:32](../backend/src/shared/middlewares/errorHandler.ts#L32).
- **Armazenamento de sessão no frontend.** JWT em `localStorage` (exposto a XSS).
  Evidência: [storage.ts](../frontend/src/lib/storage.ts),
  [api.ts:11-17](../frontend/src/services/api.ts#L11-L17).

---

## 4. Achados — Conformidade LGPD

| Art. LGPD | Requisito | Status | Ação |
|-----------|-----------|--------|------|
| Art. 7º/8º | Base legal / consentimento explícito | ✅ Implementado (#02) | Campo `consentedAt`/`consentVersion` no `User` + checkbox obrigatório no registro (backend e frontend) |
| Art. 9º | Transparência (Política de Privacidade e Termos) | ✅ Implementado (#03) | Documentos versionados em `frontend/src/legal/*.md`, renderizados em `/privacidade` e `/termos` |
| Art. 18 | Acesso e portabilidade | ⚠️ Parcial | Endpoint `GET /api/users/me/data-export` (JSON estruturado) |
| Art. 16/18 | Eliminação de dados | ✅ Implementado | `DELETE /api/users/:id` + cascade — manter e auditar |
| Art. 18 | Retificação | ✅ Implementado | `PUT /api/users/:id` — manter |
| Art. 46 | Segurança dos dados | ⚠️ Parcial | Cripto de CPF/CNPJ + audit log + hardening |
| Art. 15/16 | Retenção mínima | ❌ Indefinida | Política + job de expurgo |
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

### Fase 1 — Crítico (antes de produção)
- **#01** Rate limiting nos endpoints de autenticação (A07)
- **#02** Consentimento LGPD no cadastro (Art. 7º)
- **#03** Política de Privacidade e Termos de Uso (Art. 9º)
- **#04** ✅ Expiração de token MOBILE + hash do JWT no banco (A04/A06)
- **#05** Hardening de CORS/Helmet/HTTPS + `backend/.env.example` (A02)

### Fase 2 — Alto
- **#06** Sessão via httpOnly cookies + CSRF (A02/A07) — *decisão: migrar de localStorage*
- **#07** Criptografia de CPF/CNPJ + blind index (A04/Art. 46) — *decisão: AES-256-GCM + HMAC*
- **#08** Logger estruturado (pino) + audit log (A09/Art. 46)
- **#09** Exportação de dados do titular / DSAR (Art. 18)

### Fase 3 — Médio
- **#10** Retenção e expurgo de dados (Art. 15/16)
- **#11** CI/CD com gates de segurança (A03/A08)
- **#12** Política de senha forte + MFA opcional (A06/A07)
- **#13** DPA com operador SMTP + runbook de incidentes (Art. 37-39/48)

### Decisões de arquitetura
- **Sessão:** migração de `localStorage` → **httpOnly cookies** (Secure + SameSite) + CSRF.
- **CPF/CNPJ em repouso:** **AES-256-GCM na aplicação + blind index (HMAC-SHA256)**
  para preservar unicidade (`@unique`) e busca.

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
