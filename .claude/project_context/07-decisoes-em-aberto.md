# 07 — Decisões em Aberto

> Pergunte antes de assumir qualquer um destes. Ao decidir: registre um ADR em `.claude/docs/adr/` (template `0000-template.md`) e **remova/atualize o item aqui** — este arquivo só contém o que ainda está em aberto.

- **Provedor(es) OAuth:** quais? (Google, GitHub, ...). Hoje só existe login por e-mail/senha (+ MFA opcional).
- **Observabilidade de produção:** rastreamento de erro/APM (ex.: Sentry) e monitor de uptime — hoje só há logging estruturado (pino) local/CI. **Restrição nova (ADR-0008):** adotar um APM/agregador de log estrangeiro reintroduziria a transferência internacional que a decisão de hospedagem eliminou — a escolha precisa considerar região Brasil/UE ou solução auto-hospedada, senão volta a exigir SCC.
- **App mobile:** `README.md` da raiz linka `mobile/README.md`, que não existe — escopo e stack do mobile (se houver) ainda não decididos.
- **Lockout de conta:** bloquear login após N tentativas falhas consecutivas — hoje a única defesa é o rate limiter por IP+e-mail (gap conhecido, ver ADR-0003).

> Resolvidas: token storage (ADR-0002), método de MFA (ADR-0003), módulos de domínio do monólito (ADR-0004), design system do produto (ADR-0005), estratégia de migração para o Industry — incremental por fase do roadmap (ADR-0006) — e **hospedagem e infra de produção (ADR-0008)**: tudo numa VM Oracle Cloud Always Free em São Paulo, com PostgreSQL e simulador IoT co-locados, sem nenhum operador estrangeiro. A ADR-0008 tem uma **condição de validade** (cadastro público fechado) e uma lista de gates de go-live — leia-a antes de publicar o ambiente.
