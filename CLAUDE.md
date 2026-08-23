# LumiTrack — Guia do Projeto (Claude Code)

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
- **YAGNI e KISS têm precedência** — sem abstração especulativa. Proporcionalidade é decidida pelo contexto do projeto (ver a calibragem no `06`), não por ritual.
- **Comentários são funcionais**: Javadoc/JSDoc em classes, funções públicas e lógica complexa. **Proibido comentário de rastreabilidade** (issue, PR, auditoria, achado, data, autor) — isso vive no git, nos ADRs, no CHANGELOG e nas issues (`06`).

**UI/UX**
- A interface vem do **handoff do Claude Design** (`.claude/design/`) — **proibido inventar layout** quando existe design para a tela; sem design → pergunte (regras em `10-design-system.md`).
- Design tokens do bundle são a autoridade sobre o tema Tailwind/shadcn — nada de cor/espaçamento hardcodado fora da escala.

> Detalhes completos em `.claude/project_context/05-security-standards.md` (segurança de aplicação), `06-code-quality-standards.md` (qualidade), `09-conformidade-legal.md` (LGPD/legislação BR) e `11-seguranca-infraestrutura.md` (banco, CI/CD, deploy, segredos). As skills referenciam esses arquivos — leia-os antes de implementar qualquer coisa que toque segurança, estrutura ou dados pessoais.

## Contexto do projeto (`.claude/project_context/`)

- `01-descricao.md` — o que é o projeto, problema, usuário-alvo, **modo de trabalho** (solo).
- `02-requisitos.md` — RF / RNF / Funcionamento.
- `03-arquitetura.md` — princípios do kit (fronteiras, linguagem ubíqua, DIP, contratos entre módulos, consistência, cross-cutting, visão documentada) + a arquitetura real do LumiTrack: monorepo, monólito modular por domínio, 16 módulos, `shared/`, posse e autorização, ADRs.
- `04-tech-stack.md` — stack decidido, o que está de fato em `package.json`, os dois caminhos de deploy e as ADRs que os fixam.
- `05-security-standards.md` — OWASP 2025 + hardening de runtime + segurança de cliente + PII/observabilidade. **ASVS 5.0 como profundidade de referência (alvo L2).**
- `06-code-quality-standards.md` — SOLID, clean code, **comentários (Javadoc/JSDoc)**, eficiência, testes, enforcement.
- `07-decisoes-em-aberto.md` — decisões pendentes; pergunte antes de assumir.
- `08-convencoes-git.md` — commits (Conventional Commits), branches (incl. `epic/`), labels de issues, **milestones (por entrega, não por fase)**, changelog, revisão de código e convenções de PR. **O corpo do PR mora em `.github/PULL_REQUEST_TEMPLATE.md`** (fonte única).
- `09-conformidade-legal.md` — LGPD + legislação BR (bases legais, direitos, incidentes, transferência internacional).
- `10-design-system.md` — UI/UX via Claude Design: regras universais (spec é autoridade, tokens são contrato, divergência, ausência, WCAG 2.2 AA), bundle vigente, estado da migração para o Industry e `/design-sync`.
- `11-seguranca-infraestrutura.md` — banco de dados, CI/CD, deploy e ciclo de vida de segredos; ASVS 5.0 como referência de profundidade (alvo L2). Lido pela `auditoria-seguranca` e por qualquer mudança que toque migração, pipeline, ambiente ou segredo.
- `12-seguranca-por-tecnologia.md` — **catálogo de particularidades** por tecnologia. **Leia só as seções do stack do `04`** — é consulta sob demanda, nunca leitura integral. Para este projeto: React, Express, REST, WebSocket/SSE, JWT, MFA/TOTP, hash de senha, Prisma, PostgreSQL, containers e e-mail transacional.

## Skills (`.claude/skills/`)

**Planejamento**
- `planejar-roadmap` — cria/atualiza o roadmap (`.claude/docs/roadmap.md`): fatias verticais, P0/P1/P2, XS–XL, e agrupamento das fases em **entregas (milestones)**.

**Construção**
- `scaffold-projeto` — setup de repositório greenfield. **Não se aplica a este projeto** (não é greenfield; `03` e `04` já estão preenchidos e a entrevista de fundação não roda).
- `nova-feature` — construir uma feature nova seguindo os padrões.
- `refatoracao` — refatorar preservando comportamento.
- `correcao-bugs` — corrigir bugs (muda o comportamento de errado para certo).

**Fluxo Git**
- `onboarding` — gera `.claude/docs/onboarding.md` (setup verificado, ordem de leitura, mapa dos módulos, armadilhas, primeira tarefa). Em modo solo, serve como guia de retomada.
- `preparar-pr` — mapeia as alterações da branch, preenche o `.github/PULL_REQUEST_TEMPLATE.md` conforme o `08` e **cria o PR** pronto para revisão (exige branch publicada; push e merge continuam manuais).
- `criar-issues` — cria issues no GitHub (de um laudo de auditoria, da **fase atual do roadmap** ou avulsas). Decide entre **épico + sub-issues** (`gh issue create --parent`, exige gh ≥ 2.94.0) e issues individuais, e cria a **branch** (`epic/{N}-...` ou `{tipo}/{N}-...`). **Sempre com aprovação em lote** antes de executar.

## Auditorias e revisão (subagents somente-leitura em `.claude/agents/`)

- `auditoria-seguranca` — OWASP 2025 + ASVS L2, incluindo infraestrutura (`11`) e particularidades do stack (`12`).
- `auditoria-conformidade` — LGPD + legislação BR.
- `auditoria-qualidade` — SOLID / clean code / fronteiras / comentários / drift de documentação.
- `auditoria-desempenho` — queries, índices, bundle, render, complexidade.
- `revisao-codigo` — revisa **o diff** de uma branch/PR contra os padrões do kit, separando **BLOQUEIA** de **SUGERE**. Lado revisor; a `preparar-pr` é o lado autor. **Em modo solo, é a única camada de revisão antes do merge** — rodar não é formalidade.

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
- **`gh pr create` é permitido**, via skill `preparar-pr`: ela exige a branch já publicada (o push continua do usuário) e cria o PR pronto para revisão. `gh issue create` é permitido via `criar-issues`, com aprovação.
- **Arquivos `.env*` são bloqueados** para leitura/edição (exceto `.env.example`) — segredos não passam pelo agente.
- **Criar branch é permitido** (`git checkout -b`): reversível e nada é publicado. A skill `criar-issues` cria a branch do épico/issue após aprovação.
- **Ativação de skills (`UserPromptSubmit`):** o hook `ativar-skills.sh` detecta palavras-gatilho no prompt e instrui explicitamente o uso da skill correspondente — a ativação automática por descrição é inconsistente. Se a instrução não fizer sentido para o pedido, ignore-a e siga normalmente.

Se um hook bloquear uma ação sua, siga a orientação da mensagem — não tente contornar.

## Convenções de pastas

- **Monorepo:** `backend/` (Express + Prisma + PostgreSQL), `frontend/` (React + Vite) e `iot-simulator/` (server + ui) são pacotes independentes, cada um com seu próprio `package.json`, lint e testes — ver `03-arquitetura.md`.
- `docker-compose.yml` (raiz) + `deploy/` — infraestrutura de go-live (Fase 13.5): orquestração Docker Compose, `Caddyfile`, scripts de provisionamento/backup/seed e as unidades `systemd` do backup agendado. Passo a passo completo em `.claude/docs/DEPLOY.md`.
- `.claude/docs/` — documentação técnica: os documentos históricos do projeto migrados de `docs/` (auditoria, runbook, planos e logs — nomes originais preservados, ver `.claude/docs/README.md`), relatórios de auditoria **novos** do kit (`YYYY-MM-DD-<tipo>-audit.md`), o roadmap vivo (`roadmap.md`), o guia de entrada (`onboarding.md`), o procedimento de deploy (`DEPLOY.md`) e ADRs em `.claude/docs/adr/` (numerados `0001-titulo.md`).
- `.claude/design/` — handoff bundles do Claude Design, um diretório por tela/fluxo (`{YYYY-MM-DD}-<tela>/`); o mais recente é o vigente (ver `10-design-system.md`).
- `.claude/log/CHANGELOG.md` — histórico append-only de implementações.
- `.claude/hooks/` — `block-git-commit-push.sh`, `block-env-files.sh` e `ativar-skills.sh`, registrados em `.claude/settings.json`.
- `.github/` — templates de issue, `PULL_REQUEST_TEMPLATE.md` (**fonte única do corpo do PR**), `CODEOWNERS`, `dependabot.yml` (cobre os três pacotes) e o workflow `ci.yml`.
- **Wiki do projeto** — repositório git **separado**, clonado em `~/Development/lumitrack.wiki/` (é o `lumitrack.wiki.git` do GitHub, não um diretório deste repo). Edite os arquivos lá diretamente; o commit e o push são do usuário, como no repositório principal. `O-Sistema-Eletrico-Brasileiro.md` existe nos dois lugares: **a cópia em `.claude/docs/` é a fonte de verdade**, a do wiki é cópia sincronizada — ao alterar um, alterar o outro no mesmo trabalho.
