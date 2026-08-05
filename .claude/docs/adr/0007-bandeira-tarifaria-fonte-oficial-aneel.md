# ADR-0007 — Bandeira tarifária vigente a partir da fonte oficial ANEEL

- **Data:** 2026-08-04
- **Status:** aceita
- **Branch/Issue relacionada:** spike #142, épico #134 (Fase 8 do roadmap)

## Contexto

`TariffFlagConfig` é um singleton (`id` fixo = 1) com `currentFlag` e os quatro acréscimos em R$/100 kWh (`greenPer100Kwh`, `yellowPer100Kwh`, `redP1Per100Kwh`, `redP2Per100Kwh`), lido por `GET /api/tariff-flag` (qualquer usuário autenticado) e atualizado manualmente por `PUT /api/tariff-flag` (`requireRole("ADMIN")` —
`backend/src/modules/tariff-flag/`). A bandeira muda mensalmente por decisão da ANEEL; hoje alguém precisa lembrar de atualizar o valor todo mês. Esta issue é só a investigação — nenhum código de produção foi alterado aqui.

## Investigação

**Candidato avaliado:** Portal de Dados Abertos da própria ANEEL (`dadosabertos.aneel.gov.br`), dataset **"Bandeiras Tarifárias"**. O portal genérico do governo federal (`dados.gov.br`) foi checado à parte — ele cataloga outros datasets da ANEEL (tarifas médias, CDE, P&D), mas **não tem um dataset próprio de bandeira tarifária**; a fonte real e única para este dado é o portal dedicado da ANEEL, confirmado por uma nota oficial da agência ("Dados de Bandeiras Tarifárias [...] agora estão no Portal de Dados Abertos da ANEEL", 2023). Nenhum outro candidato (dados publicados por distribuidoras individualmente) foi investigado a fundo —
seria N integrações em vez de 1, pior em toda dimensão avaliada abaixo.

O dataset é servido por um portal CKAN padrão, com **DataStore API** (REST, JSON, sem autenticação) sobre dois recursos relevantes:

| Recurso | `resource_id` | Cadência real observada | Conteúdo |
|---|---|---|---|
| Bandeira Tarifária - Acionamento | `0591b8f6-fe54-437b-b72b-1aa2efd46e42` | Mensal — dado mais recente observado em 2026-07-01 (verificado em 2026-08-04) | Por competência (mês): qual bandeira esteve ativa + o valor daquela bandeira |
| Bandeira Tarifária - Adicional | `5879ca80-b3bd-45b1-a135-d9b77c1d5b36` | Irregular, por Resolução Homologatória (REH) — a mais recente é REH nº 3.306/2024, vigente desde 2024-04-01, sem mudança desde então | Por resolução: o valor de **cada** modalidade (Amarela, Vermelha P1, Vermelha P2) vigente a partir daquela data |

Consultados via `GET https://dadosabertos.aneel.gov.br/api/3/action/datastore_search?resource_id={id}` — endpoint público, sem necessidade de credencial ou cadastro.

**Achados que definem o desenho da integração:**

1. **Nenhum dos dois recursos sozinho cobre o critério de aceite** ("as 4 modalidades com valor por 100 kWh"). O "Acionamento" só traz a bandeira **ativa** do mês (uma linha, um valor) — não as outras 3. O "Adicional" traz as 3 modalidades com acréscimo (Amarela/Vermelha P1/Vermelha P2), mas só muda quando a ANEEL publica uma nova REH — **não é uma leitura por mês, é uma leitura por período de vigência**. A bandeira Verde nunca aparece no "Adicional" porque não tem acréscimo (valor implícito = 0). Uma sincronização real precisaria combinar os dois: `currentFlag` vem do "Acionamento" (competência mais recente); os 3 valores não-zero vêm do "Adicional" (linha mais recente por modalidade, filtrando por `DatVigencia` ≤ hoje); `greenPer100Kwh` é sempre 0.
2. **Descasamento de unidade:** o campo de valor é `VlrAdicionalBandeiraRSMWh` — **R$ por MWh**, não R$ por 100 kWh como o schema já usa. Conversão: `valor_100kwh = valor_mwh / 10` (1 MWh = 10 × 100 kWh). Verificado contra os valores já semeados em `backend/prisma/seed.ts` (`yellowPer100Kwh: 1.885`,`redP1Per100Kwh: 4.463`, `redP2Per100Kwh: 7.877`) — batem exatamente com a REH nº 3.306/2024 (18,85 / 44,63 / 78,77 R$/MWh ÷ 10), ou seja: o seed atual **já foi originado desta mesma fonte**, o que dá confiança alta na leitura e na conversão.
3. **Qualidade de dado observada:** ao menos um valor retornado veio malformado (bandeira Verde no "Acionamento" com `VlrAdicionalBandeira` = `",00"` em vez de `"0,00"`) — parsing precisa ser defensivo, não assumir formato numérico limpo. Reforça a exigência de falha fechada já prevista no item "Sincronização automática" do roadmap: erro de parse não pode virar `NaN`/zerar a bandeira, deve reter o último valor válido conhecido e registrar o erro.
4. **Licença:** Open Data Commons Open Database License (ODbL) — uso e redistribuição livres com atribuição; não há restrição relevante para consumo interno (não estamos republicando o dataset, só lendo valores para cálculo de custo).
5. **Sem SLA documentado.** É infraestrutura de dados abertos de governo, "best effort" — não há garantia formal de disponibilidade. Reforça que a sincronização deve ser **best-effort com fallback**, nunca um caminho crítico síncrono (ex.: nunca bloquear `GET /api/tariff-flag` esperando a ANEEL responder).

## Decisão

**Viável.** Vamos considerar o Portal de Dados Abertos da ANEEL (`dadosabertos.aneel.gov.br`, DataStore API dos recursos "Acionamento" + "Adicional" do dataset "Bandeiras Tarifárias") a fonte oficial para a sub-issue #143 (sincronização automática, condicional a este ADR). O desenho de #143 deve:

- Isolar o cliente HTTP num adapter de infraestrutura (o domínio não conhece CKAN nem a URL da ANEEL — `06-code-quality-standards.md`).
- Combinar os dois recursos conforme o achado 1 acima; validar a resposta com Zod na borda (todo input externo é não confiável, `05-security-standards.md`).
- Converter R$/MWh → R$/100 kWh (achado 2) com teste cobrindo o valor exato observado nesta investigação.
- Falhar fechado: indisponibilidade, timeout ou payload inesperado **mantém o último valor conhecido** e registra o erro — nunca zera, nunca adivinha (achados 3 e 5).
- Preservar `PUT /api/tariff-flag` como override manual — a automação não pode ser o único caminho para corrigir um valor errado.
- Sincronizar em cadência diária (ou menor), não em tempo real — a bandeira não muda intramês, e não há necessidade de acoplar a disponibilidade da ANEEL ao caminho de leitura do usuário.
- Registrar auditoria de cada troca (valor anterior, novo, origem manual ou automática, quando) — hoje só existe o caminho manual.

## Alternativas consideradas

- **Portal Brasileiro de Dados Abertos (`dados.gov.br`)** — descartado:
  não tem dataset próprio de bandeira tarifária; a ANEEL migrou esse dado para o portal dedicado dela em 2023, e é a fonte real por trás de qualquer entrada que o portal genérico eventualmente cite.
- **Dados publicados individualmente por distribuidoras** — descartado
  sem investigação profunda: seria N integrações heterogêneas (uma por distribuidora) para o mesmo dado nacional único, pior em manutenção, consistência e confiabilidade do que uma fonte federal única.
- **Manter só o `PUT` manual (não integrar)** — não escolhida, mas seria a alternativa válida se a investigação tivesse concluído pela inviabilidade; não foi o caso aqui.

## Consequências

- Positivas: existe um caminho concreto e verificado (não hipotético) para eliminar a atualização manual mensal; a fonte é gratuita, sem credencial, e os valores já batem exatamente com o que o sistema usa hoje, o que reduz o risco de #143 ser uma surpresa.
- Negativas/custos: **primeira dependência externa de terceiro em runtime no backend** (mesmo risco já sinalizado no roadmap) — API de governo sem SLA formal, exige sincronização best-effort + fallback, não uma chamada síncrona ingênua. A integração não é "1 chamada, 1 valor" — exige combinar 2 recursos com cadências diferentes, o que é mais lógica do que o critério de aceite original sugeria à primeira vista. Parsing precisa ser defensivo (achado 3).
- Não veio de `07-decisoes-em-aberto.md` — nenhuma atualização necessária lá.
