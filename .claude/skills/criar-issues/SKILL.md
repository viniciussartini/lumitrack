---
name: criar-issues
description: Cria issues no GitHub via gh CLI a partir de um relatório de auditoria em .claude/docs/, do roadmap de implementação (.claude/docs/roadmap.md — fase atual) ou de forma avulsa (bug, feature ou melhoria discutida na conversa). Use SEMPRE que o usuário pedir "cria as issues", "abre as issues do relatório/da auditoria/do roadmap/da fase", "transforma os achados em issues" ou "cria uma issue para X". SEMPRE rascunha o lote completo e aguarda aprovação explícita do usuário antes de executar qualquer gh issue create.
---

# Skill: Criar Issues no GitHub

Transforma achados de auditoria (ou demandas avulsas) em issues no GitHub — **com checkpoint de aprovação**: rascunhar tudo, apresentar, e só criar após o usuário aprovar.

## Pré-checagens (antes de qualquer coisa)

1. `gh auth status` — se não autenticado, pare e informe (o usuário roda `gh auth login`).
2. Confirme o repositório alvo (`gh repo view --json nameWithOwner -q .nameWithOwner`).
3. Leia a taxonomia de labels em `.claude/project_context/08-convencoes-git.md`.

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

Apresente o lote completo — títulos, labels e corpos resumidos — e **pergunte explicitamente** se pode criar. Aguarde o "aprovado" (total ou parcial: o usuário pode cortar/editar itens). **Nunca execute `gh issue create` antes disso.**

## Execução

Para cada issue aprovada:
```bash
gh issue create --title "..." --body "..." --label "origem: auditoria" --label "tipo: ..." --label "prioridade: ..."
```
Ao final, liste os números/links criados. Não registre no CHANGELOG (issues são planejamento, não implementação — vivem no GitHub).
