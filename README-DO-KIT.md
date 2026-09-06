# Kit de Desenvolvimento `.claude/` — Como Usar

> Guia de onboarding do kit. O `CLAUDE.md` (raiz) é lido pelo Claude Code; **este arquivo é para você**.

**Versão do kit: v16.**

<details>
<summary>O que mudou desde a v3</summary>

- **v16** — **Priority e Size saem das labels** e passam a viver no corpo da issue, no mesmo formato do roadmap (`**Priority:** P0 · **Size:** M`) — labels de prioridade/tamanho removidas da taxonomia e do bootstrap; templates de issue ganham o campo. `revisao-codigo` **não grava arquivo de laudo**: publica comentário no PR aberto, devolve o laudo completo na conversa e pergunta o que corrigir antes de tocar em qualquer coisa.
- **v15** — correções vindas de uso real: `tipo:`+prioridade+tamanho passam a ser obrigatórios em toda issue; `no-warning-comments` no ESLint bloqueia comentário de rastreabilidade mecanicamente; `revisao-codigo` ganha **Bash restrito** (sem ele não havia diff para revisar) e é proibido de reconstruir o diff a partir do CHANGELOG; laudo de agente passa a ser **gravado em arquivo** e a conversa principal deve **parar** após entregá-lo.
- **v14** — correção: o hook `ativar-skills.sh` não tinha gatilho para **nenhum dos cinco agentes** (4 auditorias + `revisao-codigo` com rótulo errado) — adicionados. Desacoplamentos: **milestone vira entrega** (agrupa fases, não 1:1); `10` reescrito como **universal** com particularidades por ferramenta (Claude Design, Figma, Penpot, code-first); `07` **nasce vazio** (era pré-preenchido com decisões de outro projeto); `03` deixa de trazer "monólito modular" como decidido — vira decisão da entrevista + ADR — e ganha contratos entre módulos, consistência/transações, cross-cutting, visão C4, anti-corruption layer. Entrevista do scaffold ampliada (estratégia de credencial, MFA, OAuth, estilo arquitetural, ferramenta de design).
- **v13** — bloco **Autenticação e credenciais** no `12` (JWT com confusão de algoritmo e `kid`/`jku`, sessão server-side, chaves de API, MFA/TOTP, hash de senha, webhooks, OAuth2/OIDC reagrupado); seis tecnologias que acompanham o stack (serverless/edge, SDKs de analytics com **session replay**, pagamentos, filas, CDN/WAF, APIs de LLM); passo a passo **"Migrar de solo para equipe"**.
- **v12** — `05` reescrito como **universal** (sem React/Vite/Sentry no corpo das regras); novo `12-seguranca-por-tecnologia.md`, catálogo de particularidades de 25+ tecnologias lido **sob demanda** conforme o `04`, incluindo GraphQL, WebSocket, OAuth2/OIDC, containers, object storage e e-mail transacional.
- **v11** — kit passa a servir **solo e equipe**: campo `Modo` no `01` + marcadores `[EQUIPE]` nas regras que só se aplicam a times; nova skill `onboarding`; novo agente `revisao-codigo` (lado revisor, BLOQUEIA vs. SUGERE — em solo, substitui a revisão por pares); seção "Revisão de código (processo)" no `08`.
- **v10** — novo `11-seguranca-infraestrutura.md` (banco, CI/CD, deploy, segredos, com prioridades P0/P1/P2); `05` ganha hardening de runtime, rotação de refresh token e correções de frontend (`VITE_`, source maps, open redirect); **OWASP ASVS 5.0** adotado como referência de profundidade (**alvo L2**, L3 em auth/authz/pagamento/dado sensível); premissa de "MVP solo" substituída por calibragem de contexto — o kit assume uso **profissional, incluindo equipe**.
- **v9** — **milestones** vinculadas às fases do roadmap (`planejar-roadmap` declara, `criar-issues` cria e atribui); subtítulo do `08` desambiguado (controle de versão ≠ versão de release — SemVer fica fora enquanto não houver consumidor externo).
- **v8** — regra de **comentários** no `06` (Javadoc/JSDoc funcional; proibida referência a issue/PR/auditoria), com detecção na `auditoria-qualidade` e `eslint-plugin-jsdoc` no enforcement.
- **v7** — `.github/PULL_REQUEST_TEMPLATE.md` passa a ser a **fonte única** do corpo do PR (o `08` deixou de duplicá-lo); a `preparar-pr` lê o template explicitamente, porque `--body-file` o ignora.
- **v6** — `gh pr create` liberado no hook; `preparar-pr` **cria o PR** (push e merge seguem manuais).
- **v5** — `model` e `effort` fixados no frontmatter de todas as skills e subagentes.
- **v4** — hook `ativar-skills.sh` (`UserPromptSubmit`); `criar-issues` com **épicos, sub-issues e branch**; **entrevista de arquitetura e stack** no `scaffold-projeto` (o `03` e o `04` viraram `[PREENCHER]`).

</details>

## O que é

Um kit de contexto + skills para o Claude Code que garante que **todo** trabalho no projeto — scaffold, features, bugs, refatorações, auditorias — siga os mesmos padrões: OWASP Top 10:2025, LGPD, SOLID/clean code com trava anti-over-engineering, test-first onde se paga, UI/UX fiel ao design produzido no **Claude Design** (handoff bundle como fonte de verdade), e convenções de git de ponta a ponta.

## Estrutura

```
CLAUDE.md              ← lido automaticamente pelo Claude Code (regras + índice)
README-DO-KIT.md       ← este guia
.claude/
  project_context/     ← 01–12: o "quê" do projeto (descrição, requisitos,
                          arquitetura, stack, segurança de aplicação, qualidade,
                          decisões em aberto, git, conformidade legal,
                          design system / UI-UX, segurança de infraestrutura,
                          catálogo de segurança por tecnologia)
  design/              ← handoff bundles do Claude Design, um diretório
                          por tela/fluxo ({YYYY-MM-DD}-<tela>/)
  skills/              ← o "como": onboarding, scaffold-projeto (entrevista de arquitetura
                          + stack), planejar-roadmap, nova-feature, refatoracao,
                          correcao-bugs, criar-issues (épicos/sub-issues +
                          branch), preparar-pr (cria o PR)
  agents/              ← 4 auditorias como subagents SOMENTE-LEITURA
                          (contexto isolado; retornam o laudo, não gravam)
  hooks/ + settings.json ← guard-rails determinísticos: bloqueiam git
                          commit/push, gh pr merge e acesso a .env*;
                          + ativar-skills.sh (força a ativação das skills)
  docs/                ← relatórios de auditoria + roadmap.md (vivo) + adr/
  log/CHANGELOG.md     ← histórico append-only de implementações
.github/
  ISSUE_TEMPLATE/      ← formulários de bug, feature e achado de auditoria
  PULL_REQUEST_TEMPLATE.md ← FONTE ÚNICA do corpo do PR (preenchido
                          pela skill preparar-pr; o 08 guarda as convenções)
  dependabot.yml       ← atualização automática de dependências (A03)
```

## Primeira utilização (projeto novo)

1. **Extraia o zip na raiz do repositório** (`CLAUDE.md`, `.claude/` e `.github/` ficam na raiz).
2. **Preencha o contexto** — os `[PREENCHER]` de `.claude/project_context/`:
   `01-descricao.md` (incluindo o **modo**: solo ou equipe) e `02-requisitos.md` (RF/RNF/FNC). **Não preencha `03`, `04`, `07` nem a fonte de design do `10` à mão**: a entrevista do `scaffold-projeto` cobre arquitetura, stack, autenticação e ferramenta de design, preenche esses arquivos, registra ADRs e joga o indefinido no `07`.
3. **Revise `07-decisoes-em-aberto.md`** — o que você já sabe responder, decida e registre como ADR.
4. **Crie as labels** — rode o bloco `gh label create` de `.claude/project_context/08-convencoes-git.md`.
5. **Conecte o Claude Design** (fonte de verdade da UI — ver `10-design-system.md`):
   - No terminal: `claude mcp add --scope user --transport http claude-design https://api.anthropic.com/v1/design/mcp` e, dentro do Claude Code, `/design-login` para autenticar.
   - No Claude Design: crie/abra o projeto de design; quando uma tela estiver pronta, **Export → Handoff to Claude Code → Send to local coding agent** e salve o bundle em `.claude/design/{YYYY-MM-DD}-<tela>/`.
   - Passo a passo completo, com verificação e troubleshooting: **[Apêndice — Conectar o Claude Code ao Claude Design](#apêndice--conectar-o-claude-code-ao-claude-design)**.
6. **Abra o Claude Code na raiz, em plan mode**, e peça: *"Vamos iniciar o projeto. Faça o scaffold seguindo o CLAUDE.md."* A skill começa pela **entrevista de fundação**: arquitetura (módulos, forma da aplicação, integrações, atores, dados sensíveis) e só depois a stack, camada por camada, com recomendação + alternativas + trade-offs. Decisões estruturantes viram ADR; o que ficar indefinido vai para o `07`.
7. **Revise o plano antes de aprovar** — é o seu checkpoint de arquitetura.
8. **Após o scaffold:** rode `/design-sync` (o Claude Design passa a desenhar com seus componentes e tokens reais); depois *"Monta o roadmap de implementação"* e *"Cria as issues da fase 1"* — seu backlog inicial nasce dos requisitos, já priorizado.

## Dia a dia

Descreva a tarefa naturalmente — a skill certa dispara sozinha:
- "Planeja a implementação / monta o roadmap" → `planejar-roadmap` (fases com fatias verticais, P0/P1/P2 e XS–XL; itens com UI dependem de design pronto; as fases são agrupadas em **entregas/milestones**; você aprova antes de gravar).
- "Cria as issues do relatório/da fase" → `criar-issues`: analisa se o conjunto vira **épico + sub-issues** (3+ itens que só entregam valor juntos, contexto compartilhado, 1 PR faz sentido) ou **issues individuais** (o default), rascunha o lote com o agrupamento proposto, e após sua aprovação cria a **milestone da entrega** (Modo roadmap), as issues (com `**Priority:** · **Size:**` no corpo) e a **branch** (`epic/{N}-...` ou `{tipo}/{N}-...`).
- "Implemente a feature de X" → `nova-feature` (test-first no domínio; **se tem UI, implementa a partir do handoff bundle** em `.claude/design/` — nunca improvisa layout; sem design para a tela → ela pergunta).
- **Fluxo de design:** desenhe/refine no Claude Design → Export → **Handoff to Claude Code → Send to local coding agent** → bundle em `.claude/design/{data}-<tela>/` → "Implemente a tela X" dispara `nova-feature`. Criou componente reutilizável novo? Rode `/design-sync` para fechar o ciclo (regras em `10-design-system.md`).
- "Está dando erro em Y" → `correcao-bugs` (reproduz com teste antes).
- "Refatora esse módulo" → `refatoracao` (preserva comportamento).
- "Faz uma auditoria de segurança/qualidade/desempenho/conformidade" → subagent auditor (somente-leitura) analisa em contexto isolado; a conversa principal salva o laudo datado em `.claude/docs/`.
- "Revisa esse PR" / "code review" → `revisao-codigo` (lê só o diff, separa **BLOQUEIA** de **SUGERE**; em equipe é o passe anterior ao revisor humano, em solo é a própria revisão).
- "Onboarding" / "guia para novo dev" → `onboarding` (gera `.claude/docs/onboarding.md`; serve também para retomar projeto parado).
- "Prepara o PR" / "cria o PR" → `preparar-pr`: verifica se a branch está publicada, preenche o `.github/PULL_REQUEST_TEMPLATE.md` seguindo as convenções do `08` e **cria o PR** pronto para revisão (`Closes #N` derivado do nome da branch). Push e merge continuam seus.

Toda skill de construção fecha com: entrada no `CHANGELOG.md` (com a branch) + texto de commit (Conventional Commits) para você commitar manualmente.

**Guard-rails ativos (hooks):** o agente está *mecanicamente impedido* de rodar `git commit`, `git push`, `gh pr merge` e de ler/editar arquivos `.env*` (exceto `.env.example`). Commits, pushes e merges são sempre seus; **`gh pr create` é permitido** via `preparar-pr` (a branch precisa estar publicada — o push continua manual); `gh issue create` é permitido apenas via `criar-issues`, com sua aprovação. **Criar branch é permitido** (`git checkout -b` é reversível e não publica nada) — a `criar-issues` cria a branch do épico/issue depois que você aprova. Requisitos: **GitHub CLI (`gh`) autenticado** (`gh auth login`); para sub-issues nativas, **gh ≥ 2.94.0**.

**Ativação das skills (hook `ativar-skills.sh`):** a ativação automática por descrição é inconsistente na prática — o Claude Code nem sempre reconhece que existe uma skill para o pedido. O hook `UserPromptSubmit` detecta palavras-gatilho no seu prompt ("planeja a implementação", "cria as issues", "tem um bug"…) e instrui explicitamente o uso da skill. Você continua podendo invocar por `/nome-da-skill`. Cobre as 8 skills e os 5 agentes. Para ajustar os gatilhos, edite as regexes em `.claude/hooks/ativar-skills.sh`; para desligar, remova o bloco `UserPromptSubmit` de `.claude/settings.json`. *Skills são carregadas no início da sessão — se você editar uma skill no meio da conversa, reinicie a sessão.*

## Ciclo completo de uso (exemplo)

0. **Planejar (pós-scaffold):** "Monta o roadmap de implementação" → `planejar-roadmap` lê os requisitos e propõe fases em fatias verticais, priorizadas por dependência + risco + valor; você aprova → `.claude/docs/roadmap.md`. Em seguida: "Cria as issues da fase 1" → `criar-issues` (Modo roadmap) abre o backlog inicial com labels e critérios de aceite. Ao concluir a fase: "Atualiza o roadmap" → replaneja a próxima com o que se aprendeu.
1. **Auditar:** "Faz uma auditoria de segurança" → o subagent (somente-leitura) varre o código em contexto isolado e devolve o laudo; a conversa principal salva em `.claude/docs/2026-XX-XX-seguranca-audit.md` e registra no changelog.
2. **Planejar:** "Cria as issues desse relatório" → `criar-issues` rascunha uma issue por achado (labels `origem: auditoria` + `tipo:`, com `**Priority:** · **Size:**` no corpo — Priority mapeada da severidade — e deduplicação), você aprova o lote, ela cria no GitHub.
3. **Executar:** para cada issue — "Corrige a issue #12" → `correcao-bugs`/`refatoracao`/`nova-feature` implementa nos padrões do kit e entrega o texto de commit (`fix: ... Closes #12`). Você commita.
4. **Entregar:** *"Revisa a branch"* → `revisao-codigo` (resolva os BLOQUEIA) → `git push -u origin <branch>` → *"Prepara o PR"* → `preparar-pr` **cria o PR**; você (ou o revisor, em equipe) aprova e mescla no GitHub.
5. **Repetir:** rode `auditoria-qualidade` periodicamente — ela também detecta drift entre o `project_context/` e o código real.

## Modelo e effort por skill/agente

Cada skill e subagente declara `model` e `effort` no próprio frontmatter, **sobrescrevendo o nível da sessão** (mas não a variável de ambiente). O critério é o **custo do erro**: onde um deslize vira vulnerabilidade ou dívida arquitetural, paga-se Opus + effort alto; onde o output é texto estruturado a partir de material pronto, um modelo menor entrega igual.

| Skill / Agente | model | effort | Por quê |
|---|---|---|---|
| `auditoria-seguranca` | opus | high | Falso negativo vira CVE em produção. |
| `auditoria-conformidade` | opus | high | LGPD exige correlacionar código, fluxo de dados e base legal. |
| `auditoria-qualidade` | opus | high | Nenhum detalhe pode escapar na revisão de arquitetura e code smells. |
| `auditoria-desempenho` | opus | high | Gargalo não detectado só aparece com o sistema em carga. |
| `scaffold-projeto` | opus | xhigh | Entrevista de arquitetura + stack: decisões caras de reverter. |
| `planejar-roadmap` | opus | max | Erro de sequenciamento contamina o backlog inteiro. |
| `nova-feature` | sonnet | high | Implementação real, com effort alto para respeitar os padrões do kit. |
| `refatoracao` | sonnet | high | Preservar comportamento exige raciocínio, não só reescrita. |
| `correcao-bugs` | sonnet | high | Diagnóstico costuma ser localizado; effort alto cobre bugs difíceis. |
| `revisao-codigo` | opus | high | Revisão é o último filtro antes do merge — falso negativo entra em produção. |
| `onboarding` | opus | xhigh | Sintetiza onze context files em um caminho sequencial e verificável. |
| `criar-issues` | sonnet | medium | Transforma material pronto (laudo/roadmap) em issues. |
| `preparar-pr` | sonnet | medium | Lê diff, monta a descrição e cria o PR; executa `gh` com pré-condições a verificar. |

**Mental model:** o *modelo* são os pesos fixos (saber mais); o *effort* é quanto trabalho o Claude faz no pedido (tentar mais).

**Para ajustar:** edite `model:`/`effort:` no frontmatter do arquivo. Campo escrito errado **falha silenciosamente** — rode uma vez e confira o cabeçalho da sessão, que mostra o effort ativo ao lado do nome do modelo (ex.: "with low effort"). Valores de effort disponíveis variam por modelo; confirme no `/model`.

## Migrar de solo para equipe

Passo a passo para quando o projeto que você começou sozinho passa a ter mais gente. A ordem importa: **primeiro feche o que estava aberto por não haver ninguém olhando**, depois abra o acesso.

### Antes de a primeira pessoa entrar

1. **Vire a chave do modo.** Em `.claude/project_context/01-descricao.md`, mude `Modo: solo` para `equipe` e preencha a composição (quem faz o quê, quem revisa o quê). Isso ativa todas as regras `[EQUIPE]` do kit de uma vez.
2. **Rotacione tudo.** Segredos criados quando só você tinha acesso não têm dono nem histórico. Rotacione antes de compartilhar, monte o inventário do `11` (o que existe, onde vive, quem acessa, última rotação) e mova para um cofre — `.env` no seu computador não escala para duas pessoas.
3. **Feche a `main` de verdade.** PR obrigatório, **revisão obrigatória por outra pessoa**, status checks obrigatórios, sem force-push. Em solo você dependia de disciplina; agora é bloqueio mecânico (`11`, P1).
4. **Crie o `CODEOWNERS`** para os caminhos sensíveis: autenticação, autorização, migrações, pipeline, configuração de segurança. É o que garante que a pessoa certa veja a mudança certa.
5. **Ative secret scanning e push protection** se ainda não estiverem ligados — o risco de segredo commitado cresce com o número de pessoas.
6. **Rode a `auditoria-seguranca` e a `auditoria-qualidade`.** Você quer descobrir a dívida antes que outra pessoa a descubra por acidente — e o laudo vira backlog inicial compartilhado.
7. **Verifique se o contexto reflete a realidade.** Coisas que você "sabia de cabeça" precisam estar escritas: `03` (módulos reais), `04` (stack real), `07` (decisões em aberto), ADRs das escolhas que só existem na sua memória. Contexto desatualizado desinforma o recém-chegado e o agente.

### Quando a pessoa entra

8. **Rode a skill `onboarding`** e revise o documento gerado. Ele já sai com a seção `[EQUIPE]` de "quem é quem", que não existia no modo solo.
9. **Acompanhe o primeiro setup** com o documento aberto: tudo que a pessoa precisar perguntar é lacuna a corrigir ali, na hora. Essa é a única forma confiável de validar o onboarding.
10. **Dê acesso com menor privilégio** (repositório, plataformas de deploy, banco, cofre), com MFA obrigatório e sem conta compartilhada (`11`).
11. **Primeira tarefa pequena, ponta a ponta** — uma issue XS/S que atravesse uma fatia vertical fina. O objetivo é exercitar o fluxo completo (issue → branch → PR → revisão → merge), não entregar valor.

### Nas primeiras semanas

12. **Revise os primeiros PRs com atenção desproporcional** — é quando as convenções são aprendidas ou perdidas. Use o `revisao-codigo` como primeiro passe e reserve sua atenção para modelagem e decisão.
13. **Combine o processo de revisão** (`08`): o que bloqueia, o que é sugestão, e o acordo de que divergência não resolvida em duas rodadas vira conversa ou ADR.
14. **Transfira a autoria das decisões.** Se toda decisão continuar passando por você, o gargalo apenas mudou de lugar: deixe a próxima ADR ser escrita por outra pessoa.
15. **Prepare o offboarding desde já** (`11`): saída de alguém exige remover acessos e **rotacionar os segredos que a pessoa conhecia**.

> **Voltando a solo?** Inverta o modo no `01`, rotacione os segredos de quem saiu e mantenha o `revisao-codigo` obrigatório antes do merge — sem ele, você fica sem nenhuma camada de revisão.

## Manutenção do kit

- **Modelo/effort mudam no frontmatter** do próprio arquivo da skill/agente; a tabela do README é documentação, não configuração — se alterar um, alinhe o outro.
- **Corpo do PR mora em `.github/PULL_REQUEST_TEMPLATE.md`** (fonte única): o `08` guarda as convenções (título, `Closes #N`, labels) e a skill preenche o template — `gh pr create --body-file` ignora o template do repo, por isso a leitura é explícita na skill.
- **Comentários:** regra completa (Javadoc/JSDoc obrigatório em contratos públicos e lógica complexa; proibida referência a issue/PR/auditoria) vive na seção "Comentários e documentação de código" do `06` — a `auditoria-qualidade` detecta as violações.
- **Segurança tem três camadas:** princípio universal no `05`, infraestrutura no `11`, particularidade de tecnologia no `12`. Regra que vale para todo stack **nunca** entra no `12`; armadilha específica **nunca** entra no `05`.
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
