# ADR-0001 — Claude Design como fonte de verdade de UI/UX

- **Data:** 2026-07-16
- **Status:** aceita
- **Branch/Issue relacionada:** —

## Contexto

O kit garantia padrões para arquitetura, segurança, qualidade e conformidade, mas **não definia uma fonte de verdade para a interface**. Sem isso, as skills de construção (`nova-feature`, `scaffold-projeto`) improvisavam layout com defaults de shadcn/Tailwind, gerando inconsistência visual e retrabalho — o mesmo tipo de drift já combatido em documentação e código. Requisito real: o design da aplicação é produzido no Claude Design e deve ser implementado com fidelidade.

## Decisão

Vamos usar o **Claude Design** como fonte única de verdade de UI/UX. A implementação parte do **handoff bundle** (spec de componentes + tokens + hierarquia + assets), versionado em `.claude/design/`, com sincronização reversa via `/design-sync`. Regras operacionais em `.claude/project_context/10-design-system.md`.

## Alternativas consideradas

- **Deixar o agente improvisar com shadcn/Tailwind** — inconsistência visual entre features; design deixa de ser decisão e vira acidente.
- **Implementar a partir de screenshots** — tradução lossy: sem tokens, sem hierarquia de componentes, sem assets.
- **Figma + Dev Mode/Zeplin** — ferramenta adicional fora do ecossistema; handoff historicamente com perda e sem round-trip com o codebase.

## Consequências

- Positivas: UI consistente e fiel ao design; tokens como contrato (sem hardcode); ciclo bidirecional (o design passa a usar os componentes reais do código); UI/UX ganha o mesmo tratamento de single source of truth do resto do kit.
- Negativas/custos: dependência de produto em **beta** (formato do bundle, rótulos de export e comandos podem mudar → `10` precisa acompanhar; limitações conhecidas documentadas lá); consumo de uso compartilhado com o Claude Code (sessões de design são pesadas em tokens); disciplina extra de manter `.claude/design/` e rodar `/design-sync`.
- Não veio de `07-decisoes-em-aberto.md` — decisão nova, sem item a remover.
