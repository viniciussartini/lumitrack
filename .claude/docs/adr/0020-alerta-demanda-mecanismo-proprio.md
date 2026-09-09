# ADR-0020 — Alerta de ultrapassagem de demanda: mecanismo próprio, sem reaproveitar Alert/AlertEvaluator

- **Data:** 2026-09-07
- **Status:** aceita
- **Branch/Issue relacionada:** issue #392 (Fase 20)

## Contexto

O produto já tinha um mecanismo de alerta — `Alert`/`AlertEvaluator` — que dispara quando a potência ativa de um medidor sai de uma faixa `[referência × (1 ± tolerância)]`. A avaliação roda amostra a amostra (a cada leitura elétrica recebida) e usa histerese assimétrica por contagem de amostras consecutivas (abre após 3 fora da faixa, fecha após 5 dentro dela) para absorver ruído de curta duração de um sinal contínuo.

O novo requisito — avisar o usuário quando a demanda medida se aproxima ou ultrapassa a demanda contratada — parecia, à primeira vista, só mais um tipo de alerta. Mas a fonte do sinal é outra: `MeterDemandRollup`, um agregado mensal que guarda apenas o **máximo já observado no ciclo de faturamento corrente**, atualizado por `UPSERT ... GREATEST(...)` — nunca decresce dentro do mês. Não existe "voltar para dentro da faixa" a meio do ciclo: uma vez que a demanda medida ultrapassa a contratada, o agregado permanece ultrapassado até a virada do mês.

## Decisão

Construir um mecanismo próprio: modelo `DemandAlert` (config: medidor, limiar, habilitado) + `DemandAlertScheduler`, scheduler irmão do `DemandRollupScheduler` que roda 1×/minuto e lê `MeterDemandRollup` do ciclo corrente, em vez de estender `Alert`/`AlertEvaluator`. Idempotência via um único campo (`lastNotifiedPeriodStart`, no máximo 1 notificação por ciclo de faturamento) — sem máquina de episódio nem histerese. Notifica pelos mesmos primitivos que `AlertEvaluator` já usa (`NotificationStore.add` + `UserEventHub.emit`), sem canal novo.

## Alternativas consideradas

- **Estender `Alert` com um discriminador de tipo** (`referencePowerKw`/`tolerancePercent` viram nullable, novo tipo "demanda" ao lado de "potência") — descartada: a histerese por amostra consecutiva do `AlertEvaluator` não tem sentido para um agregado que só cresce dentro do ciclo (não há "amostra" para contar nem flapping para amortecer); reaproveitar exigiria um segundo motor de avaliação inteiro dentro da mesma classe, perdendo a maior parte do ganho de reaproveitar em primeiro lugar.
- **Avaliar a demanda dentro do próprio `DemandRollupScheduler`** — descartada por responsabilidade: aquele scheduler só persiste o rollup; misturar notificação de usuário no mesmo tick violaria a separação já estabelecida entre "calcular o agregado" e "reagir a ele", e complicaria testá-los isoladamente.

## Consequências

- Positivas: dois mecanismos de alerta com formas de sinal genuinamente diferentes (contínuo com ruído × agregado monotônico) ficam cada um com o motor de avaliação adequado ao seu sinal, sem gambiarra de compatibilidade. `resolveContractedDemands`/`measuredDemandKwFor` (extraídos para `shared/tariff/contractedDemand.ts`) garantem que o alerta e o cálculo de custo comparem exatamente a mesma demanda medida contra a mesma contratada.
- Negativas/custos: o sistema passa a ter dois caminhos de notificação paralelos (`AlertEvaluator` e `DemandAlertScheduler`) em vez de um só — quem for entender "como uma notificação chega ao usuário" precisa saber que existem dois produtores. Mitigado por ambos convergirem no mesmo `NotificationStore`/`UserEventHub` na ponta de saída.
- Um terceiro tipo de alerta (ex.: meta de consumo, Fase 28) deve decidir de novo, caso a caso, se o sinal se parece mais com o contínuo-com-ruído ou com o agregado-monotônico — este ADR não cria um framework genérico de "alerta", só documenta por que os dois mecanismos atuais são de fato distintos.
