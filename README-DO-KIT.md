# Kit de Desenvolvimento `.claude/` — Como Usar

> Guia de onboarding do kit. O `CLAUDE.md` (raiz) é lido pelo Claude Code; **este arquivo é para você**.

## O que é

Um kit de contexto + skills para o Claude Code que garante que **todo** trabalho no projeto — scaffold, features, bugs, refatorações, auditorias — siga os mesmos padrões: OWASP Top 10:2025, LGPD, SOLID/clean code com trava anti-over-engineering, test-first onde se paga, UI/UX fiel ao design produzido no **Claude Design** (handoff bundle como fonte de verdade), e convenções de git de ponta a ponta.

## Estrutura

```
CLAUDE.md              ← lido automaticamente pelo Claude Code (regras + índice)
README-DO-KIT.md       ← este guia
.claude/
  project_context/     ← 01–10: o "quê" do projeto (descrição, requisitos,
                          arquitetura, stack, segurança, qualidade,
                          decisões em aberto, git, conformidade legal,
                          design system / UI-UX via Claude Design)
  design/              ← handoff bundles do Claude Design, um diretório
                          por tela/fluxo ({YYYY-MM-DD}-<tela>/)
  skills/              ← o "como": scaffold, planejar-roadmap, nova-feature,
                          refatoracao, correcao-bugs, preparar-pr, criar-issues
  agents/              ← 4 auditorias como subagents SOMENTE-LEITURA
                          (contexto isolado; retornam o laudo, não gravam)
  hooks/ + settings.json ← guard-rails determinísticos: bloqueiam
                          git commit/push, gh pr create/merge e acesso a .env*
  docs/                ← relatórios de auditoria + roadmap.md (vivo) + adr/
  log/CHANGELOG.md     ← histórico append-only de implementações
.github/
  ISSUE_TEMPLATE/      ← formulários de bug, feature e achado de auditoria
  PULL_REQUEST_TEMPLATE.md
  dependabot.yml       ← atualização automática de dependências (A03)
```

## Primeira utilização (projeto novo)

1. **Extraia o zip na raiz do repositório** (`CLAUDE.md`, `.claude/` e `.github/` ficam na raiz).
2. **Preencha o contexto** — os `[PREENCHER]` de `.claude/project_context/`:
   `01-descricao.md`, `02-requisitos.md` (RF/RNF/FNC), `03-arquitetura.md` (módulos) e revise `04-tech-stack.md`.
3. **Revise `07-decisoes-em-aberto.md`** — o que você já sabe responder, decida e registre como ADR.
4. **Crie as labels** — rode o bloco `gh label create` de `.claude/project_context/08-convencoes-git.md`.
5. **Conecte o Claude Design** (fonte de verdade da UI — ver `10-design-system.md`):
   - No terminal: `claude mcp add --scope user --transport http claude-design https://api.anthropic.com/v1/design/mcp` e, dentro do Claude Code, `/design-login` para autenticar.
   - No Claude Design: crie/abra o projeto de design; quando uma tela estiver pronta, **Export → Handoff to Claude Code → Send to local coding agent** e salve o bundle em `.claude/design/{YYYY-MM-DD}-<tela>/`.
   - Passo a passo completo, com verificação e troubleshooting: **[Apêndice — Conectar o Claude Code ao Claude Design](#apêndice--conectar-o-claude-code-ao-claude-design)**.
6. **Abra o Claude Code na raiz, em plan mode**, e peça: *"Vamos iniciar o projeto. Faça o scaffold seguindo o CLAUDE.md."*
7. **Revise o plano antes de aprovar** — é o seu checkpoint de arquitetura.
8. **Após o scaffold:** rode `/design-sync` (o Claude Design passa a desenhar com seus componentes e tokens reais); depois *"Monta o roadmap de implementação"* e *"Cria as issues da fase 1"* — seu backlog inicial nasce dos requisitos, já priorizado.

## Dia a dia

Descreva a tarefa naturalmente — a skill certa dispara sozinha:
- "Planeja a implementação / monta o roadmap" → `planejar-roadmap` (fases com fatias verticais, P0/P1/P2 e XS–XL; itens com UI dependem de design pronto; você aprova antes de gravar).
- "Implemente a feature de X" → `nova-feature` (test-first no domínio; **se tem UI, implementa a partir do handoff bundle** em `.claude/design/` — nunca improvisa layout; sem design para a tela → ela pergunta).
- **Fluxo de design:** desenhe/refine no Claude Design → Export → **Handoff to Claude Code → Send to local coding agent** → bundle em `.claude/design/{data}-<tela>/` → "Implemente a tela X" dispara `nova-feature`. Criou componente reutilizável novo? Rode `/design-sync` para fechar o ciclo (regras em `10-design-system.md`).
- "Está dando erro em Y" → `correcao-bugs` (reproduz com teste antes).
- "Refatora esse módulo" → `refatoracao` (preserva comportamento).
- "Faz uma auditoria de segurança/qualidade/desempenho/conformidade" → subagent auditor (somente-leitura) analisa em contexto isolado; a conversa principal salva o laudo datado em `.claude/docs/`.
- "Prepara o texto do PR" → `preparar-pr`.
- "Cria as issues desse relatório" / "abre uma issue pra esse bug" → `criar-issues` (rascunha o lote com as labels certas, **espera sua aprovação**, e só então executa `gh issue create`).

Toda skill de construção fecha com: entrada no `CHANGELOG.md` (com a branch) + texto de commit (Conventional Commits) para você commitar manualmente.

**Guard-rails ativos (hooks):** o agente está *mecanicamente impedido* de rodar `git commit`, `git push`, `gh pr create`, `gh pr merge` e de ler/editar arquivos `.env*` (exceto `.env.example`). Commits, pushes e PRs são sempre seus; `gh issue create` é permitido apenas via `criar-issues`, com sua aprovação. Requisito: **GitHub CLI (`gh`) autenticado** (`gh auth login`) para labels e issues.

## Ciclo completo de uso (exemplo)

0. **Planejar (pós-scaffold):** "Monta o roadmap de implementação" → `planejar-roadmap` lê os requisitos e propõe fases em fatias verticais, priorizadas por dependência + risco + valor; você aprova → `.claude/docs/roadmap.md`. Em seguida: "Cria as issues da fase 1" → `criar-issues` (Modo roadmap) abre o backlog inicial com labels e critérios de aceite. Ao concluir a fase: "Atualiza o roadmap" → replaneja a próxima com o que se aprendeu.
1. **Auditar:** "Faz uma auditoria de segurança" → o subagent (somente-leitura) varre o código em contexto isolado e devolve o laudo; a conversa principal salva em `.claude/docs/2026-XX-XX-seguranca-audit.md` e registra no changelog.
2. **Planejar:** "Cria as issues desse relatório" → `criar-issues` rascunha uma issue por achado (labels `origem: auditoria` + `tipo:` + `prioridade:` mapeada da severidade, com deduplicação), você aprova o lote, ela cria no GitHub.
3. **Executar:** para cada issue — "Corrige a issue #12" → `correcao-bugs`/`refatoracao`/`nova-feature` implementa nos padrões do kit e entrega o texto de commit (`fix: ... Closes #12`). Você commita.
4. **Entregar:** "Prepara o texto do PR" → `preparar-pr` resume a branch; você abre o PR e mescla.
5. **Repetir:** rode `auditoria-qualidade` periodicamente — ela também detecta drift entre o `project_context/` e o código real.

## Manutenção do kit

- **Padrões mudam num lugar só:** segurança no `05`, qualidade no `06`, legal no `09`, git no `08`, UI/UX no `10` — as skills referenciam, não duplicam.
- **Design system evolui nas duas pontas:** token/componente novo no código → `/design-sync`; tela nova no Claude Design → handoff bundle em `.claude/design/`. O Claude Design está em **beta** — se formato do bundle, rótulos de export ou comandos mudarem, atualize o `10` (fonte única) e o apêndice deste README.
- **Decisão tomada** → ADR em `.claude/docs/adr/` + remover do `07`.
- **Contexto é documentação viva:** a `auditoria-qualidade` verifica drift entre `project_context/` e o código real — rode-a periodicamente.

## Apêndice — Conectar o Claude Code ao Claude Design

Setup único da integração que torna o Claude Design a fonte de verdade de UI/UX (regras em `.claude/project_context/10-design-system.md`; decisão em `.claude/docs/adr/0001-...`).

### Pré-requisitos

- Claude Code instalado e autenticado no PC.
- Plano Pro, Max, Team ou Enterprise (Claude Design está em **beta**; disponível apenas em web e desktop).
- Kit já extraído na raiz do repositório.

### 1. Adicionar o MCP server

No terminal, em qualquer diretório:

```bash
claude mcp add --scope user --transport http claude-design https://api.anthropic.com/v1/design/mcp
```

`--scope user` vale para todos os seus projetos. O escopo local (padrão) carregaria o servidor só no projeto onde foi adicionado, exigindo repetir o comando em cada repositório.

> **Segurança:** use apenas esta URL oficial (`api.anthropic.com`). Existem MCP servers de terceiros com nome parecido que dirigem um Chrome real e chamam endpoints internos do claude.ai, expondo sua sessão logada — não são afiliados à Anthropic.

### 2. Autenticar

Dentro do Claude Code:

```
/design-login
```

Sem este passo o MCP não autentica.

### 3. Verificar

```bash
claude mcp list
```

`claude-design` deve aparecer como conectado. Falhas comuns: token ausente/expirado, erro de sintaxe em `~/.claude.json`, ou falha na inicialização do servidor.

### 4. Sincronizar o design system (código → design)

Na raiz do repositório, no Claude Code:

```
/design-sync
```

Importa o design system do codebase local (também aceita repo do GitHub, arquivos de design e uploads). O Claude passa a construir com os componentes reais e confere o próprio output contra eles.

> **Ordem importa:** em projeto novo, faça o **scaffold primeiro** (ele gera o tema Tailwind/shadcn) e só então rode `/design-sync` — sincronizar repo vazio não sincroniza nada.

### 5. Criar o projeto no Claude Design

Em claude.ai/design ou pela barra lateral do Claude Desktop. Fluxo: criar projeto → anexar/importar o design system → adicionar contexto (screenshots, codebase) → descrever o que construir → revisar no canvas → refinar (chat para mudanças estruturais, comentários inline para ajustes pontuais, edição direta no canvas para ajustes visuais) → exportar.

Duas práticas que reduzem retrabalho na implementação:
- **Cite componentes pelo nome** ("Use o componente Primary Button") — casa com o design system sincronizado.
- **Defina responsividade cedo** (mobile, tablet, desktop, ou só um) — responsividade não especificada vira "comportamento não especificado" e dispara a regra de divergência do `10`.

### 6. Handoff (design → código)

Botão **Export** (canto superior direito) → **Handoff to Claude Code** → **Send to local coding agent**.

Salve o bundle em `.claude/design/{YYYY-MM-DD}-<tela>/` e peça no Claude Code: *"Implemente a tela de X"*. A skill `nova-feature` lê o `10`, localiza o bundle vigente e implementa a partir da spec.

### 7. Fechar o ciclo

Criou componente reutilizável ou alterou token? Rode `/design-sync` novamente. É o que impede drift entre as duas pontas.

### Troubleshooting

| Sintoma | Contorno |
|---|---|
| Comentários inline somem antes de o Claude ler | Cole o feedback direto no chat |
| Lag/travamento com repositório grande | Sincronize via `/design-sync` a partir do Claude Code, em vez de linkar o repo pela web |
| "Chat upstream error" | Abra nova aba de chat dentro do mesmo projeto |
| `claude-design` não aparece em `claude mcp list` | Refaça o passo 1 e rode `/design-login`; confira `~/.claude.json` |

> **Uso:** a atividade de design consome do mesmo pool compartilhado com chat, Claude Code e Cowork — não há cota separada. Projetos com codebases grandes ou muitas iterações consomem mais.
