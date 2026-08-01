# 07 — Decisões em Aberto

> Pergunte antes de assumir qualquer um destes. Ao decidir: registre um ADR em `.claude/docs/adr/` (template `0000-template.md`) e **remova/atualize o item aqui** — este arquivo só contém o que ainda está em aberto.

- **Provedor(es) OAuth:** quais? (Google, GitHub, ...). Hoje só existe login por e-mail/senha (+ MFA opcional).
- **Hospedagem e infra de produção:** onde o backend, frontend e banco rodam (nenhuma config de Vercel/Railway/Neon ou equivalente existe no repositório hoje).
- **Observabilidade de produção:** rastreamento de erro/APM (ex.: Sentry) e monitor de uptime — hoje só há logging estruturado (pino) local/CI.
- **App mobile:** `README.md` da raiz linka `mobile/README.md`, que não existe — escopo e stack do mobile (se houver) ainda não decididos.
- **Lockout de conta:** bloquear login após N tentativas falhas consecutivas — hoje a única defesa é o rate limiter por IP+e-mail (gap conhecido, ver ADR-0003).
- **Estratégia de migração do frontend para o Industry (ADR-0005):** o design system foi adotado, mas o frontend em produção ainda usa o tema anterior. Em aberto: migração *big-bang* (um PR que troca tokens + dark mode + componentes de uma vez) vs. *incremental por tela* (convivência temporária dos dois temas); e o que fazer com a suíte E2E durante a transição, já que ela ancora seletores e textos das telas atuais. **Esta é a decisão que destrava o trabalho de UI** — enquanto não for tomada, tarefa de UI em tela existente pergunta antes.

> Resolvidas: token storage (ADR-0002), método de MFA (ADR-0003), módulos de domínio do monólito (ADR-0004) e design system do produto (ADR-0005).
