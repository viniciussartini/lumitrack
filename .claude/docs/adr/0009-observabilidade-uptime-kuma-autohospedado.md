# ADR-0009 — Observabilidade de produção: Uptime Kuma auto-hospedado

- **Data:** 2026-08-09
- **Status:** aceita
- **Branch/Issue relacionada:** issue #194, épico #187 (Fase 13.5, Bloco A)
- **Resolve:** o item "Observabilidade de produção" de `.claude/project_context/07-decisoes-em-aberto.md`

## Contexto

Até a Fase 13.5, o único observability existente é logging estruturado local (`pino`), sem APM, tracing nem monitor de uptime. A Fase 13.5 põe o sistema no ar numa VM sem nenhum monitoramento — subir sem saber que caiu é o oposto de "produto acessível", que é o objetivo declarado da fase.

**Restrição herdada da ADR-0008:** o sistema roda sem nenhum operador estrangeiro, para não reintroduzir transferência internacional de dados pessoais (LGPD Art. 33-36). Um APM ou agregador de log estrangeiro (Sentry, Datadog, etc.) processaria requisições reais (potencialmente com dado pessoal) em servidor fora do Brasil — exatamente o problema que a ADR-0008 eliminou. Um monitor de uptime externo (ex.: UptimeRobot) é uma categoria diferente — ele só faz `GET /health` de fora, sem receber dado pessoal nenhum — mas essa leitura de "não configura transferência internacional" é uma interpretação, não um fato estabelecido, e o item foi marcado como exigindo decisão explícita antes da fase entrar.

## Decisão

**Uptime Kuma auto-hospedado**, rodando como container (`louislam/uptime-kuma`) na própria VM, ao lado dos demais serviços do `docker-compose.yml`. Monitora `http://backend:3333/health` pela rede interna do compose. Painel administrativo **não exposto publicamente** — acesso só via túnel SSH (`ssh -L 3001:localhost:3001`). Notificação de incidente via bot do Telegram (gratuito, poucos passos) ou outro canal suportado pelo Kuma.

Mantém o raciocínio da ADR-0008 de forma literal: zero operador estrangeiro, zero interpretação jurídica nova a defender.

## Alternativas consideradas

- **Monitor externo gratuito (UptimeRobot, Better Stack, etc.)** — descartada por ora: detectaria a VM inteira fora do ar (o que o self-hosted não detecta), mas dependeria da leitura "ping em endpoint público não é transferência internacional" — leitura razoável, mas uma interpretação nova que a ADR-0008 não precisou fazer. Fica registrada como candidata a reavaliação se o gap de detecção abaixo se mostrar um problema real.
- **Sentry ou APM estrangeiro** — descartada diretamente pela ADR-0008: processaria request/trace data (potencialmente PII) em servidor fora do Brasil.
- **Sem observabilidade nenhuma** — descartada: o item é P1 e "cortável" segundo o roadmap, mas o custo de implementar é baixo (uma imagem Docker a mais) frente ao valor de saber que o sistema caiu.

## Consequências

- **Positivas:** zero operador estrangeiro adicional, zero custo, reaproveita a mesma infraestrutura Docker do resto do stack (issue #189), detecta o modo de falha mais provável — o processo `backend` caindo ou travando enquanto a VM continua de pé.
- **Negativas/custos aceitos:** **não detecta a VM inteira ficando inacessível** — se a VM cair, o Kuma cai junto e nenhum alerta dispara. Esse é um risco assumido explicitamente, não um esquecimento; documentado também em `.claude/docs/DEPLOY.md`. Reavaliar (ex.: complementar com um monitor externo) se o produto crescer além de portfólio ou se essa lacuna se mostrar um problema real na prática.
- Item resolvido em `.claude/project_context/07-decisoes-em-aberto.md` — a linha "Observabilidade de produção" sai da lista em aberto e entra nas resolvidas, apontando para esta ADR.
