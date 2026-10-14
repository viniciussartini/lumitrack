# ADR-0027 — `meter_readings`: manter a retenção de 365 dias e as 22 colunas, com ajustes baratos

- **Data:** 2026-10-13
- **Status:** aceita
- **Branch/Issue relacionada:** `perf/535-meter-readings-medida` (#535); achado A-02 de `2026-10-10-desempenho-audit.md`.

## Contexto

Com as 22 grandezas por fase (ADR-0022), a linha de `meter_readings` ficou mais larga. O baseline `2026-10-13-baseline-desempenho-meter-readings.md` mediu, em 5.702.400 linhas (11 medidores × 12 meses) e na VPS:

- **570 B por linha com índices** (372,5 B na tabela), contra ~401 B no esquema de 12 colunas que a VPS ainda roda. Em regime, a retenção de 365 dias chega a **~3,1 GiB** (15.840 linhas/dia × 570 B ≈ 8,6 MiB/dia), contra ~2,0 GiB na VPS, extrapolados de 40 dias medidos (5,6 MiB/dia). Os índices são 35% do total.
- **O `DELETE` de expurgo do pior caso** (tabela inteira, retenção ligada pela primeira vez ou expurgo represado) levou 97–104 s, contra o teto de `RETENTION_PURGE_STATEMENT_TIMEOUT_MS = 120000`: folga de **~1,15–1,24×** (eram ~2,5× com a linha estreita). O expurgo diário normal, de um dia de linhas, leva 136 ms; um represamento de 30 dias leva 47 s.
- **A leitura sem janela** (varredura da tabela inteira) é o custo dominante do Painel, mas é tratada pelas janelas do #518, não pelo armazenamento.

Os ambientes são permanentemente sintéticos (ADR-0014): o volume cresce com o tempo corrido, não com adoção de usuário real, então o teto é conhecido e estável. A VPS fecha o ano em ~3,1 GiB, que cabe: o volume do Postgres tem 185 GiB livres de 193 GiB. O staging, no plano gratuito do Neon (0,5 GB), não comporta o volume cheio.

As grandezas por fase servem às séries e à comparação de períodos, mas o teto de 92 dias do código (`MAX_COMPARE_PERIOD_DAYS`, `MAX_REPORT_PERIOD_DAYS`) limita o **tamanho do período**, não a **idade** do dado: um período pode cair em qualquer dia dos últimos 365.

## Decisão

Mantemos `meter_readings` como está: retenção de 365 dias, 22 colunas na mesma tabela, sem rollup e sem tabela irmã. Em vez de mudar a estrutura, fazemos dois ajustes baratos:

- **Expurgo em lotes** no `MeterReadingRepository.deleteOlderThan`, para recuperar a folga contra o teto de 120 s em um represamento longo. Vira issue nova.
- **Retenção menor só no staging**, pela variável `DATA_RETENTION_METER_READING_DAYS` que já existe, para o banco caber no plano gratuito do Neon. É configuração do ambiente, sem código; o valor é do usuário, a partir do tamanho real do Neon (não medido): a 8,6 MiB/dia, 30 dias são ~260 MiB (estimativa). **A ordem importa:** o expurgo em lotes entra antes da redução. O primeiro expurgo depois de baixar a retenção apaga o excedente de uma vez (o represamento que o baseline mede: 47 s para 30 dias no local, número otimista para o Neon, cuja computação é bem menor); se um `DELETE` estoura o teto de 120 s ele é revertido inteiro, e o do dia seguinte é ainda maior, então o expurgo não converge e o banco segue crescendo. Sem o expurgo em lotes, a redução teria de ser feita em degraus.

## Alternativas consideradas

- **Rollup horário/diário com minuto curto (~92 dias)** — reduz o regime para ~0,8 GiB (92 dias × 15.840 linhas × 570,4 B = 0,77 GiB, mais o agregado, desprezível), mas é tamanho L (tabela, job, backfill, consistência, mudança em `consumption.repository.ts`) e resolve um problema que a VPS não tem: 3,1 GiB cabem. Reabrir se a condição de revisão abaixo se cumprir.
- **Tabela irmã para as 22 colunas** — a principal cairia para ~395 B/linha (197 B de tabela, medidos na VPS no esquema de 12 colunas, mais 198 B de índices: 1.076 MiB / 5.702.400 linhas), ou 395 × 15.840 × 365 = 2,28 × 10⁹ B = ~2,1 GiB, e as consultas leriam ~1,9× menos páginas (372,5 / 197), mas exige migração que reescreve 5,7 M linhas e mexer no upsert do worker e em todos os leitores das 22 colunas. As janelas do #518 já tiram o custo de leitura do Painel, que era o ganho principal.
- **Zerar as 22 colunas depois de N dias** — economia estimada de ~23% (92 dias × 15.840 × 570,4 B = 0,77 GiB, mais 273 dias × 15.840 × 395 B = 1,59 GiB, dá 2,36 GiB contra 3,07 GiB, supondo que a linha zerada fique do tamanho da linha estreita medida na VPS), mas o espaço só volta ao reúso depois do vacuum, o `UPDATE` de milhões de linhas é pesado (cria uma nova versão de cada linha) e os períodos antigos perdem as séries e os relatórios por fase, o que muda o produto.
- **Reduzir a retenção em produção** — quebraria o histórico de 12 meses e a granularidade anual das telas de Análise, que leem `meter_readings`.

## Consequências

- Positivas: nenhuma tabela, job ou migração nova; o custo de armazenamento da VPS segue trivial (~3,1 GiB/ano); as duas mudanças são pequenas, mas **não são independentes**: a retenção menor no staging depende do expurgo em lotes (ou de degraus), como descrito na Decisão.
- Negativas/custos: a tabela fica ~1,4× maior que hoje na produção (de ~401 para ~570 B/linha) quando a promoção levar a migração; o `DELETE` do pior caso continua perto do teto até o expurgo em lotes entrar, e o staging precisa de retenção própria enquanto estiver no plano gratuito. A chave primária `id` (417 MiB, 13% do total) e o índice único seguem redundantes; trocá-los por uma chave composta é uma otimização possível, fora desta decisão.
- **Condição de revisão:** reabrir esta ADR (rollup ou tabela irmã) se (a) o disco da VPS passar a ser restrição real, (b) o expurgo em lotes não devolver margem confortável ao teto, (c) as telas de Análise com períodos longos passarem a pesar depois das janelas do #518 ou (d) um ambiente com usuário real invalidar a ADR-0014, passando o volume a escalar com o número de medidores.
- Não veio de `07-decisoes-em-aberto.md`; nenhum item a remover lá.
