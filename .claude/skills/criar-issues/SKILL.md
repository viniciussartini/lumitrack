---
name: criar-issues
description: Cria issues no GitHub via gh CLI a partir de um relatório de auditoria em .claude/docs/, do roadmap de implementação (.claude/docs/roadmap.md — fase atual) ou de forma avulsa (bug, feature ou melhoria discutida na conversa). Decide entre issue épica com sub-issues vinculadas ou issues individuais, e cria a branch de implementação (main é protegida). Use SEMPRE que o usuário pedir "cria as issues", "abre as issues do relatório/da auditoria/do roadmap/da fase", "transforma os achados em issues", "cria uma issue para X" ou mencionar "épico". SEMPRE rascunha o lote completo e aguarda aprovação explícita do usuário antes de executar qualquer gh issue create.
model: sonnet
effort: medium
---

# Skill: Criar Issues no GitHub

Transforma achados de auditoria (ou demandas avulsas) em issues no GitHub — **com checkpoint de aprovação**: rascunhar tudo, apresentar, e só criar após o usuário aprovar.

## Pré-checagens (antes de qualquer coisa)

1. `gh auth status` — se não autenticado, pare e informe (o usuário roda `gh auth login`).
2. Confirme o repositório alvo (`gh repo view --json nameWithOwner -q .nameWithOwner`).
3. Leia a taxonomia de labels em `.claude/project_context/08-convencoes-git.md`.
4. **Milestone da entrega (Modo roadmap):** leia no roadmap a **entrega** a que a fase pertence (`MVP`, `Beta fechado`…) — milestone é por entrega, não por fase, e várias fases compartilham a mesma. Verifique se existe (`gh api repos/{owner}/{repo}/milestones --jq '.[].title'`); se não, inclua a criação no rascunho para aprovação (`gh api repos/{owner}/{repo}/milestones -f title="{entrega}" -f description="..."`). Toda issue — épicos e sub-issues — recebe `--milestone "{entrega}"`. Ver `08-convencoes-git.md`.
5. `gh --version` — sub-issues nativas exigem **gh ≥ 2.94.0**. Se for menor, avise: as issues serão criadas planas, com a hierarquia representada por checklist no corpo do épico (`- [ ] #N`), e sugira `gh extension upgrade --all` ou atualização do gh.

## Decisão: épico + sub-issues ou issues individuais?

Avalie **antes** de rascunhar, em qualquer um dos três modos. Aplique a mesma trava YAGNI do kit: **o default é issue individual**; épico só quando ele paga o próprio overhead.

**Crie um épico quando ao menos dois forem verdadeiros:**
- O trabalho tem **3+ issues** que só entregam valor juntas (uma fatia vertical completa: banco → API → UI de um mesmo domínio).
- As issues compartilham **contexto e critérios de aceite** que ficariam duplicados se repetidos em cada uma.
- Faz sentido **uma única branch e um único PR** para o conjunto.

**Mantenha issues individuais quando:**
- Os itens são independentes entre si (típico de achados de auditoria em áreas diferentes).
- São 1–2 issues (épico com uma sub-issue é burocracia).
- Cada item pode ser mergeado sozinho sem quebrar nada.

**Nunca** crie épico "guarda-chuva" de fase inteira do roadmap — a fase já é a unidade de agrupamento, e um épico com 15 sub-issues vira branch de vida longa (exatamente o que a fatia vertical evita).

Apresente a **classificação proposta** no rascunho ("estas 4 viram o épico X; estas 3 ficam individuais") com uma linha de justificativa por agrupamento. O usuário pode reagrupar.

## Modo 1 — A partir de um laudo de auditoria

1. Leia o relatório indicado em `.claude/docs/` (se o usuário não indicar, use o mais recente e confirme).
2. Extraia cada achado e rascunhe uma issue:
   - **Título:** `[Auditoria] {título do achado}`
   - **Labels:** `origem: auditoria` + `prioridade:` mapeada da severidade (Crítica→crítica, Alta→alta, Média→média, Baixa→baixa) + `tipo:` conforme a auditoria (segurança→`tipo: segurança`; conformidade→`tipo: conformidade`; desempenho→`tipo: desempenho`; qualidade→`tipo: refactor`, ou `tipo: chore` p/ tooling) + `área:` quando inferível pelo local do achado.
   - **Corpo:** relatório de origem (nome do arquivo), severidade, achado com local (arquivo:linha), evidência e recomendação — mesmo formato do template `03-achado-auditoria`.
3. **Deduplicação:** antes de incluir no lote, busque issues existentes (`gh issue list --state open --search "{termos do achado}"`); se já houver issue equivalente, marque como "já existe: #N" no rascunho e não recrie.
4. Se houver 3+ achados de prioridade **baixa**, ofereça agrupá-los numa única issue "melhorias de baixa prioridade — {tipo}" para não poluir o backlog.

## Modo 2 — A partir do roadmap (fase atual)

1. Leia `.claude/docs/roadmap.md` e identifique a **fase atual**.
2. Rascunhe uma issue por item da fase — **somente da fase atual**; issues de fases futuras são backlog-cadáver (as fases vão mudar).
   - **Título:** `[Feature] {item do roadmap}`
   - **Labels:** `tipo: feature` + `prioridade:` mapeada da Priority do item (**P0 → `prioridade: crítica`** · **P1 → `prioridade: alta`** · **P2 → `prioridade: média`**) + `área:` quando inferível.
   - **Corpo:** comportamento entregue, RFs cobertos, **critérios de aceite** (copiados do roadmap — a `nova-feature` os transforma nos primeiros testes), dependências, e `Priority: PX · Size: XX` (para preencher os campos do GitHub Projects, se usado — `gh issue create` não seta campos de Project).
3. Deduplicação e checkpoint de aprovação valem igual (ver abaixo).

## Modo 3 — Issue avulsa (da conversa)

Rascunhe a issue a partir do que foi discutido: `tipo:` conforme a natureza (bug/feature/refactor/chore), `prioridade:` proposta, corpo no formato do template correspondente em `.github/ISSUE_TEMPLATE/` (bug: reprodução + esperado vs. atual; feature: motivação + RF + critérios de aceite).

## Checkpoint de aprovação (OBRIGATÓRIO)

Apresente o lote completo — **agrupamento proposto (épicos × individuais) com justificativa**, títulos, labels, corpos resumidos e **branches que serão criadas** — e **pergunte explicitamente** se pode criar. Aguarde o "aprovado" (total ou parcial: o usuário pode cortar, editar ou reagrupar itens). **Nunca execute `gh issue create` nem `git checkout -b` antes disso.**

## Execução

### A. Issues individuais

```bash
gh issue create --title "..." --body "..." --label "origem: auditoria" --label "tipo: ..." --label "prioridade: ..."
```

### B. Épico + sub-issues

1. **Crie o épico primeiro** (ele precisa existir para ser referenciado como pai):
   ```bash
   gh issue create --title "[Épico] {nome do agrupamento}" \
     --body "..." --label "tipo: feature" --label "prioridade: ..." --label "épico"
   ```
   Corpo do épico: objetivo da fatia vertical, RFs cobertos, critérios de aceite **do conjunto**, contexto compartilhado, e a branch de implementação (preenchida no passo 3).

2. **Crie cada sub-issue vinculada ao pai** (gh ≥ 2.94.0):
   ```bash
   gh issue create --title "..." --body "..." --parent {N-do-épico} \
     --label "tipo: ..." --label "prioridade: ..." --label "área: ..."
   ```
   - Para vincular issue **já existente** ao épico: `gh issue edit {N-do-épico} --add-sub-issue {M}`.
   - **Fallback (gh < 2.94.0):** crie as issues normalmente e edite o corpo do épico com checklist `- [ ] #M` — o GitHub renderiza o progresso, sem hierarquia nativa.
   - Herança de labels: a sub-issue herda `prioridade:` do épico, salvo justificativa; `tipo:` e `área:` são próprios de cada sub-issue.

3. **Crie a branch do épico** (ver `08-convencoes-git.md`):
   ```bash
   git checkout main && git pull
   git checkout -b epic/{N}-{descricao-em-kebab-case}
   ```
   Depois, comente o nome da branch no épico e edite o corpo para registrá-la.

### C. Branch de issue avulsa

Para issue individual aprovada que o usuário vai implementar em seguida:
```bash
git checkout main && git pull
git checkout -b {tipo}/{N}-{descricao-em-kebab-case}
```

> **Política de git do kit:** criar branch é permitido (reversível, nada é publicado). **Commit, push e PR continuam manuais** — o hook `block-git-commit-push.sh` bloqueia mecanicamente. Pergunte antes de criar a branch se o usuário quer começar a implementação agora; se ele só está montando o backlog, apenas registre o nome sugerido no corpo da issue.

Ao final, liste os números/links criados, a hierarquia (épico → sub-issues) e as branches criadas. Não registre no CHANGELOG (issues são planejamento, não implementação — vivem no GitHub).
