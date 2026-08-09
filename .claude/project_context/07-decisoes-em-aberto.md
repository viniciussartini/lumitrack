# 07 — Decisões em Aberto

> Pergunte antes de assumir qualquer um destes. Ao decidir: registre um ADR em `.claude/docs/adr/` (template `0000-template.md`) e **remova/atualize o item aqui** — este arquivo só contém o que ainda está em aberto.

- **Provedor(es) OAuth:** quais? (Google, GitHub, ...). Hoje só existe login por e-mail/senha (+ MFA opcional).
- **App mobile:** `README.md` da raiz linka `mobile/README.md`, que não existe — escopo e stack do mobile (se houver) ainda não decididos.
- **Lockout de conta:** bloquear login após N tentativas falhas consecutivas — hoje a única defesa é o rate limiter por IP+e-mail (gap conhecido, ver ADR-0003).

> Resolvidas: token storage (ADR-0002), método de MFA (ADR-0003), módulos de domínio do monólito (ADR-0004), design system do produto (ADR-0005), estratégia de migração para o Industry — incremental por fase do roadmap (ADR-0006) — **hospedagem e infra de produção (ADR-0008)**: tudo numa VM Oracle Cloud Always Free em São Paulo, com PostgreSQL e simulador IoT co-locados, sem nenhum operador estrangeiro (tem uma **condição de validade** — cadastro público fechado — e uma lista de gates de go-live; leia-a antes de publicar o ambiente) — e **observabilidade de produção (ADR-0009)**: Uptime Kuma auto-hospedado (mesmo racional de zero operador estrangeiro da ADR-0008), com o custo aceito de não detectar a VM inteira fora do ar.
