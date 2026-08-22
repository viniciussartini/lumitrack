# 07 — Decisões em Aberto

> **Pergunte antes de assumir qualquer item listado aqui.** Ao decidir: registre um ADR em `.claude/docs/adr/` (template `0000-template.md`) e **remova o item desta lista** — este arquivo contém apenas o que ainda está em aberto. Lista vazia é o estado saudável.

**O que entra aqui:** decisão que **bloqueia ou condiciona implementação** e ainda não foi tomada — normalmente uma feature que esbarrou numa escolha não feita.

**O que NÃO entra:** ideia de melhoria (vira issue), preferência sem impacto técnico, decisão já tomada (vira ADR) e tarefa (vira roadmap).

**Formato:** `- **{Assunto}:** opções consideradas · o que a decisão impacta · o que falta para decidir.`

## Em aberto

- **Provedor(es) OAuth:** Google · GitHub · nenhum (manter só credencial própria) · impacta o fluxo de cadastro e login, o modelo de `User` (conta federada vs. senha) e o consentimento LGPD do dado vindo do provedor · falta definir se o público-alvo ganha algo com login social. Hoje só existe login por e-mail/senha (+ MFA opcional).
- **App mobile:** existe · não existe · impacta a estratégia de token (a ADR-0002 já prevê o canal MOBILE com Bearer), o escopo da API e a stack de UI · falta decidir se haverá app. **Pendência concreta:** o `README.md` da raiz linka `mobile/README.md`, que não existe no repositório.
- **Lockout de conta:** bloquear login após N tentativas falhas consecutivas · manter só o rate limiter · impacta A07 (`05`) e o risco de DoS por bloqueio de conta alheia · falta escolher o critério (por conta, por IP+conta, backoff progressivo) e o canal de desbloqueio. **Gap conhecido:** hoje a única defesa é o rate limiter por IP+e-mail (ver ADR-0003).

## Resolvidas

Token storage (ADR-0002), método de MFA (ADR-0003), módulos de domínio do monólito (ADR-0004), design system do produto (ADR-0005), estratégia de migração para o Industry — incremental por fase do roadmap (ADR-0006) — bandeira tarifária a partir da fonte oficial da ANEEL (ADR-0007), **hospedagem e infra de produção (ADR-0008)**: tudo numa VM Oracle Cloud Always Free em São Paulo, com PostgreSQL e simulador IoT co-locados, sem nenhum operador estrangeiro (tem uma **condição de validade** — cadastro público fechado — e uma lista de gates de go-live; leia-a antes de publicar o ambiente) — **observabilidade de produção (ADR-0009)**: Uptime Kuma auto-hospedado (mesmo racional de zero operador estrangeiro da ADR-0008), com o custo aceito de não detectar a VM inteira fora do ar — **demo pública (ADR-0010)**: Render + Neon com escopo restrito a demonstração — e **separação de ambientes (ADR-0012, 2026-08-22)**: produção migra para VPS Hostinger em São Paulo (branch `main`, retoma a conclusão de conformidade da ADR-0008), Render+Neon é rebaixado a staging/integração (branch `staging`, continua público, mantém a exposição residual da ADR-0010).
