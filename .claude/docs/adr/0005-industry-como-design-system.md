# ADR-0005 — Industry como design system do LumiTrack

- **Data:** 2026-07-31
- **Status:** aceita
- **Branch/Issue relacionada:** —

## Contexto

A ADR-0001 estabeleceu o Claude Design como fonte de verdade de UI/UX, mas o projeto **não tinha design system definido**: o frontend nasceu com tokens ad-hoc em `frontend/src/index.css` (três tons de âmbar, três cores semânticas, neutros slate do Tailwind) escolhidos caso a caso, sem sistema por trás — sem escala tipográfica, sem escala de espaçamento própria, sem vocabulário de componentes. Enquanto `.claude/design/` estava vazio, toda tarefa de UI caía na "regra de ausência" do `10-design-system.md`, o que na prática travava o trabalho de interface.

O export do Claude Design de 2026-07-31 (`.claude/design/2026-07-31-lumitrack-completo/`) preenche essa lacuna: entrega 8 telas em fidelidade **hifi** sobre um design system completo — **Industry** (wireframe técnico: Barlow Condensed sobre Barlow, cantos retos, hairlines, cards como desenhos de linha com marcas de registro `+`, acento aço).

O problema é que o Industry **diverge do tema em produção em cinco eixos simultâneos**:

| | Frontend hoje (`frontend/src/index.css`) | Industry (bundle) |
|---|---|---|
| Fontes | `system-ui` (nenhuma custom) | Barlow Condensed + Barlow (Google Fonts) |
| Acento | âmbar `oklch(0.80 0.18 78)` | aço `#5980a6` |
| Cantos | arredondados (defaults Tailwind) | retos — `--radius-md: 4px`; "sem cantos arredondados" é regra do sistema |
| Dark mode | classe `.dark` no `<html>` | `data-theme="dark"` em `.lt-app` |
| Paradigma | utilitárias Tailwind 4 | classes de componente (`.btn`, `.card`, `.lt-*`) sobre CSS custom properties |

Não é um refinamento do tema atual — é substituição.

## Decisão

Vamos adotar o **Industry** como design system do LumiTrack. O `design-system/styles.css` do bundle vigente passa a ser a **autoridade sobre `frontend/src/index.css`**, conforme o princípio de tokens já estabelecido no `CLAUDE.md` e no `10-design-system.md` ("design tokens do bundle são a autoridade sobre o tema").

A adoção é **da decisão, não da migração**: esta ADR registra que o Industry é o alvo: nenhum código de frontend foi alterado ao registrá-la. A estratégia de migração (big-bang vs. incremental por tela, e o que fazer com a suíte E2E durante a transição) fica como item explícito em `07-decisoes-em-aberto.md`.

Enquanto a migração não acontece, vale a regra de transição: **trabalho de UI em tela que já existe no código pergunta antes** — implementar no Industry cria uma tela visualmente destoante do resto; implementar no tema antigo cria dívida contra uma decisão já tomada. A escolha é caso a caso e é do usuário.

## Alternativas consideradas

- **Manter o tema atual e usar o handoff só como referência de layout** — reintroduz exatamente o drift que a ADR-0001 existe para evitar: o design vira sugestão e a UI volta a ser acidente em vez de decisão.
- **Adotar só os tokens, sem o vocabulário de classes** — os protótipos são hifi e o resultado visual depende das classes de componente (`.btn`, `.card`, `.blueprint`, `.lt-*`) e das suas regras de composição; tokens sozinhos não reproduzem cards com marcas de registro nem os estados de foco/hover especificados.
- **Encomendar um novo design alinhado ao tema âmbar atual** — descartaria um export hifi completo e recém-produzido para preservar tokens que nunca foram uma decisão de design, apenas defaults de scaffold.

## Consequências

- **Positivas:** linguagem visual coerente e sistematizada (escalas de cor, tipografia, espaçamento e elevação derivadas, não improvisadas); contrato explícito com o Claude Design, que passa a desenhar telas novas já no sistema certo; `.claude/design/` deixa de estar vazio, destravando o trabalho de UI que a "regra de ausência" bloqueava.
- **Negativas/custos:** **o frontend em produção fica temporariamente divergente do design vigente** — estado conhecido e registrado, não drift acidental. A migração é trabalho não trivial: além de tokens, exige trocar o mecanismo de dark mode (`.dark` → `data-theme`) e reescrever os componentes de `frontend/src/components/ui/`, com **risco de regressão na suíte E2E**, que ancora seletores e textos das telas atuais. Adiciona também uma dependência de fontes externas (Google Fonts) que hoje não existe.
- **Escopo não coberto pelo bundle:** as telas de relatórios (`pages/report/`) e de área/dispositivo em detalhe não têm protótipo dedicado além do que está em `LumiTrack Home.dc.html` — quando forem trabalhadas, vale conferir se o bundle cobre o caso ou se falta handoff.
- Não resolve nenhum item de `07-decisoes-em-aberto.md` — ao contrário, **adiciona um** (a estratégia de migração).
