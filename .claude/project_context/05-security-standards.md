# 05 — Padrões de Segurança (OWASP Top 10:2025)

> Fonte única de **segurança técnica**, referenciada por todas as skills. Cada controle deve ser **verificável** (teste ou regra automatizada). Use bibliotecas maduras — não reinvente auth, cripto, nada.
>
> **Conformidade legal (LGPD, transferência internacional, direitos do titular, incidentes) vive em `09-conformidade-legal.md`.** Este arquivo cobre só os controles técnicos de segurança e a interseção *segurança × proteção de dados* (PII em log, criptografia).

## OWASP Top 10:2025

- **A01 — Broken Access Control:** authz server-side em toda rota; *deny by default*; checagem de ownership (previne IDOR); proteção SSRF (allowlist) em requisições saída-servidor.
- **A02 — Security Misconfiguration:** helmet, CORS restrito, sem stack trace ao usuário, sem credenciais default, config separada por ambiente.
- **A03 — Software Supply Chain:** lockfile fixo, `npm audit` no CI, Dependabot ativo (config entregue em `.github/dependabot.yml`), atenção a typosquatting.
- **A04 — Cryptographic Failures:** TLS em prod; senha com **argon2/bcrypt**; segredos via env/secret manager (nunca no código); criptografia em repouso para PII sensível.
- **A05 — Injection:** 100% das queries parametrizadas (Prisma); validação por schema (Zod) na borda; escape de output por contexto.
- **A06 — Insecure Design:** rate limiting em login/reset/OTP; modelagem de abuso além do happy path; decisões em ADR.
- **A07 — Authentication Failures:** auth via lib consolidada; sessão/token seguros; cookies `HttpOnly` + `Secure` + `SameSite`; invalidação no logout; MFA em ações sensíveis.
- **A08 — Software/Data Integrity:** validar payloads contra schema antes de processar; sem desserialização de dado não confiável.
- **A09 — Logging & Alerting:** logar eventos de auth; **nunca** logar dado sensível (senha, token, CPF); estrutura pronta para alertas.
- **A10 — Mishandling of Exceptional Conditions:** error handler central que **falha fechado**, mensagem genérica ao usuário, detalhe só no log interno.

## Segurança de Frontend (React)

- **Armazenamento de token** — decisão crítica (ver `07-decisoes-em-aberto.md`): `HttpOnly cookie` (preferido p/ refresh token, mitiga XSS) vs. memória/`localStorage`. Consistente com os cookies de A07.
- **CSP** configurada; evitar `dangerouslySetInnerHTML` (sanitizar se inevitável).
- Variáveis de ambiente do front sem segredos (só o que pode ser público).

## Proteção de PII em observabilidade (segurança × LGPD)

- **Sentry:** `beforeSend` para *scrubbar* PII (corpo de requisição, headers, dados do usuário) antes do envio.
- **pino:** redaction de campos sensíveis (senha, token, CPF, e-mail conforme o caso).
- A obrigação legal por trás disso está em `09-conformidade-legal.md` (A09 + minimização).

## Definition of Done — Segurança

- Negar por padrão. Validar no servidor. **Falhar fechado.**
- Nenhuma concatenação de input em query/comando.
- Nenhum segredo no código-fonte.
- Todo controle crítico (A01, A04, A05, A07, A10) tem teste/regra que **falha se o controle for removido**.
- PII fora dos logs e criptografada em repouso.
