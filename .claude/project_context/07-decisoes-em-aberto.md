# 07 — Decisões em Aberto

> Pergunte antes de assumir qualquer um destes. Ao decidir: registre um ADR em `.claude/docs/adr/` (template `0000-template.md`) e **remova/atualize o item aqui** — este arquivo só contém o que ainda está em aberto.

- **Provedor(es) OAuth:** quais? (Google, GitHub, ...). Hoje só existe login por e-mail/senha (+ MFA opcional).
- **Hospedagem e infra de produção:** onde o backend, frontend e banco rodam (nenhuma config de Vercel/Railway/Neon ou equivalente existe no repositório hoje).
- **Observabilidade de produção:** rastreamento de erro/APM (ex.: Sentry) e monitor de uptime — hoje só há logging estruturado (pino) local/CI.
- **App mobile:** `README.md` da raiz linka `mobile/README.md`, que não existe — escopo e stack do mobile (se houver) ainda não decididos.
- **Lockout de conta:** bloquear login após N tentativas falhas consecutivas — hoje a única defesa é o rate limiter por IP+e-mail (gap conhecido, ver ADR-0003).

> Resolvidas nesta sessão: token storage (ADR-0002), método de MFA (ADR-0003) e módulos de domínio do monólito (ADR-0004).
