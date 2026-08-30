# {NOME DO PROJETO} — Guia do Projeto (Claude Code)

> Carregado automaticamente em toda sessão do Claude Code. Define **como trabalhar** neste projeto e indexa o contexto e as skills.

## Como trabalhar aqui (sempre)

- **Plan mode para mudanças cross-cutting** (arquitetura, segurança, novos módulos): apresente um plano e **aguarde aprovação** antes de escrever ou editar arquivos.
- **Pergunte antes de assumir** qualquer item de `.claude/project_context/07-decisoes-em-aberto.md`. Decisão tomada → registre **ADR** em `.claude/docs/adr/` (template `0000-template.md`) e atualize o `07`.
- **Ao final de toda criação/alteração:** registre em `.claude/log/CHANGELOG.md` (append-only, com a **branch atual**) e **gere um texto de commit** (Conventional Commits) para o usuário commitar manualmente. Ver `.claude/project_context/08-convencoes-git.md`.

## Princípios inegociáveis (valem para todo código)

**Segurança**
- Negar por padrão. Validar no servidor. **Falhar fechado.**
- 100% das queries parametrizadas (Prisma) — nunca concatenar input do usuário.
- Nenhum segredo no código-fonte.
- PII nunca em log; criptografada em repouso.

**Qualidade**
- TypeScript strict; **proibido `any`** (usar `unknown` + narrowing).
- Direção de dependência: o domínio não importa framework/infra.
- **YAGNI e KISS têm precedência** — sem abstração especulativa. Proporcionalidade é decidida pelo contexto do projeto (equipe, criticidade, dado tratado), não por ritual.
- **Comentários são funcionais**: Javadoc/JSDoc em classes, funções públicas e lógica complexa. **Proibido comentário de rastreabilidade** (issue, PR, auditoria, achado, data, autor) — isso vive no git, nos ADRs, no CHANGELOG e nas issues (`06`).

**UI/UX**
- A interface vem da **fonte de design declarada no `10`** — **proibido inventar layout** quando existe design para a tela; sem design → pergunte.
- Design tokens são a autoridade sobre o tema do frontend — nada de cor/espaçamento hardcodado fora da escala.

> Detalhes completos em `.claude/project_context/05-security-standards.md` (segurança), `06-code-quality-standards.md` (qualidade) e `09-conformidade-legal.md` (LGPD/legislação BR). As skills referenciam esses arquivos — leia-os antes de implementar qualquer coisa que toque segurança, estrutura ou dados pessoais.

## Contexto do projeto (`.claude/project_context/`)

- `01-descricao.md` — o que é o projeto, problema, usuário-alvo.
- `02-requisitos.md` — RF / RNF / Funcionamento.
- `03-arquitetura.md` — princípios do kit (fronteiras, linguagem ubíqua, DIP), contratos entre módulos, consistência, cross-cutting e visão documentada. **Estilo arquitetural é decisão de projeto**, definida na entrevista do `scaffold-projeto` + ADR.
- `04-tech-stack.md` — stack do projeto, definida na entrevista do `scaffold-projeto` (traz uma referência de partida recomendada).
- `05-security-standards.md` — OWASP 2025 + segurança de frontend/observabilidade.
- `06-code-quality-standards.md` — SOLID, clean code, **comentários (Javadoc/JSDoc)**, eficiência, testes, enforcement.
- `07-decisoes-em-aberto.md` — decisões pendentes; pergunte antes de assumir. **Nasce vazio** — é populado pela entrevista do `scaffold-projeto` e por features que esbarrem em escolha não feita.
- `08-convencoes-git.md` — commits (Conventional Commits), branches (incl. `epic/`), labels de issues, **milestones (uma por fase do roadmap)**, changelog e convenções de PR. **O corpo do PR mora em `.github/PULL_REQUEST_TEMPLATE.md`** (fonte única).
- `09-conformidade-legal.md` — LGPD + legislação BR (bases legais, direitos, incidentes, transferência internacional).
- `10-design-system.md` — UI/UX: regras **universais** (spec é autoridade, tokens são contrato, divergência, ausência, WCAG 2.2 AA) + particularidades da ferramenta escolhida (Claude Design, Figma, Penpot, code-first).
- `11-seguranca-infraestrutura.md` — banco de dados, CI/CD, deploy e ciclo de vida de segredos; ASVS 5.0 como referência de profundidade (alvo L2). Lido pelo `scaffold-projeto` e pela `auditoria-seguranca`.
- `12-seguranca-por-tecnologia.md` — **catálogo de particularidades** (frontend, mobile, backend, estilos de API, **autenticação e credenciais — JWT, sessão, chaves de API, MFA, hash de senha, webhooks, OAuth2/OIDC**, ORMs, bancos, cache, infra, serverless, analytics, pagamentos, filas, CDN/WAF, APIs de LLM). **Leia só as seções do stack do `04`** — é consulta sob demanda, nunca leitura integral.

## Skills (`.claude/skills/`)

**Planejamento**
- `planejar-roadmap` — cria/atualiza o roadmap (`.claude/docs/roadmap.md`): fatias verticais, P0/P1/P2, XS–XL, e agrupamento das fases em **entregas (milestones)**.

**Construção**
- `scaffold-projeto` — **entrevista de fundação** (arquitetura → stack, com opções e trade-offs; preenche o `03` e o `04`, registra ADRs) e depois o setup do repositório greenfield.
- `nova-feature` — construir uma feature nova seguindo os padrões.
- `refatoracao` — refatorar preservando comportamento.
- `correcao-bugs` — corrigir bugs (muda o comportamento de errado para certo).

**Fluxo Git**
- `onboarding` — gera `.claude/docs/onboarding.md` (setup verificado, ordem de leitura, mapa dos módulos, armadilhas, primeira tarefa).
- `preparar-pr` — mapeia as alterações da branch, preenche o `.github/PULL_REQUEST_TEMPLATE.md` conforme o `08` e **cria o PR** pronto para revisão (exige branch publicada; push e merge continuam manuais).
- `criar-issues` — cria issues no GitHub (de um laudo de auditoria, da **fase atual do roadmap** ou avulsas). Decide entre **épico + sub-issues** (`gh issue create --parent`, exige gh ≥ 2.94.0) e issues individuais, e cria a **branch** (`epic/{N}-...` ou `{tipo}/{N}-...`). Todo corpo abre com `**Priority:** · **Size:**` (não são labels). **Sempre com aprovação em lote** antes de executar.

## Auditorias e revisão (subagents somente-leitura em `.claude/agents/`)

> **Laudo é entregue, não executado.** Ao receber o resultado de qualquer agente, **pare** — não aplique correções, nem as "óbvias", antes de perguntar ao usuário o que ele quer que entre.
>
> - **Auditorias:** grave o laudo em `.claude/docs/{YYYY-MM-DD}-{tipo}-audit.md` e informe o caminho.
> - **`revisao-codigo`:** **não grava arquivo**. O laudo é publicado como comentário no PR (pelo próprio agente) e **reproduzido por completo na conversa** — é ali que o usuário lê. Em seguida, pergunte o que corrigir.


- `auditoria-seguranca` — OWASP 2025 (segurança técnica).
- `auditoria-conformidade` — LGPD + legislação BR.
- `auditoria-qualidade` — SOLID / clean code / fronteiras / drift de documentação.
- `revisao-codigo` — revisa **o diff** de uma branch/PR contra os padrões do kit, separando **BLOQUEIA** de **SUGERE**. Lado revisor; a `preparar-pr` é o lado autor.
- `auditoria-desempenho` — queries, índices, bundle, render, complexidade.

Os auditores têm apenas Read/Grep/Glob (garantia mecânica de que auditoria **não corrige**) e **retornam o laudo como resultado** — eles não gravam arquivos.

**Protocolo pós-auditoria (executado pela conversa principal ao receber o laudo):**
1. Salvar o laudo **na íntegra** em `.claude/docs/{YYYY-MM-DD}-<tipo>-audit.md` (tipos: `seguranca`, `conformidade`, `qualidade`, `desempenho`).
2. Registrar em `.claude/log/CHANGELOG.md` (tipo `audit-<tipo>`, com a branch atual).
3. Gerar texto de commit: `docs: relatório de auditoria de <tipo> {DATA}`.
4. Ofereça abrir as issues dos achados via skill `criar-issues` (rascunho em lote → aprovação do usuário → `gh issue create` com as labels do `08`).

## Modelo e effort

Cada skill e subagente fixa `model` e `effort` no frontmatter, sobrescrevendo o nível da sessão. Auditorias rodam em **opus/high** (nenhum detalhe pode escapar); `scaffold-projeto` em **opus/xhigh** e `planejar-roadmap` em **opus/high** (decisões caras de reverter); implementação (`nova-feature`, `refatoracao`, `correcao-bugs`) em **sonnet/high**; `criar-issues` e `preparar-pr` em sonnet (medium e low); `onboarding` e `revisao-codigo` em opus/high. Tabela completa no `README-DO-KIT.md`.

## Guard-rails (hooks em `.claude/settings.json`)

Regras impostas deterministicamente, independentes de instrução:
- **`git commit` / `git push` / `gh pr merge` são bloqueados** — o usuário commita, faz push e mescla PRs manualmente; gere o texto do commit em vez de executar.
- **`gh pr create` é permitido**, via skill `preparar-pr`: ela exige a branch já publicada (o push continua seu) e cria o PR pronto para revisão. `gh issue create` é permitido via `criar-issues`, com aprovação.
- **Arquivos `.env*` são bloqueados** para leitura/edição (exceto `.env.example`) — segredos não passam pelo agente.
- **Criar branch é permitido** (`git checkout -b`): reversível e nada é publicado. A skill `criar-issues` cria a branch do épico/issue após aprovação.
- **Ativação de skills (`UserPromptSubmit`):** o hook `ativar-skills.sh` detecta palavras-gatilho no prompt e instrui explicitamente o uso da skill correspondente — a ativação automática por descrição é inconsistente. Se a instrução não fizer sentido para o pedido, ignore-a e siga normalmente.

Se um hook bloquear uma ação sua, siga a orientação da mensagem — não tente contornar.

## Convenções de pastas

- `.claude/docs/` — relatórios de auditoria datados (`YYYY-MM-DD-<tipo>-audit.md`), o roadmap vivo (`roadmap.md`) e ADRs em `.claude/docs/adr/` (numerados `0001-titulo.md`).
- `.claude/design/` — entregas de design versionadas, um diretório por tela/fluxo (`{YYYY-MM-DD}-<tela>/`); a mais recente é a vigente (ver `10-design-system.md`).
- `.claude/log/CHANGELOG.md` — histórico append-only de implementações.
- `.claude/hooks/` — `block-git-commit-push.sh`, `block-env-files.sh` e `ativar-skills.sh`, registrados em `.claude/settings.json`.
- `.github/` — templates de issue, `PULL_REQUEST_TEMPLATE.md` (**fonte única do corpo do PR**) e `dependabot.yml`.
