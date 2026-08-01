# ADR-0002 — Token storage: cookie `HttpOnly` (WEB) + Bearer (MOBILE)

- **Data:** 2026-07-31
- **Status:** aceita
- **Branch/Issue relacionada:** sub-issues #06 (cookies seguros) e #14 (refresh token WEB), ver `.claude/docs/AUDITORIA_SEGURANCA.md`

## Contexto

O item estava aberto em `07-decisoes-em-aberto.md` desde a criação do kit, mas já foi decidido e implementado durante a remediação OWASP/LGPD do projeto — este ADR só registra formalmente uma decisão que o código já expressa. A dúvida original era onde guardar o token de sessão no canal WEB (cookie `HttpOnly` vs. `localStorage`/memória), decisão que impacta toda a superfície de ataque de XSS/CSRF da aplicação.

## Decisão

Vamos usar **dois esquemas de token por canal**:

- **Canal WEB:** cookie de sessão `HttpOnly` + `Secure` (produção) + `SameSite=Lax`, com CSRF via double-submit cookie (`backend/src/shared/security/csrf.ts`). Sessão de 15 minutos (`JWT_WEB_EXPIRES_IN`), renovada por um **refresh token opaco** (32 bytes aleatórios, nunca um JWT), armazenado como hash SHA-256 no banco, **rotacionado a cada uso** e com detecção de reuso (sinal de roubo — `RefreshToken.replacedByTokenId`).
- **Canal MOBILE:** Bearer token de longa duração (`MOBILE_TOKEN_EXPIRES_IN`, default 90 dias), sem refresh — adequado a um app que não tem o mesmo risco de XSS de uma SPA.

Em nenhum canal o token fica legível por JavaScript no cliente; o frontend decide estado de autenticação por resposta de API (`frontend/src/lib/authState.ts`), não por leitura de cookie/token.

## Alternativas consideradas

- **`localStorage`/memória no frontend** — exposto a XSS (qualquer script injetado lê o token); descartado porque o canal WEB é o mais exposto a esse vetor.
- **JWT também como refresh token** — decodificável e stateless demais para revogação/rotação; trocado por um token opaco validado só por lookup no banco (`AuthRepository`), que permite revogação imediata e detecção de reuso.

## Consequências

- Positivas: mitigação de XSS no canal WEB (token nunca acessível a JS); rotação + detecção de reuso do refresh token reduz o impacto de um vazamento; CSRF coberto pelo double-submit cookie.
- Negativas/custos: exige coordenação de CORS/cookie entre frontend e backend (domínios/`SameSite`); complexidade adicional de rotação de refresh token (uma tabela, um índice, uma lógica de encadeamento) frente a um JWT simples.
- Veio de `07-decisoes-em-aberto.md` — item removido de lá.
