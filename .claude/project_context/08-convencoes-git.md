# 08 — Convenções de Git (commits, changelog, PR)

> Fonte única das convenções de **controle de versão** (branches, commits, changelog, issues, milestones e PR). Referenciada pelas skills ao concluir.
>
> **Fora de escopo:** versão de release (SemVer, tags `vX.Y.Z`). O projeto é um web app com deploy contínuo — não há artefato consumido por terceiros, então numeração de versão não comunica nada a ninguém e cairia na trava YAGNI do `06`. Se um dia houver app mobile, API pública ou biblioteca, esta seção ganha a convenção de release.

## Ambientes e branches principais

**Duas branches de longa duração, cada uma servindo um ambiente** (ADR-0012):

| Branch | Ambiente | Papel |
|---|---|---|
| `main` | VPS Hostinger, São Paulo (Caminho B do `DEPLOY.md`) | Produção — estável, testado e consolidado, acessível ao público. |
| `staging` | Render + Neon (Caminho A do `DEPLOY.md`) | Testes e integração — recebe o merge de toda branch de implementação para validação online antes da promoção. Continua público. |

**Fluxo:** `feat/fix/epic/{N}-...` → PR → `staging` → validado online → PR → `main`.

- **Base padrão de PR passa a ser `staging`**, não `main` — a skill `preparar-pr` usa `staging` salvo indicação em contrário.
- **O PR de promoção `staging`→`main`** é diferente de um PR de feature: não fecha issue própria (as issues já fecharam nos commits das branches que entraram em `staging`), e o checklist do `PULL_REQUEST_TEMPLATE.md` foca em "o que já foi validado no staging" em vez de critérios de aceite de uma issue específica.
- **`main` e `staging` são ambas protegidas** contra push direto — toda entrada, nos dois casos, passa por PR.
- **CI roda em PR para as duas** — `ci.yml` não fica restrito a `main`.

## Nomes de branch

Formato: `<tipo>/<descricao-em-kebab-case>` — o `<tipo>` espelha os tipos de commit e as labels `tipo:`.

- `feat/criacao-de-tarefas` · `fix/refresh-token-logout` · `refactor/extrai-calculo-total` · `perf/n1-listagem-pedidos` · `chore/atualiza-eslint` · `docs/adr-token-storage`
- Se a branch resolve uma issue, inclua o número: `fix/123-refresh-token-logout`.

**Branch de épico** — `main` é protegida contra merge direto; toda entrega passa por PR.

- Formato: `epic/<numero-do-epico>-<descricao-em-kebab-case>` — ex.: `epic/42-cadastro-de-tarefas`.
- **Uma branch por épico:** todas as sub-issues são implementadas e commitadas nela, e o conjunto vira **um único PR** para `main`. Evita PRs intermediários e mantém a fatia vertical íntegra (banco → API → UI entram juntos).
- Cada commit na branch do épico fecha sua sub-issue: `feat(tarefas): adiciona endpoint de criação` + rodapé `Closes #44`.
- A descrição do PR do épico usa `Closes #42` (o épico) — as sub-issues já foram fechadas pelos commits.
- **Risco a vigiar:** branch de vida longa. Se o épico passar de ~5 sub-issues ou de alguns dias, prefira quebrá-lo em épicos menores (a skill `criar-issues` já aplica essa trava ao propor o agrupamento).

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

> Conjunto **enxuto**: label que não se aplica vira padrão morto. As labels espelham as taxonomias que o kit já usa — tipos do Conventional Commits, severidades das auditorias e decisões em aberto — para que issue → commit → changelog usem a mesma língua.

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
| `épico` | `#5B4FCF` | Issue guarda-chuva com sub-issues vinculadas (branch `epic/`) |

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
- **Épicos:** recebem a label `épico` + `tipo:` + `prioridade:`; as sub-issues herdam a `prioridade:` do épico (salvo justificativa) e têm `tipo:`/`área:` próprios. Sub-issues nativas exigem **gh ≥ 2.94.0** (`gh issue create --parent N`); abaixo disso, checklist `- [ ] #N` no corpo do épico.
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
gh label create "épico" --color 5B4FCF --description "Issue guarda-chuva com sub-issues" --force
gh label create "origem: auditoria" --color 888780 --description "Criada a partir de relatório em .claude/docs/" --force
```

## Milestones (entrega, não fase)

**Milestone marca uma entrega reconhecível** — algo que alguém de fora chamaria de marco ("MVP", "Beta fechado", "v1 pública"), não cada fatia de planejamento. **Uma milestone agrupa uma ou mais fases** do roadmap; quando uma fase é por si só uma entrega, as duas coincidem.

- **É atributo da fase, não hierarquia nova:** cada fase do roadmap declara a que entrega pertence; várias fases podem apontar para a mesma. Não existe nível "marco" a gerenciar.
- **Nome:** o da entrega, na linguagem do produto — `MVP`, `Beta fechado`, `v1 pública`. Não use numeração de fase.
- **Descrição:** o que a entrega habilita + as fases e RFs cobertos.
- **Toda issue das fases que compõem a entrega recebe a milestone** — inclusive sub-issues, para o progresso refletir o trabalho real.
- **Achados de auditoria** entram na milestone em que serão tratados; sem decisão, ficam sem milestone (backlog).
- **Data de entrega** opcional: use quando houver compromisso real (cliente, equipe, release planejado); evite prazo decorativo.
- **Encerramento:** fecha quando a **última fase** da entrega é concluída no roadmap.
- **Sinal de granularidade errada:** milestone com menos de ~8 issues provavelmente é uma fase disfarçada; milestone que nunca fecha é escopo de projeto, não de entrega.

**Complementaridade:** milestone responde *"em que entrega"*; label `prioridade:` responde *"quão urgente"*; `Size` do Projects responde *"quão grande"*. Não duplicar: prioridade e tamanho não viram milestone.

**Comandos** (a milestone precisa existir antes de ser atribuída):

```bash
# criar (não há subcomando nativo — vai por API)
gh api repos/{owner}/{repo}/milestones -f title="MVP" -f description="..."

# atribuir na criação da issue
gh issue create --title "..." --milestone "MVP"

# atribuir a issue existente
gh issue edit {N} --milestone "MVP"
```

## Revisão de código (processo)

**Quem revisa:** **[EQUIPE]** outra pessoa aprova antes do merge; `CODEOWNERS` define revisor obrigatório em caminhos sensíveis (auth, autorização, migrações, pipeline, config de segurança). **Modo solo:** o agente `revisao-codigo` é a revisão — rode-o antes do merge, não como formalidade.

**Ordem recomendada:** `revisao-codigo` primeiro (pega o mecânico: padrão violado, teste ausente, PII em log), revisor humano depois (julga modelagem, decisão de produto, trade-off). Isso protege o recurso escasso, que é a atenção humana.

**O que BLOQUEIA o merge:**
- Bug ou regressão demonstrável.
- Violação de `05`/`11` (segurança) ou `09` (LGPD).
- Controle crítico sem teste que falhe se ele for removido.
- Violação de fronteira arquitetural (`03`) ou de padrão inegociável (`06`).
- Checklist do PR marcado sem verificação.

**O que é SUGESTÃO:** legibilidade, nomes, refatoração oportuna, alternativa de implementação, dúvida. Sugestão não trava merge — e inflar bloqueio corrói a autoridade de todos eles.

**Regras de conduta:**
- Comentário aponta `arquivo:linha`, o problema, **por que importa** e um caminho de correção.
- Estilo é do formatter: não se revisa formatação.
- Aprovação não é carimbo — **quem aprova assume corresponsabilidade** pelo que entrou.
- Divergência que não se resolve em duas rodadas vira conversa síncrona ou ADR, não thread infinita.
- **PR acima de ~600 linhas alteradas deve ser quebrado** — a taxa de detecção despenca e a revisão vira teatro.

## Pull Request

**Fluxo:** você faz commit e `git push -u origin <branch>`; a skill `preparar-pr` monta a descrição e **cria o PR** (`gh pr create`, sempre pronto para revisão, sem `--draft`); você revisa e faz o merge no GitHub.

**Limites mecânicos (hook):** `git commit`, `git push` e `gh pr merge` permanecem bloqueados. Liberados: `gh pr create` (via `preparar-pr`) e `gh issue create` (via `criar-issues`, com aprovação).

**Corpo do PR — fonte única: `.github/PULL_REQUEST_TEMPLATE.md`.** Este arquivo não duplica o template; alterações na estrutura do corpo são feitas lá. Como `gh pr create --body-file` **ignora** o template do repositório, a skill `preparar-pr` é obrigada a ler o arquivo e preencher as seções dele.

**Convenções do PR (estas sim moram aqui):**

- **Título:** Conventional Commits, derivado do prefixo da branch — `feat/12-cadastro` → `feat: cadastro de tarefas`.
- **Base:** sempre `main`, salvo PR de sub-branch para branch de épico.
- **Referência de issue:** `Closes #N` na seção "Issues relacionadas" — branch `epic/{N}-...` referencia o épico; `{tipo}/{N}-...` referencia a issue.
- **Labels:** mesma taxonomia das issues (`tipo:`, `prioridade:`), aplicadas ao PR quando úteis para o board.
- **Checklist:** itens verificáveis pela skill são marcados; os que dependem de julgamento humano ficam desmarcados para você conferir.
