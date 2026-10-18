# ADR-0022 — Grandezas medidas × calculadas: datasheet do medidor-alvo (CCK 7200D)

- **Data:** 2026-09-23
- **Status:** aceita
- **Branch/Issue relacionada:** planejamento da Fase 25 do roadmap (ainda sem épico/issue aberta)

## Contexto

A Fase 25 (Telemetria ampliada) estende `IoTDataProcessor` e `MeterReading` para o conjunto ampliado de grandezas elétricas por fase listado em FNC010 (tensão por fase e fase-neutro média, desequilíbrio, corrente por fase e de neutro, potência ativa total e por fase, reativa, aparente, frequência, fator de potência por fase, THD de tensão e corrente por fase). O `07-decisoes-em-aberto.md` bloqueava o detalhamento dessa fase com a pergunta: dessas grandezas, quais o medidor real **mede** e quais ele **calcula internamente**? A resposta define o que a ingestão persiste como valor medido e o que precisaria ser derivado no pipeline — persistir um campo derivado como se fosse medido, ou recalcular o que o próprio medidor já entrega pronto, são erros de direção opostos e caros de reverter depois que houver histórico gravado (`MeterReading` é append-only por natureza de série temporal).

O usuário forneceu o modelo concreto cotado para testes físicos futuros da aplicação — **CCK 7200D** (`cckautomacao.com.br/produto/medidor-de-energia-cck-7200d/`) — e, nesta sessão, a tabela de especificações técnicas e a tabela de grandezas medidas do datasheet real (texto, não mais a versão em imagem que uma tentativa anterior de leitura automatizada não conseguiu extrair). Classe de exatidão 0,2%; comunicação TCP/IP e RS-485 simultâneos; protocolos Modbus TCP/RTU (Bacnet e DNP3 opcionais); harmônicas de tensão e corrente até a 35ª ordem.

Cruzando a tabela de grandezas medidas do CCK 7200D com a lista de FNC010:

| Grandeza de FNC010 | No datasheet do CCK 7200D |
| --- | --- |
| Tensão por fase | ✅ medida (coluna FASE1/2/3) |
| Tensão fase-neutro média | ✅ medida (coluna 3Ø) — já é o papel de `avgVoltage`, existente desde a fundação |
| **Desequilíbrio de tensão** | ❌ **sem registrador** — não há linha "desequilíbrio" na tabela |
| Corrente por fase | ✅ medida (coluna FASE1/2/3) |
| **Corrente de neutro** | ❌ **sem registrador** — a tabela só tem colunas FASE1/2/3 e 3Ø, sem coluna de neutro |
| Potência ativa total e por fase | ✅ medida (linha "Watt", todas as colunas) |
| Potência reativa | ✅ medida (linha "var", todas as colunas) |
| Potência aparente | ✅ medida (linha "VA", todas as colunas) — não é calculada a partir de ativa+reativa, o medidor mede diretamente |
| Frequência | ✅ medida (coluna 3Ø apenas — o medidor não mede frequência por fase, mas FNC010 também não pede isso) |
| Fator de potência por fase | ✅ medido (todas as colunas) |
| THD de tensão por fase | ✅ medido (coluna FASE1/2/3, "•") |
| THD de corrente por fase | ✅ medido (coluna FASE1/2/3, "•") |

## Decisão

**Confirmado por datasheet real, não mais por premissa:** o LumiTrack trata o medidor-alvo como medindo nativamente **quase todas** as grandezas de FNC010 — sem lógica de derivação no pipeline de ingestão para elas. `IoTDataProcessor` e os adaptadores de protocolo recebem e repassam cada uma como amostra bruta do medidor; `MeterReading` persiste cada uma como valor medido.

**Duas exceções, tratadas de forma diferente entre si:**

1. **Desequilíbrio de tensão** — o medidor não o mede, mas o pipeline **calcula** a partir das três tensões de fase (que são medidas), usando a fórmula padrão (desvio máximo da média ÷ média × 100) — a mesma já usada como referência no protótipo de design (`gzUnbal` em `LumiTrack Home v2.dc.html`). Não é "inventar" uma grandeza: é derivar de dado efetivamente medido, com fórmula normativa conhecida e sem ambiguidade de implementação. O valor calculado é persistido em `MeterReading` (não recalculado a cada leitura da API) para a agregação de série (item de UI da Fase 25) não precisar reconstruir as três fases toda vez.
2. **Corrente de neutro** — o medidor não a mede, **e não há como derivá-la com confiança** a partir do que ele expõe: exigiria soma fasorial das três correntes de fase, que depende do ângulo de fase entre elas — informação que o datasheet não lista como disponível (só fator de potência agregado por fase, não o ângulo puro). Fica **sempre ausente** — RN34 exibe "-" — até uma decisão futura (ex.: medidor com CT de neutro dedicado). Diferente do desequilíbrio: não existe uma fórmula fechada e sem ambiguidade aplicável aqui, então calcular seria uma estimativa, não uma derivação — o mesmo erro de direção que a ADR evita para o resto do conjunto.

RN34 (grandeza ausente exibida como "-", nunca como zero) permanece válida e ativa para qualquer medidor futuro que não reporte algum campo — e é o mecanismo permanente para corrente de neutro.

## Alternativas consideradas

- **Todas as grandezas sem exceção são tratadas como medidas, sem nenhum cálculo no pipeline** — descartada: entraria em contradição direta com o próprio datasheet fornecido (desequilíbrio simplesmente não existe como registrador), e recusar o cálculo do desequilíbrio jogaria fora uma grandeza que FNC010 pede e que é derivável sem ambiguidade das três tensões já medidas.
- **Calcular também a corrente de neutro** (soma fasorial aproximada, assumindo ângulos de fase equilibrados a 120°) — descartada: a aproximação erraria sistematicamente em qualquer carga desequilibrada — justamente o caso em que a corrente de neutro mais importa ser mostrada corretamente. Uma estimativa errada é pior do que "-".
- **Medidor mede um subconjunto maior e deriva mais coisas (ex.: potência aparente de ativa+reativa)** — descartada: o datasheet mostra que VA é medido diretamente (linha própria na tabela), não haveria por que recalcular o que o próprio equipamento já entrega pronto.

## Consequências

- Positivas: desbloqueia o detalhamento completo da Fase 25 com uma base verificada, não presumida. O pipeline de ingestão permanece simples para 20 das 22 grandezas novas (mapeamento 1:1 registrador → campo, sem lógica de derivação); só o desequilíbrio tem uma etapa de cálculo, isolada e com fórmula fechada.
- Negativas/custos: corrente de neutro fica permanentemente como "-" para o CCK 7200D e para qualquer medidor da mesma classe — se um usuário realmente precisar desse dado (ex.: diagnóstico de desequilíbrio de carga monofásica numa instalação trifásica), o produto não atende até um medidor com CT de neutro dedicado entrar no catálogo, o que reabriria esta ADR. O cálculo de desequilíbrio, sendo feito no pipeline (não no medidor), precisa de teste próprio (casos de borda: as três fases não vêm todas na mesma amostra/minuto — decidir na implementação se o cálculo espera o balde de minuto fechado com as três médias, ou se falha fechado para "-" quando alguma fase está ausente naquele balde).
- Resolve o item "Grandezas medidas × calculadas pelo medidor" de `07-decisoes-em-aberto.md` — removido de lá.
