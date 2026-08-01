---
name: preparar-pr
description: Mapeia todas as alterações feitas em uma branch e gera o texto de descrição do Pull Request para o usuário criar o PR manualmente. Use SEMPRE que o usuário pedir "preparar o PR", "texto do pull request", "descrição do PR", "resumir a branch", "o que mudou nesta branch" ou estiver prestes a abrir um PR. NÃO cria o PR nem faz push — apenas produz o texto.
---

# Skill: Preparar Texto de Pull Request

Resume o trabalho de uma branch e **produz o texto do PR** — não cria o PR.

## Procedimento
1. Identifique a **branch base** (geralmente `main`). Se ambíguo, **pergunte**.
2. Levante as mudanças:
   - `git rev-parse --abbrev-ref HEAD` — branch atual
   - `git log <base>..HEAD --oneline` — commits
   - `git diff --stat <base>..HEAD` — arquivos tocados
3. Cruze com as entradas do `.claude/log/CHANGELOG.md` correspondentes a esta branch.
4. Monte o texto no formato de `.claude/project_context/08-convencoes-git.md`, agrupando por tipo (feat/fix/refactor/perf) e destacando impacto em segurança ou breaking changes.
5. Use o **prefixo do nome da branch** (`feat/`, `fix/`, ...) como sinal do tipo principal do PR; se a branch ou o changelog citarem issues, inclua `Closes #N` na descrição.

## Saída
O texto completo do PR pronto para colar. **Não** execute `git push` nem `gh pr create` — o usuário faz manualmente (essas ações são bloqueadas por hook, ver guard-rails no `CLAUDE.md`).

## Ao concluir
Não há alteração de código a registrar. Apenas entregue o texto.
