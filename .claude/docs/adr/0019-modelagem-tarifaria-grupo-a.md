# ADR-0019 — Modelagem tarifária do Grupo A: aditiva, sem `ConsumerClass`

- **Data:** 2026-09-06
- **Status:** aceita
- **Branch/Issue relacionada:** issue #380, épico #379 (Fase 19 do roadmap)

## Contexto

Até a Fase 19, `BillingClass` (`B1`/`B2`/`B3`) era o único discriminador de propriedade, e conflacionava dois conceitos que `.claude/docs/O-Sistema-Eletrico-Brasileiro.md` trata como ortogonais: **subgrupo** (definido pela tensão de fornecimento) e **classe de uso** (transversal — residencial, industrial, comercial, rural...). O catálogo tarifário (`EnergyDistributor.tusdPerKwh`/`tePerKwh`, duas colunas planas) só suporta uma tarifa monômia por distribuidora, incapaz de representar o Grupo A (alta/média tensão): binômio (demanda + consumo), variando por subgrupo, modalidade e posto horário (RF25/RF26).

A Fase 19 exige resolver essa modelagem antes de qualquer cálculo — é a fundação de que as sub-issues seguintes (postos tarifários, demanda medida, tarifação binômia Verde, UI) dependem. É também o item de maior risco estrutural do roadmap: mexe na base do cálculo de custo (RF13) de todos os usuários atuais (Grupo B).

## Decisão

**Aditivo, não migratório.** O Grupo B permanece exatamente como está — `EnergyDistributor.tusdPerKwh`/`tePerKwh`, `Property.billingClass` e o caminho de leitura em `consumption.service.ts` continuam intocados. O Grupo A ganha uma estrutura nova e paralela:

- `Property` ganha `tariffGroup TariffGroup @default(GROUP_B)` (discriminador explícito, não inferido — é o campo que o `TariffService` vai ramificar por ele no binômio), `tariffSubgroup TariffSubgroup?` e `tariffModality TariffModality?` (nulos para Grupo B). `billingClass` passa de obrigatório a opcional — uma propriedade Grupo A não tem B1/B2/B3, e gravar um valor ali seria um dado falso no banco.
- Dois modelos novos, não um só com colunas nulas misturadas — RF26 já trata "tarifa de energia" e "tarifa de demanda" como conceitos distintos:
  - `TariffEnergyRate` (distribuidora × subgrupo × modalidade × posto, sempre por posto).
  - `TariffDemandRate` (distribuidora × subgrupo × modalidade × posto opcional — nulo para demanda única da Verde, RN18; Azul, Fase 20, populará `PEAK`/`OFF_PEAK` sem migração nova).
- `contractedDemandKw` **não** entra em `Property` nesta issue — pertence à sub-issue "Tarifação binômia Horária Verde" (#383), que é onde a obrigatoriedade "por modalidade" (RF25) é de fato validada e consumida.
- Validação cruzada por grupo (Grupo A exige subgrupo+modalidade e rejeita `billingClass`; Grupo B exige `billingClass` e rejeita subgrupo/modalidade) mora em `property.service.ts`, não no schema Zod — mesmo padrão já estabelecido pela RN01 do Medidor (`meter.service.ts`: regra cruzada que "o schema sozinho não expressa").

**Desvio do texto do roadmap: sem `ConsumerClass`.** O roadmap citava "`TariffGroup` + `TariffSubgroup` + `ConsumerClass` ou outra forma" como opções em aberto para esta ADR. Nenhuma regra já aprovada em `02-requisitos.md` (RN17–RN25, Fases 19/20) depende de classe de uso — ela só importaria para desconto rural ou Tarifa Social, e nenhum dos dois está no roadmap (ambos listados como "não pedido, não antecipado" nas fases seguintes). Introduzir `ConsumerClass` agora seria abstração sem consumidor real, contra o próprio princípio que a Fase 19 declara para si mesma ("cria-se a abstração quando um segundo consumidor real pede a mesma API, não especulativamente"). Fica para quando algo do roadmap de fato precisar dela.

## Alternativas consideradas

- **Migrar o Grupo B para dentro do novo catálogo** (unificação total, um catálogo só para os dois grupos) — descartada para esta issue: exigiria tocar `consumption.service.ts` e o fixture `distributorFixture.ts` usado por `property.service.test.ts`, arriscando o resultado de contas já em produção sem necessidade — nenhuma sub-issue da Fase 19 exige essa unificação. Pode ser revisitada quando a Fase 22 (Tarifa Branca) precisar reaproveitar o catálogo para Grupo B.
- **`ConsumerClass` como terceiro enum, conforme o texto original do roadmap** — descartada por falta de consumidor real (ver Decisão acima).
- **Um único modelo `TariffCatalogEntry` com colunas de energia e demanda, ambas nulas conforme o caso** — descartada: RF26 já trata os dois conceitos como distintos, e colunas nulas misturadas dificultam saber, por linha, qual delas é a válida.
- **CHECK constraint no Postgres para a obrigatoriedade condicional de subgrupo/modalidade** — descartada: o projeto não tem precedente desse mecanismo (RN01 do Medidor resolve o mesmo tipo de regra cruzada em `*.service.ts`); introduzir um mecanismo novo só para este caso não se paga.

## Consequências

- Positivas: testes de Grupo B (`tariff.service.test.ts`, `property.service.test.ts` para os casos B1/B2/B3) passam sem nenhuma edição — o contrato de regressão pedido pelo roadmap é satisfeito ao pé da letra, não só no resultado. O catálogo novo já nasce pronto para a Azul (Fase 20, posto preenchido em `TariffDemandRate`) e para a Branca (Fase 22, reaproveitando `TariffEnergyRate`/`TariffDemandRate` com subgrupo B1/B3) sem migração adicional.
- Negativas/custos: o Postgres trata cada `NULL` como distinto em índice único, então o `@@unique` de `TariffDemandRate` não impede duas linhas com `post` nulo para a mesma distribuidora/subgrupo/modalidade — documentado no schema; sem risco hoje porque o único gravador é o seed idempotente. Consequência direta e mais séria: o Prisma recusa em runtime usar `post: null` numa cláusula `where` de chave composta (`upsert`), então gravar/ler a demanda única da Verde exige `findFirst` + create/update manual (`seedGreenA4DemandRate` em `prisma/seed.ts`), não `upsert` — um caminho de escrita futuro (RF45, catálogo editável, ainda sem fase) precisa repetir esse padrão. O Grupo A e o Grupo B convivem como dois caminhos de armazenamento paralelos até uma eventual unificação — aceito conscientemente, não é dívida silenciosa.
- Não veio de `07-decisoes-em-aberto.md` — nenhuma atualização necessária lá.
