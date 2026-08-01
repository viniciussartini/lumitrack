# 10 — Design System & UI/UX (Claude Design)

> Fonte única de verdade da **interface**. A UI/UX deste projeto é definida no **Claude Design**; o código implementa a especificação — **nunca improvisa layout** quando existe design para a tela. Decisão registrada em `.claude/docs/adr/0001-claude-design-fonte-de-verdade-ui.md`.

## Regra central

- Todo trabalho de UI parte de um **handoff bundle** do Claude Design (spec de componentes legível por máquina + design tokens + hierarquia de layout + assets).
- O bundle é **especificação**, não sugestão: componentes, hierarquia, espaçamentos e tokens do bundle têm autoridade sobre qualquer default de shadcn/Tailwind ou preferência estética do agente.
- Integração bidirecional com o Claude Code: handoff (design → código) e `/design-sync` (código → design). Manter as duas pontas sincronizadas evita drift visual — mesmo princípio do drift de documentação (`06`).

## Localização e convenção dos bundles

- Bundles vivem em **`.claude/design/`**, um diretório por tela/fluxo: `.claude/design/{YYYY-MM-DD}-<tela-ou-fluxo>/`.
- Ao receber um novo bundle da mesma tela, o diretório antigo **não é apagado** — o mais recente (por data) é o vigente; os anteriores são histórico (mesma lógica append-only do changelog).
- Assets referenciados pelo bundle são copiados para o projeto conforme a convenção de assets do frontend — nunca referenciados de caminho externo.

## Tokens

- Os **design tokens do bundle são a autoridade** sobre `tailwind.config` e o tema shadcn/ui: cores, tipografia, espaçamento, raio, sombras.
- **Proibido hardcodar** cor, espaçamento ou tipografia fora da escala de tokens (ex.: `#3B82F6`, `mt-[13px]`). Se o design pede um valor que não existe na escala, isso é uma decisão de token — atualizar o tema (e refletir no Claude Design via `/design-sync`), não driblar inline.
- Mudança de token é mudança de design system: registrar no changelog e, se relevante, comunicar de volta ao Claude Design.

## Regra de divergência (pergunte antes de assumir — mesma do `07`)

Se o bundle conflitar com um padrão do kit, **pare e pergunte** — não "corrija" o design silenciosamente nem viole o padrão. Conflitos típicos:

- **Acessibilidade/segurança:** contraste insuficiente, campo de senha sem `autocomplete` adequado, dado sensível exposto na UI (interseção com `05` e `09`).
- **Componente fora do stack:** o design implica biblioteca que não está no `04` (ex.: um chart) — decisão de stack, não de implementação.
- **Comportamento não especificado:** o design mostra o happy path mas não estados de erro/vazio/carregando — proponha os estados seguindo o padrão visual do bundle e explicite a suposição.

## Regra de ausência

Se **não existe** bundle para a tela pedida:

1. Avise explicitamente ("não há design para esta tela em `.claude/design/`").
2. Pergunte: aguardar o handoff, ou implementar **versão utilitária provisória** (funcional, shadcn default, marcada com `// TODO(design): aguardando handoff — <tela>`)?
3. Versão provisória entra no changelog como tal — a `auditoria-qualidade` reporta `TODO(design)` remanescentes.

## Fluxo de trabalho (resumo)

1. **Design no Claude Design** → Export → **Handoff to Claude Code → Send to local coding agent** → bundle em `.claude/design/{data}-<tela>/`.
2. **Implementação** via skill `nova-feature` (checklist de Design) — a spec do bundle dirige componentes e layout; os padrões do kit (`05`, `06`, `09`) dirigem o código por trás.
3. **Após criar/alterar componentes reutilizáveis:** rodar `/design-sync` para que o Claude Design passe a desenhar com os componentes reais do codebase.

> **Nota de estágio:** o Claude Design está em **beta** (planos Pro, Max, Team e Enterprise; web e desktop apenas). Formato do bundle, rótulos de export e comandos podem mudar. Limitações conhecidas que afetam o fluxo: comentários inline podem sumir antes de serem lidos (contorno: colar o feedback no chat), repositórios muito grandes causam lag (contorno: sincronizar via `/design-sync` a partir do Claude Code), e "chat upstream error" se resolve abrindo nova aba de chat no mesmo projeto. Se a convenção deste arquivo divergir da ferramenta real, atualize **aqui** (fonte única) e registre no changelog.
