# ADR-0021 — Bandeira tarifária não incide no Mercado Livre de Energia (ACL)

- **Data:** 2026-09-09
- **Status:** aceita
- **Branch/Issue relacionada:** spike #395, épico #394 (Fase 21 do roadmap)

## Contexto

`TariffService.calculateForGroupA` hoje aplica `flagBrl = totalKwhConsumed × (flagPer100Kwh / 100)` incondicionalmente sobre o consumo medido, antes dos tributos — correto para o Grupo A cativo (ACR), o único ambiente de contratação que o produto modela até a Fase 20. A Fase 21 introduz o Ambiente de Contratação Livre (ACL): `Property.contractingEnvironment` e um `AclContract` com TE negociada bilateralmente entre o consumidor e a comercializadora.

O documento de referência do projeto (`O-Sistema-Eletrico-Brasileiro.md`, linha 335) afirma que "bandeira não se aplica à TE... mas se aplica à TUSD" no Mercado Livre — texto que motivou este spike porque destoa do mecanismo: a bandeira recompõe o custo de geração que a distribuidora incorre comprando energia no ambiente regulado, custo que o consumidor ACL não gera para a distribuidora, já que compra energia diretamente do próprio fornecedor em contrato bilateral. É pré-requisito de todo item de cálculo desta fase (#396–#400): decidir antes de qualquer linha de fórmula, mesma disciplina já aplicada no spike de bandeira da Fase 8 (ADR-0007).

## Investigação

- **REN 1.000/2021 (ANEEL), Art. 2º, inciso II**, define bandeiras tarifárias como o "sistema que tem como finalidade sinalizar os custos atuais da geração de energia elétrica ao consumidor por meio da tarifa de energia" — o mecanismo normativo é estruturalmente amarrado à **TE** (tarifa de energia), não à TUSD (tarifa de uso do sistema de distribuição, remuneração do fio). Não foi localizado, no texto disponível da resolução, um artigo que trate nominalmente a incidência sobre consumidores ACL — a regra geral do Art. 2º, II já sustenta a inferência mecânica abaixo.
- Múltiplas fontes de mercado (comercializadoras que operam no ACL e imprensa especializada) convergem, sem dissenso encontrado, para a mesma conclusão: consumidores do mercado livre não são cobrados de bandeira tarifária, porque o preço da energia é negociado bilateralmente, fora do sistema regulado que a bandeira sinaliza. Uma delas é explícita — "não está sujeito à cobrança do adicional da bandeira tarifária" — sem distinguir TUSD/TE, ou seja, exclusão total, não parcial.
- Nenhuma fonte consultada (regulatória ou de mercado) sustenta a aplicação parcial (bandeira só sobre a TUSD) que o documento de referência do projeto descrevia. A leitura mais provável para a origem do erro: confundir "o consumidor ACL continua pagando TUSD" (verdadeiro — a TUSD remunera o fio, devida independente do ambiente de contratação) com "a bandeira incide sobre essa TUSD" (não sustentado por nenhuma fonte encontrada).
- Fontes consultadas via busca web em 2026-09-09: reportagem sobre bandeira amarela e mercado livre (O Tempo, abr/2025); FAQ pública de comercializadora do mercado livre (mercadolivredeenergia.com.br). Nenhuma cita um número de REN específico para a exclusão em si — a fundamentação normativa direta disponível é a definição do Art. 2º, II da REN 1.000/2021 citada acima, combinada com o consenso das fontes de mercado sobre o resultado prático.

## Decisão

A bandeira tarifária **não incide no ACL** — nem sobre a TE (negociada bilateralmente, fora do sistema que a bandeira sinaliza), nem sobre a TUSD (a bandeira nunca foi um componente da TUSD, cativo ou livre — ela é estruturalmente um acréscimo à tarifa de energia, Art. 2º, II da REN 1.000/2021). `TariffService`/`ConsumptionService` devem deixar de aplicar `flagBrl` quando `Property.contractingEnvironment = ACL`. O documento de referência do projeto é corrigido nesta mesma branch para refletir esta decisão.

## Alternativas consideradas

- **Bandeira incide só sobre a TUSD no ACL** (a leitura literal do documento de referência) — descartada: nenhuma fonte externa consultada sustenta essa aplicação parcial, e ela contraria a definição normativa (a bandeira é veiculada pela tarifa de energia, não pela TUSD).
- **Manter a aplicação incondicional atual** (bandeira sobre todo consumo, ACR e ACL indistintamente) — descartada: contradiz de forma consistente todas as fontes de mercado consultadas, que tratam "sem bandeira" como vantagem estrutural e amplamente divulgada da migração para o mercado livre.

## Consequências

- Positivas: a fórmula do item "Cálculo binômio ACL" (#398) fica mais simples do que o objetivo original presumia — não precisa portar `flagPer100Kwh` para o caminho ACL, só compor TUSD (catálogo) + TE (contrato) + ultrapassagem/ERE (generalizados na Fase 20) + tributos.
- Negativas/custos: a fundamentação normativa direta disponível é a definição geral do Art. 2º, II da REN 1.000/2021 mais a convergência de fontes de mercado, não um artigo que trate o ACL nominalmente — se a ANEEL publicar norma específica contradizendo esta leitura, a decisão precisa ser revisitada (issue nova, não retrabalho silencioso desta ADR).
- Não veio de `07-decisoes-em-aberto.md` — nenhuma atualização necessária lá.
