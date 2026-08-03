# ADR-0006 — Migração para o Industry incremental por fase do roadmap

- **Data:** 2026-08-01
- **Status:** aceita
- **Branch/Issue relacionada:** épico #94 (Fase 1)

## Contexto

A ADR-0005 adotou o Industry como design system do LumiTrack, mas deixou em aberto (`07-decisoes-em-aberto.md`) a estratégia de migração do frontend em produção — que ainda usava o tema anterior (âmbar, Tailwind puro, dark mode via `.dark`) — para o novo sistema: *big-bang* (um PR que troca tudo de uma vez) vs. *incremental por tela* (convivência temporária dos dois temas), e o que fazer com a suíte E2E durante a transição.

A Fase 1 do roadmap (`.claude/docs/roadmap.md`) já executou essa migração de forma incremental, fase a fase — fundação de tokens, componentes base e as 3 telas de autenticação — sem que a decisão tivesse sido formalizada antes. O resultado (épico #94, mergeado) validou a estratégia na prática: cada fase entrega um conjunto coeso de telas já no Industry, a suíte E2E é reescrita junto (não à parte, não depois), e o app convive com telas em dois temas durante a transição sem que isso trave o desenvolvimento — a "regra de transição" da ADR-0005 (perguntar antes de tocar tela existente) cobriu exatamente esse período.

## Decisão

A migração do frontend para o Industry acontece **incremental por fase do roadmap**, não em um único PR. Cada fase migra um conjunto vertical de telas (não um tipo de componente isolado) e reescreve, na mesma fase, os specs E2E que aquele conjunto de telas ancora — como já ocorreu na Fase 1 e como a Fase 2 (hierarquia do consumidor + LGPD) continua fazendo.

## Alternativas consideradas

- **Big-bang** — um único PR trocando tokens, dark mode e todos os componentes de uma vez: descartada porque o volume de telas (app inteiro) tornaria o PR irrevisável e de alto risco, sem checkpoint intermediário caso algo saia errado.
- **Migrar componentes por tipo, não por tela** (ex.: todos os botões do app primeiro, depois todos os formulários) — descartada porque não entrega uma tela coesa e testável ao final de cada etapa; a Fase 1 mostrou que fatiar por tela/fluxo (o mesmo princípio de fatiamento vertical do roadmap) produz unidades de trabalho verificáveis de ponta a ponta.

## Consequências

- **Positivas:** cada fase é uma unidade de entrega e verificação independente (build/lint/test/E2E fecham por fase, como documentado no CHANGELOG da Fase 1); risco de regressão fica contido à fase em andamento; a convivência dos dois temas durante a transição é um estado conhecido e temporário, não drift.
- **Negativas/custos:** o frontend fica visualmente inconsistente (dois temas simultâneos) durante toda a duração do roadmap (5 fases); cada fase que toca tela existente carrega o custo de perguntar antes (regra da ADR-0005), o que essa ADR não remove — só formaliza que esse custo é aceito fase a fase, não de uma vez.
- Resolve o item "Estratégia de migração do frontend para o Industry (ADR-0005)" de `07-decisoes-em-aberto.md` — **removido/movido para "Resolvidas"**.
