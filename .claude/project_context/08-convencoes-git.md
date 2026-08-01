# 08 — Convenções de Git (commits, changelog, PR)

> Fonte única das convenções de versionamento. Referenciada pelas skills ao concluir.

## Nomes de branch

Formato: `<tipo>/<descricao-em-kebab-case>` — o `<tipo>` espelha os tipos de commit e as labels `tipo:`.

- `feat/criacao-de-tarefas` · `fix/refresh-token-logout` · `refactor/extrai-calculo-total` · `perf/n1-listagem-pedidos` · `chore/atualiza-eslint` · `docs/adr-token-storage`
- Se a branch resolve uma issue, inclua o número: `fix/123-refresh-token-logout`.

## Vínculo commit/PR ↔ issue

- Use `Closes #N` (ou `Fixes #N`) no rodapé do commit ou na descrição do PR para **fechar a issue automaticamente** no merge.
- Vários: `Closes #12, closes #15`.

## Mensagens de commit — Conventional Commits

Formato: `<tipo>(<escopo opcional>): <descrição no imperativo>`

Tipos: `feat` (nova funcionalidade), `fix` (correção de bug), `refactor` (sem alterar comportamento), `perf` (desempenho), `test`, `docs`, `chore` (config/infra).

Regras: assunto no imperativo e ≤ 72 caracteres; corpo opcional explicando o **porquê**; rodapé `BREAKING CHANGE:` quando houver quebra.

> As skills **geram o texto sugerido** — o usuário faz o commit manualmente.

Exemplos:
- `feat(tarefas): adiciona criação de tarefa com validação Zod`
- `fix(auth): corrige refresh token que não invalidava a sessão no logout`
- `refactor(pedidos): extrai cálculo de total para serviço de domínio`
- `perf(relatorios): elimina N+1 na listagem de pedidos`

## Entrada no CHANGELOG (append-only)

```
## [YYYY-MM-DD] <tipo>: <título curto>
- **Branch:** <nome-da-branch>
- **Tipo:** scaffold | feature | fix | refactor | perf | audit-seguranca | audit-qualidade | audit-desempenho
- **O quê:** descrição em 1–2 linhas.
- **Arquivos principais:** caminhos tocados.
- **Decisões/ADRs:** referências, se houver.
- **Notas:** riscos, follow-ups, ou relatório gerado.
```

Obtenha a branch com: `git rev-parse --abbrev-ref HEAD`.

## Labels de Issues

> Conjunto **enxuto** (solo dev): label que não se aplica vira padrão morto. As labels espelham as taxonomias que o kit já usa — tipos do Conventional Commits, severidades das auditorias e decisões em aberto — para que issue → commit → changelog usem a mesma língua.

**`tipo:` — o que é (espelha os tipos de commit)**

| Label | Cor | Uso |
|---|---|---|
| `tipo: feature` | `#1D9E75` | Funcionalidade nova (→ commit `feat:`) |
| `tipo: bug` | `#E24B4A` | Comportamento errado (→ `fix:`, skill `correcao-bugs`) |
| `tipo: refactor` | `#7F77DD` | Estrutura sem mudar comportamento (→ `refactor:`) |
| `tipo: desempenho` | `#EF9F27` | Performance (→ `perf:`) |
| `tipo: segurança` | `#993C1D` | Controles OWASP / vulnerabilidade |
| `tipo: conformidade` | `#D4537E` | LGPD / legislação (ver `09`) |
| `tipo: docs` | `#85B7EB` | Documentação, ADRs, contexto do kit |
| `tipo: chore` | `#B4B2A9` | Config, CI, dependências |

**`prioridade:` — quando (espelha a severidade das auditorias)**

| Label | Cor | Uso |
|---|---|---|
| `prioridade: crítica` | `#A32D2D` | Bloqueia release; achado [CRÍTICA] de auditoria |
| `prioridade: alta` | `#D85A30` | Próximo ciclo; achado [ALTA] |
| `prioridade: média` | `#BA7517` | Programável; achado [MÉDIA] |
| `prioridade: baixa` | `#639922` | Oportunidade; achado [BAIXA] |

**`área:` — onde**

`área: frontend` (`#378ADD`) · `área: backend` (`#534AB7`) · `área: banco` (`#0F6E56`) · `área: infra/ci` (`#5F5E5A`)

**`status:` — situação especial (só quando aplicável)**

| Label | Cor | Uso |
|---|---|---|
| `status: bloqueada` | `#444441` | Depende de algo externo |
| `status: aguardando-decisão` | `#F0997B` | Depende de item do `07-decisoes-em-aberto.md` |
| `status: precisa-adr` | `#AFA9EC` | A solução exige decisão arquitetural registrada |

**`origem: auditoria`** (`#888780`) — issue criada a partir de achado de relatório em `.claude/docs/` (cite o arquivo do relatório no corpo da issue).

**Regras de uso**
- Toda issue recebe **1 `tipo:` + 1 `prioridade:`**; `área:`, `status:` e `origem:` conforme o caso.
- Achado de auditoria → issue com `origem: auditoria` + severidade mapeada em `prioridade:` + `tipo:` correspondente (segurança/conformidade/desempenho/refactor).
- A label `tipo:` da issue deve bater com o prefixo do commit que a resolve.
- **Templates de issue** em `.github/ISSUE_TEMPLATE/` (bug, feature, achado de auditoria) já aplicam a label de `tipo:`/`origem:` automaticamente; a `prioridade:` é adicionada na triagem.
- A skill `criar-issues` automatiza a criação em lote a partir de laudos de auditoria (com aprovação do usuário e deduplicação), aplicando esta taxonomia.
- **GitHub Projects (se usado):** os campos padrão `Priority` (P0/P1/P2) e `Size` (XS–XL) do Projects são usados no roadmap. Mapeamento para labels: **P0 → `prioridade: crítica` · P1 → `prioridade: alta` · P2 → `prioridade: média`** (`baixa` fica para achados leves de auditoria). `Size` vive no roadmap/corpo da issue — campos de Project são preenchidos manualmente no board.

**Bootstrap (criar tudo de uma vez com o GitHub CLI):**

```bash
gh label create "tipo: feature"      --color 1D9E75 --description "Funcionalidade nova (feat:)" --force
gh label create "tipo: bug"          --color E24B4A --description "Comportamento errado (fix:)" --force
gh label create "tipo: refactor"     --color 7F77DD --description "Estrutura sem mudar comportamento" --force
gh label create "tipo: desempenho"   --color EF9F27 --description "Performance (perf:)" --force
gh label create "tipo: segurança"    --color 993C1D --description "Controles OWASP / vulnerabilidade" --force
gh label create "tipo: conformidade" --color D4537E --description "LGPD / legislação brasileira" --force
gh label create "tipo: docs"         --color 85B7EB --description "Documentação, ADRs, contexto" --force
gh label create "tipo: chore"        --color B4B2A9 --description "Config, CI, dependências" --force
gh label create "prioridade: crítica" --color A32D2D --description "Bloqueia release" --force
gh label create "prioridade: alta"    --color D85A30 --description "Próximo ciclo" --force
gh label create "prioridade: média"   --color BA7517 --description "Programável" --force
gh label create "prioridade: baixa"   --color 639922 --description "Oportunidade" --force
gh label create "área: frontend"  --color 378ADD --description "React / UI" --force
gh label create "área: backend"   --color 534AB7 --description "API / domínio" --force
gh label create "área: banco"     --color 0F6E56 --description "PostgreSQL / Prisma / dados" --force
gh label create "área: infra/ci"  --color 5F5E5A --description "Deploy, CI/CD, observabilidade" --force
gh label create "status: bloqueada"           --color 444441 --description "Depende de algo externo" --force
gh label create "status: aguardando-decisão"  --color F0997B --description "Depende do 07-decisoes-em-aberto" --force
gh label create "status: precisa-adr"         --color AFA9EC --description "Exige decisão arquitetural (ADR)" --force
gh label create "origem: auditoria" --color 888780 --description "Criada a partir de relatório em .claude/docs/" --force
```

## Texto de Pull Request

```
## <título do PR>

### Resumo
O que esta branch entrega e por quê.

### Mudanças
- agrupar por tipo (feat / fix / refactor / perf)

### Como testar
Passos / comandos.

### Checklist
- [ ] type-check, lint, testes e dependency-cruiser passam
- [ ] Controles de segurança aplicáveis cobertos
- [ ] CHANGELOG atualizado
- [ ] Breaking changes destacadas (se houver)
```
