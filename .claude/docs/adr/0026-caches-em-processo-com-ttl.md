# ADR-0026 — Caches em processo com TTL para bandeira tarifária e catálogos de tarifa

- **Data:** 2026-10-12
- **Status:** aceita
- **Branch/Issue relacionada:** registrada depois da implementação (Fase 15); a trava de proporcionalidade do `03-arquitetura.md` exige uma ADR por cache.

## Contexto

Toda requisição de consumo e de simulação lia, no banco, a bandeira tarifária vigente e a distribuidora da propriedade, e o cálculo do Grupo A lê o catálogo de tarifas por distribuidora, subgrupo e modalidade. São dados que quase não mudam: o catálogo de distribuidoras e o de tarifas não têm caminho de escrita em runtime (entram por seed ou migração), e a bandeira muda uma vez por mês, por um único método de escrita.

O requisito foi medido na Fase 15 (`2026-08-25-baseline-desempenho-epico-b.md`, seção "Cache in-process de bandeira tarifária e catálogo de distribuidoras"): com o cache, `ConsumptionService.list()` passou de 6 para 4 queries a partir da segunda chamada no mesmo processo, exatamente as duas leituras eliminadas (`distributorRepository.findById` e `tariffFlagRepository.get()`).

## Decisão

Mantemos três caches em memória do processo, todos com TTL de 5 minutos e em nível de módulo, não de instância:

- `TariffFlagRepository` — a configuração de bandeira vigente. O `update()` (usado pelo sync automático da ANEEL e pela rota administrativa) invalida o cache; o TTL é só um backstop contra uma escrita fora da aplicação.
- `DistributorRepository` — distribuidoras por id.
- `TariffCatalogRepository` — quatro mapas (tarifas de energia, demanda única, demanda por posto e energia por posto), chaveados por distribuidora, subgrupo e modalidade.

O estado vive no módulo porque várias rotas instanciam o próprio repositório sobre o mesmo banco; um cache por instância deixaria a invalidação feita por uma rota invisível às outras.

## Alternativas consideradas

- **Sem cache** — mantém o custo de duas queries por requisição de consumo, sem ganho de consistência, porque os dados quase não mudam.
- **Cache compartilhado (Redis ou similar)** — resolveria a divergência entre processos, mas adiciona um componente de infra sem requisito que o justifique: hoje há um único processo de backend por ambiente.
- **Invalidação por evento nos catálogos** — não há evento a amarrar, pois não existe escrita em runtime; o TTL curto cobre a mudança por seed ou migração sem reiniciar o processo.

## Consequências

- Positivas: menos duas queries por requisição de consumo e simulação a partir da segunda, sem componente novo de infra.
- Negativas/custos: o ganho é por processo, e a primeira requisição depois de um boot ou deploy paga o custo cheio (cache frio). Uma escrita fora da aplicação, ou feita por outro processo, só aparece depois de até 5 minutos.
- **Condição de revisão:** com mais de um processo de backend, a bandeira pode ficar até 5 minutos diferente entre eles depois de uma troca. Se isso passar a importar, a alternativa é um cache compartilhado ou invalidação entre processos, o que exige nova ADR.
- Não veio de `07-decisoes-em-aberto.md`; nenhum item a remover lá.
