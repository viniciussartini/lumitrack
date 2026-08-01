---
name: planejar-roadmap
description: Cria ou atualiza o roadmap de implementação do projeto a partir dos requisitos e do contexto, produzindo .claude/docs/roadmap.md com fases, prioridades (P0/P1/P2) e tamanhos (XS–XL). Use SEMPRE que o usuário pedir "planeja a implementação", "monta o roadmap", "o que construir primeiro", "prioriza as features", "planejamento do MVP" ou, após concluir uma fase, "atualiza o roadmap". Produz o documento para aprovação — NÃO cria issues (isso é o Modo 3 da skill criar-issues) nem implementa nada.
---

# Skill: Planejar Roadmap de Implementação

Transforma os requisitos em um **plano de implementação ordenado** — o documento vivo que responde "o que construir primeiro e por quê".

## Antes de começar — leia o contexto

1. `.claude/project_context/01-descricao.md` e `02-requisitos.md` — o que o MVP precisa entregar (RFs/RNFs/FNCs).
2. `03-arquitetura.md` e `04-tech-stack.md` — módulos e restrições.
3. `07-decisoes-em-aberto.md` — decisões pendentes são **fontes de risco** a atacar cedo.
4. Se `.claude/docs/roadmap.md` já existir, este é um **ciclo de atualização** (ver abaixo), não uma criação.

## Regras de planejamento

- **Fatiamento VERTICAL, nunca horizontal:** cada item atravessa banco → API → UI e entrega um comportamento completo e testável ("usuário cria e vê uma tarefa" inteiro, ainda que mínimo). PROIBIDO fatiar por camada técnica ("todos os models, depois todas as APIs") — isso adia o primeiro comportamento funcionando para o fim.
- **Priorização por 3 critérios combinados:**
  1. *Dependência técnica* — o que destrava o resto vem antes (ex.: auth antes do que exige usuário logado).
  2. *Risco/incerteza primeiro* — itens que podem invalidar o design (integração incerta, decisão do `07`) entram cedo, enquanto mudar é barato.
  3. *Valor para o MVP* — o caminho crítico do usuário antes dos nice-to-have.
- **Dependência de design:** item com UI tem como pré-condição o **handoff pronto no Claude Design** (`.claude/design/` — ver `10-design-system.md`). Registre em "Depende de:"; se o design ainda não existe, sinalize no item ("aguardando design") para o usuário produzi-lo antes da fase chegar — evita fase P0 travada.
- **Rastreabilidade:** cada item referencia os RFs/FNCs do `02` que cobre. Todo RF do MVP deve aparecer em alguma fase (ou ser explicitamente adiado, com justificativa).
- **Sem estimativas de calendário.** Use as convenções do GitHub Projects:
  - **Priority:** `P0` (crítico p/ MVP, bloqueia o resto) · `P1` (importante, próximo) · `P2` (desejável, depois).
  - **Size:** `XS · S · M · L · XL` (tamanho relativo de esforço). Item `XL` é sinal de que deve ser quebrado em itens menores.
- Decisões de sequenciamento não-óbvias (por que X antes de Y) → registrar a justificativa no próprio roadmap; se for decisão arquitetural, ADR.

## Saída — `.claude/docs/roadmap.md`

```
# Roadmap de Implementação — {NOME DO PROJETO}
> Documento vivo. Atualizado ao fim de cada fase. Fonte: 02-requisitos.md.
> Última atualização: {DATA} · Fase atual: {N}

## Visão geral das fases
| Fase | Objetivo (comportamento entregue) | Status |

## Fase 1 — {objetivo}
### {item vertical}
- **Comportamento:** o que o usuário consegue fazer ao final.
- **Cobre:** RF01, FNC002...
- **Priority:** P0 · **Size:** M
- **Critérios de aceite:** (viram os primeiros testes — ATDD-lite)
- **Depende de:** — / {item}
- **Risco/observações:** ...

## Fases seguintes (menos detalhadas — serão refinadas ao chegar)
## RFs adiados do MVP (com justificativa)
## Justificativas de sequenciamento
```

Detalhe **apenas a fase atual** por completo; fases futuras ficam em nível de objetivo — elas VÃO mudar quando a realidade das fases anteriores chegar (planejamento just-in-time, mesmo YAGNI do `06`).

## Modo de trabalho

Apresente o roadmap como **proposta para aprovação** — inclua os trade-offs de priorização que você fez e as perguntas em aberto. Só grave `.claude/docs/roadmap.md` após o usuário aprovar.

## Ciclo de atualização (fase concluída)

1. Marque a fase como concluída na visão geral (cruze com o `CHANGELOG.md` e as issues fechadas).
2. Detalhe a próxima fase (promova de objetivo para itens completos), reavaliando prioridades com o que se aprendeu.
3. Registre o que mudou em relação ao plano anterior (e por quê) — o histórico de replanejamento é aprendizado.

## Ao concluir

Siga `.claude/project_context/08-convencoes-git.md`:
1. Entrada em `.claude/log/CHANGELOG.md` (tipo `docs`, com a branch atual): "roadmap criado/atualizado (fase N)".
2. Texto de commit: `docs: roadmap de implementação (fase {N})`.
3. Ofereça abrir as issues da fase atual via skill `criar-issues` (Modo 3).
