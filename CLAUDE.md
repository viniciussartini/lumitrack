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
- **YAGNI e KISS têm precedência** — sem abstração especulativa num MVP solo.

**UI/UX**
- A interface vem do **handoff do Claude Design** (`.claude/design/`) — **proibido inventar layout** quando existe design para a tela; sem design → pergunte (regras em `10-design-system.md`).
- Design tokens do bundle são a autoridade sobre o tema Tailwind/shadcn — nada de cor/espaçamento hardcodado fora da escala.

> Detalhes completos em `.claude/project_context/05-security-standards.md` (segurança), `06-code-quality-standards.md` (qualidade) e `09-conformidade-legal.md` (LGPD/legislação BR). As skills referenciam esses arquivos — leia-os antes de implementar qualquer coisa que toque segurança, estrutura ou dados pessoais.

## Contexto do projeto (`.claude/project_context/`)

- `01-descricao.md` — o que é o projeto, problema, usuário-alvo.
- `02-requisitos.md` — RF / RNF / Funcionamento.
- `03-arquitetura.md` — monólito modular, fronteiras, ADRs.
- `04-tech-stack.md` — stack decidido.
- `05-security-standards.md` — OWASP 2025 + segurança de frontend/observabilidade.
- `06-code-quality-standards.md` — SOLID, clean code, enforcement.
- `07-decisoes-em-aberto.md` — decisões pendentes; pergunte antes de assumir.
- `08-convencoes-git.md` — commits (Conventional Commits), labels de issues, formato do changelog e do PR.
- `09-conformidade-legal.md` — LGPD + legislação BR (bases legais, direitos, incidentes, transferência internacional).
- `10-design-system.md` — UI/UX via Claude Design: handoff bundle, tokens, regras de divergência/ausência, `/design-sync`.

## Skills (`.claude/skills/`)

**Planejamento**
- `planejar-roadmap` — cria/atualiza o roadmap de implementação (`.claude/docs/roadmap.md`) a partir dos requisitos: fatias verticais, P0/P1/P2, XS–XL.

**Construção**
- `scaffold-projeto` — setup inicial do repositório greenfield.
- `nova-feature` — construir uma feature nova seguindo os padrões.
- `refatoracao` — refatorar preservando comportamento.
- `correcao-bugs` — corrigir bugs (muda o comportamento de errado para certo).

**Fluxo Git**
- `preparar-pr` — mapeia as alterações da branch e gera o texto do Pull Request.
- `criar-issues` — cria issues no GitHub (de um laudo de auditoria, da **fase atual do roadmap** ou avulsas), **sempre com aprovação em lote** antes de executar.

## Auditorias (subagents somente-leitura em `.claude/agents/`)

- `auditoria-seguranca` — OWASP 2025 (segurança técnica).
- `auditoria-conformidade` — LGPD + legislação BR.
- `auditoria-qualidade` — SOLID / clean code / fronteiras / drift de documentação.
- `auditoria-desempenho` — queries, índices, bundle, render, complexidade.

Os auditores têm apenas Read/Grep/Glob (garantia mecânica de que auditoria **não corrige**) e **retornam o laudo como resultado** — eles não gravam arquivos.

**Protocolo pós-auditoria (executado pela conversa principal ao receber o laudo):**
1. Salvar o laudo **na íntegra** em `.claude/docs/{YYYY-MM-DD}-<tipo>-audit.md` (tipos: `seguranca`, `conformidade`, `qualidade`, `desempenho`).
2. Registrar em `.claude/log/CHANGELOG.md` (tipo `audit-<tipo>`, com a branch atual).
3. Gerar texto de commit: `docs: relatório de auditoria de <tipo> {DATA}`.
4. Ofereça abrir as issues dos achados via skill `criar-issues` (rascunho em lote → aprovação do usuário → `gh issue create` com as labels do `08`).

## Guard-rails (hooks em `.claude/settings.json`)

Regras impostas deterministicamente, independentes de instrução:
- **`git commit` / `git push` / `gh pr create` / `gh pr merge` são bloqueados** — o usuário commita, faz push e abre/mescla PRs manualmente; gere o texto (commit ou PR). `gh issue create` é permitido, via skill `criar-issues` com aprovação.
- **Arquivos `.env*` são bloqueados** para leitura/edição (exceto `.env.example`) — segredos não passam pelo agente.

Se um hook bloquear uma ação sua, siga a orientação da mensagem — não tente contornar.

## Convenções de pastas

- **Monorepo:** `backend/` (Express + Prisma + PostgreSQL), `frontend/` (React + Vite) e `iot-simulator/` (server + ui) são pacotes independentes, cada um com seu próprio `package.json`, lint e testes — ver `03-arquitetura.md`.
- `.claude/docs/` — documentação técnica: os documentos históricos do projeto migrados de `docs/` (auditoria, runbook, planos e logs — nomes originais preservados, ver `.claude/docs/README.md`), relatórios de auditoria **novos** do kit (`YYYY-MM-DD-<tipo>-audit.md`), o roadmap vivo (`roadmap.md`) e ADRs em `.claude/docs/adr/` (numerados `0001-titulo.md`).
- `.claude/design/` — handoff bundles do Claude Design, um diretório por tela/fluxo (`{YYYY-MM-DD}-<tela>/`); o mais recente é o vigente (ver `10-design-system.md`).
- `.claude/log/CHANGELOG.md` — histórico append-only de implementações.
- **Wiki do projeto** — repositório git **separado**, clonado em `~/Development/lumitrack.wiki/` (é o `lumitrack.wiki.git` do GitHub, não um diretório deste repo). Edite os arquivos lá diretamente; o commit e o push são do usuário, como no repositório principal. `O-Sistema-Eletrico-Brasileiro.md` existe nos dois lugares: **a cópia em `.claude/docs/` é a fonte de verdade**, a do wiki é cópia sincronizada — ao alterar um, alterar o outro no mesmo trabalho.
