---
name: preparar-pr
description: Mapeia todas as alterações feitas em uma branch, monta a descrição do Pull Request nas convenções do kit e CRIA o PR no GitHub via gh pr create. Use SEMPRE que o usuário pedir "preparar o PR", "cria o PR", "abre o pull request", "texto do pull request", "descrição do PR", "resumir a branch" ou "o que mudou nesta branch". Exige a branch já publicada no remoto (o push continua manual). NÃO faz push nem merge — ambos bloqueados por hook.
model: sonnet
effort: medium
---

# Skill: Preparar e Criar Pull Request

Resume o trabalho de uma branch, monta a descrição no padrão do kit e **cria o PR**.

## Contexto obrigatório (leia ANTES de montar qualquer texto)

1. **`.github/PULL_REQUEST_TEMPLATE.md`** — a **estrutura do corpo do PR**. Preencha as seções deste arquivo; não invente seções nem omita as existentes. Se o arquivo não existir, avise e use a estrutura mínima: Resumo · Mudanças · Como testar · Issues relacionadas · Checklist.
2. **`.claude/project_context/08-convencoes-git.md`** — convenções de **título** (Conventional Commits derivado do prefixo da branch), base, `Closes #N` e labels.

> **Por que ler o template explicitamente:** `gh pr create --body-file` **ignora** o `PULL_REQUEST_TEMPLATE.md` do repositório. Sem esta leitura, o PR sai sem os itens de LGPD, ADR e CHANGELOG do checklist.

## Pré-condições (verifique antes de montar o texto)

1. `gh auth status` — se não autenticado, pare e informe (o usuário roda `gh auth login`).
2. `git rev-parse --abbrev-ref HEAD` — a branch atual **não pode ser `main`**. Se for, pare: não há PR a criar.
3. **Branch publicada?** `git rev-parse --abbrev-ref --symbolic-full-name @{u}` — se não houver upstream, ou se `git status -sb` indicar commits locais à frente, **pare e peça o push ao usuário**, entregando o comando:
   ```
   git push -u origin <branch>
   ```
   *Push é manual por política do kit (bloqueado por hook). Sem isso o `gh pr create` falha ou abre prompt interativo.*
4. **PR já existe?** `gh pr view --json number,url,state 2>/dev/null` — se já houver PR aberto para esta branch, **não crie outro**: informe o link e ofereça atualizar o corpo com `gh pr edit`.

## Montar a descrição

1. Identifique a **branch base** (geralmente `main`). Se ambíguo, **pergunte**.
2. Levante as mudanças:
   - `git log <base>..HEAD --oneline` — commits
   - `git diff --stat <base>..HEAD` — arquivos tocados
3. Cruze com as entradas do `.claude/log/CHANGELOG.md` correspondentes a esta branch.
4. **Preencha o template** (`.github/PULL_REQUEST_TEMPLATE.md`), seção por seção, removendo os comentários `<!-- -->` de instrução:
   - **Resumo:** o que a branch entrega e por quê (não a lista de commits).
   - **Mudanças:** agrupadas por tipo (feat / fix / refactor / perf / chore / docs), destacando impacto em segurança e breaking changes.
   - **Como testar:** passos e comandos reais do projeto.
   - **Issues relacionadas:** `Closes #N` conforme a regra abaixo.
   - **Checklist:** marque `[x]` **apenas** o que você verificou de fato (ex.: CHANGELOG atualizado, ADR criado — dá para conferir nos arquivos). Deixe `[ ]` o que depende de execução ou julgamento do usuário (type-check/lint/testes que você não rodou, cobertura de controles de segurança, base legal de dados pessoais). **Nunca marque item não verificado** — checklist falso é pior que checklist vazio.
5. **Título:** siga Conventional Commits, derivado do prefixo da branch (`feat/` → `feat: ...`), conforme o `08`.
6. **Referências de issue:**
   - Branch `epic/{N}-...` → `Closes #N` (o épico); as sub-issues já foram fechadas pelos commits.
   - Branch `{tipo}/{N}-...` → `Closes #N`.
   - Se a branch não citar issue, procure referências no changelog e nos commits.

## Criar o PR

Escreva o corpo em arquivo temporário (evita problemas de escape e quebras de linha) e crie:

```bash
gh pr create --base <base> --title "<titulo>" --body-file /tmp/pr-body.md
```

- **Sempre pronto para revisão** — não use `--draft`.
- Adicione labels seguindo a taxonomia do `08` (ex.: `--label "tipo: feat"`).
- **[EQUIPE]** (modo em `01-descricao.md`): sugira revisores a partir do `CODEOWNERS` dos caminhos tocados (`--reviewer <login>`). Em modo solo, não adicione revisor — sugira rodar o agente `revisao-codigo` antes do merge.
- **Antes de criar, confira:** o corpo tem todas as seções do template? O checklist preservou todos os itens originais (marcados ou não)? O título segue Conventional Commits?
- Se o `gh pr create` falhar, **não tente contornar com push**: reporte o erro e o comando manual equivalente.

## Saída

O link do PR criado + o resumo do que entrou nele (commits agrupados, issues referenciadas). Se algo impediu a criação (branch não publicada, PR já existente), diga exatamente qual foi o bloqueio e o próximo passo.

## Ao concluir

Não há alteração de código a registrar no CHANGELOG — o PR é publicação, não implementação.

> **Limites mantidos:** `git commit`, `git push` e `gh pr merge` continuam bloqueados por hook. Você publica a branch e faz o merge; a skill cuida do trecho entre os dois.
