# 10 — Design System & UI/UX (Claude Design)

> Fonte única de verdade da **interface**. A UI/UX deste projeto é definida no **Claude Design**; o código implementa a especificação — **nunca improvisa layout** quando existe design para a tela. Decisão registrada em `.claude/docs/adr/0001-claude-design-fonte-de-verdade-ui.md`.

## Fonte de design do projeto

- **Ferramenta:** **Claude Design** (ADR-0001). A entrevista de fonte de design do `scaffold-projeto` não se aplica — a decisão já está tomada.
- **Localização das entregas:** `.claude/design/{YYYY-MM-DD}-<escopo>/`, um diretório por export.
- **Autoridade sobre tokens:** os design tokens do handoff bundle têm autoridade sobre o tema Tailwind/shadcn. O design system do produto é o **Industry** (ADR-0005); `design-system/styles.css` do bundle é a fonte única de tokens e classes.

## Regras universais (independem da ferramenta)

**Especificação, não sugestão**

- Todo trabalho de UI parte de um **handoff bundle** do Claude Design (spec de componentes legível por máquina + design tokens + hierarquia de layout + assets).
- O bundle é **especificação**, não sugestão: componentes, hierarquia, espaçamentos e tokens do bundle têm autoridade sobre qualquer default de shadcn/Tailwind ou preferência estética do agente.
- Quando existe design para a tela, **não se improvisa layout** — nem "melhorando", nem simplificando.

**Tokens são contrato**

- Os **design tokens do bundle são a autoridade** sobre `tailwind.config` e o tema shadcn/ui: cores, tipografia, espaçamento, raio, sombras.
- **Proibido hardcodar** cor, espaçamento ou tipografia fora da escala de tokens (ex.: `#3B82F6`, `mt-[13px]`). Se o design pede um valor que não existe na escala, isso é uma decisão de token — atualizar o tema (e refletir no Claude Design via `/design-sync`), não driblar inline.
- Mudança de token é mudança de design system: registrar no changelog e, se relevante, comunicar de volta ao Claude Design.

**Versionamento**

- A entrega de design é versionada junto do código, com data no nome; as anteriores são histórico (mesma lógica append-only do changelog).
- Assets referenciados são copiados para o projeto conforme a convenção de assets do frontend — nunca referenciados de caminho externo.

**Sincronização nos dois sentidos**

Integração bidirecional com o Claude Code: handoff (design → código) e `/design-sync` (código → design). Componente ou token criado no código precisa voltar para a ferramenta de design; caso contrário, o próximo design nasce desalinhado com o que existe. Drift de design é drift de documentação (`06`) — mesma doença.

**Acessibilidade é requisito, não refinamento**

Alvo **WCAG 2.2 AA**: contraste, foco visível, navegação por teclado, rótulo associado a campo, `alt` significativo, ordem de leitura, `aria-live` em conteúdo dinâmico. Design que não especifica estados de foco e erro está incompleto — vale a regra de divergência.

## Localização e convenção dos bundles

- Bundles vivem em **`.claude/design/`**, um diretório por export: `.claude/design/{YYYY-MM-DD}-<escopo>/`. O escopo de um export do Claude Design pode ser **uma tela, um fluxo ou o produto inteiro** — nomeie o diretório pelo que ele de fato cobre (`...-login/`, `...-onboarding/`, `...-lumitrack-completo/`).
- **A estrutura interna do export é preservada como veio** — não reorganize nem renomeie arquivos dentro do bundle. Os protótipos referenciam `_ds/`, `support.js` e `uploads/` por caminho relativo; mexer na árvore quebra o rendering.
- Ao receber um novo bundle, o diretório antigo **não é apagado** — os anteriores são histórico. "O mais recente é o vigente" vale **por tela**, não por diretório: um export amplo posterior não invalida automaticamente o bundle mais recente de uma tela específica. Em caso de dúvida sobre qual bundle rege uma tela, consulte "Bundle vigente" abaixo.

## Bundle vigente

**`.claude/design/2026-07-31-lumitrack-completo/`** — export do produto inteiro, fidelidade **hifi** (cores, tipografia, espaçamentos, estados e microinterações são finais). Design system: **Industry** (ver ADR-0005).

| Tela | Arquivo em `design/` | Equivalente no código |
|---|---|---|
| Landing pública | `LumiTrack Landing.dc.html` | `pages/landing/LandingPage.tsx` |
| Login | `LumiTrack Login.dc.html` | `pages/auth/LoginPage.tsx` |
| Registro | `LumiTrack Registro.dc.html` | `pages/auth/RegisterPage.tsx` |
| Recuperar senha | `LumiTrack Recuperar Senha.dc.html` | `pages/auth/ForgotPasswordPage.tsx`, `pages/auth/ResetPasswordPage.tsx` |
| LGPD / privacidade | `LumiTrack LGPD.dc.html` | `pages/legal/` |
| App logado (dashboard, propriedades, alertas, distribuidoras, perfil, segurança/MFA, modais) | `LumiTrack Home.dc.html` | `pages/dashboard/`, `pages/property/`, `pages/alert/`, `pages/distributor/`, `pages/profile/`, `pages/settings/` |
| Chrome do app logado (sidebar, topbar) | `LumiTrack Home.dc.html` (linhas 61–148) | `components/layout/` — migrado na Fase 6 (#135, #136) |
| Login do simulador IoT | `LumiTrack IoT Login.dc.html` | — (não existe ainda; desde a Fase 13/#180 o perímetro do simulador é protegido por token estático, então uma tela de login é decisão de UX, não lacuna de segurança) |
| Dashboard do simulador IoT | `LumiTrack IoT Simulator.dc.html` | `iot-simulator/ui/` |

> Telas do código **sem** handoff no bundle: `pages/report/` (Relatórios), `pages/simulation/` (Simulações, hoje placeholder) e "Sobre o projeto" (`/sobre`) — as três caem na **regra de ausência** abaixo. As duas primeiras estão registradas como adiadas no `.claude/docs/roadmap.md`; a terceira foi entregue na Fase 6 como versão provisória, marcada com `TODO(design)` e aguardando um export dedicado.

- O `README.md` do bundle é a especificação: mapa de telas, tokens, vocabulário de classes (`.lt-*`), estado mínimo e comportamento esperado.
- `design-system/styles.css` é a **fonte única** de tokens e classes do Industry.
- Os `.dc.html` são protótipos autocontidos (markup = layout, `renderVals()` = dados mock, `<style>` = tokens locais) — **referência de design, não código de produção para copiar**. A implementação recria em React seguindo os padrões do codebase.
- Para abrir: `npx serve .claude/design/2026-07-31-lumitrack-completo/design`.

> **Estado da migração (atualizado em 2026-08-09):** a migração do frontend para o Industry está **concluída** — telas nas Fases 1–5, chrome do app autenticado (Sidebar, Header, AppShell) na Fase 6 e consistência das telas públicas na Fase 7. O tema anterior (âmbar/slate, dark mode por classe `.dark`) não existe mais; o dark mode é por `data-theme` e os tokens vêm de `frontend/src/styles/industry.css`. A decisão deixou de ser um item em aberto do `07` (ver ADR-0005 e ADR-0006). Trabalho de UI em tela já migrada segue o bundle direto, sem perguntar antes.
>
> **Escala tipográfica e de espaçamento (Fase 18, épico #334, issues #336-#340 e #353, 2026-08-30).** O `@theme` mapeia cor, fonte, raio e sombra desde a Fase 1. Tipografia: escala aditiva de 26 tokens (`--text-10` a `--text-44`, incluindo os passos de meio pixel que o bundle usa sistematicamente — 12.5, 13.5, 14.5...), levantada da união de `font-size` de todos os `.dc.html` do bundle vigente. Coexiste com a escala nomeada padrão do Tailwind (`text-xs`/`sm`/`lg`...), que o projeto já usa em 141 pontos sem correspondente no protótipo — não substituída. Espaçamento tem **duas camadas**, achado só percebido ao investigar a fundo: o multiplicador `--spacing: var(--space-1)` (Fase 1, 3.4px×N) cobre só os componentes de base do Industry (`.btn`/`.card`/`.dialog`) — o layout de página no bundle usa medida livre, sem grade (conferido nos 8 `.dc.html`: `gap:12px`, `padding:18px`... nenhum múltiplo de 3.4px, e isso não é dívida, é como o design é). Resolvido com uma segunda escala aditiva de 8 tokens de alta frequência (`--spacing-9/15/18/22/26/30/46/1200`, os únicos com 8+ ocorrências reais no código) — o resto (~31 valores, 1-4 usos cada) fica arbitrário por escolha, sem repetição que justifique nome. Também criados: `--color-status-live` (verde do indicador "ao vivo") e 7 tokens de bandeira tarifária sobre fundo escuro (`--color-flag-*`), já aplicados em `tariff-flag.types.ts`. **Estado final da aplicação:** 372→60 valores arbitrários (84% de redução), 44→34 arquivos, hex hardcoded 66→50 (17→~13 arquivos). O resto (espaçamento sem token) é exceção catalogada pro lint anti-regressão (item 7 da Fase 18, ainda não implementado). Tokens pré-Industry residuais: 13 arquivos (issue #342, ainda não feita).

## Regra de divergência (pergunte antes de assumir — mesma do `07`)

Se o bundle conflitar com um padrão do kit, **pare e pergunte** — não "corrija" o design silenciosamente nem viole o padrão. Conflitos típicos:

- **Acessibilidade/segurança:** contraste insuficiente, campo de senha sem `autocomplete` adequado, dado sensível exposto na UI (interseção com `05` e `09`).
- **Componente fora do stack:** o design implica biblioteca que não está no `04` (ex.: um chart) — decisão de stack, não de implementação.
- **Comportamento não especificado:** o design mostra o happy path mas não estados de erro/vazio/carregando/offline/permissão negada — proponha os estados seguindo o padrão visual do bundle e explicite a suposição.
- **Responsividade não definida:** quais breakpoints o design cobre e o que acontece fora deles.

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
