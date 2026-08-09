# Um Panorama do Sistema Elétrico Brasileiro

> **Verificado contra fontes oficiais em 2026-08-09** (ANEEL, Planalto, STF, Senado/Câmara, imprensa especializada — issue [#200](https://github.com/viniciussartini/lumitrack/issues/200), Fase 13.5). Confirmados nesta revisão: os quatro valores de bandeira tarifária (mesma fonte que a aplicação sincroniza automaticamente — ver `ADR-0007`), as datas e o mecanismo da Lei 15.235/2025 e da REN 1.147/2025, o status da proposta de Tarifa Branca automática, e a decisão do STF de março/2026 sobre o adicional de FECP no Rio de Janeiro (adicionada nesta revisão). O cronograma de transição PIS/COFINS→CBS estava impreciso e foi corrigido. A tabela "ICMS por estado" permanece **aproximada** — alíquotas estaduais mudam por decreto com frequência maior do que este documento é atualizado; trate como referência, não como fato, e confirme no quadro tarifário homologado da distribuidora antes de qualquer cálculo real.
>
> **Fonte de verdade:** este arquivo (`.claude/docs/O-Sistema-Eletrico-Brasileiro.md`). A cópia no wiki do projeto é sincronizada a partir daqui — ver `CLAUDE.md`.

## Como o setor elétrico brasileiro está organizado

A energia elétrica que chega à tomada percorre quatro etapas, e a fatura mensal **paga, ao mesmo tempo, todas elas**:

```plaintext
[Geração] → [Transmissão] → [Distribuição] → [Comercialização] → Consumidor
```

| Etapa | O que faz | Peso na conta* |
| --- | --- | --- |
| **Geração** | Hidrelétricas, termelétricas, eólicas, solares, nucleares produzem a energia. | ~30% |
| **Transmissão** | Rede básica de alta tensão (≥ 230 kV) leva a energia das usinas até os centros de carga. | ~6% |
| **Distribuição** | Concessionária local (CPFL, Enel, Cemig, Light, Energisa, Coelba etc.) entrega na sua rua. | ~25% |
| **Encargos setoriais** | Custeiam políticas públicas (CDE, P&D, ESS, EER, CFURH etc.). | ~10% |
| **Tributos** | PIS, COFINS, ICMS, CIP — somam ~25–30% da conta. | ~29% |

>\*Médias nacionais aproximadas. Variam por região e distribuidora.

## Reguladores

| Sigla | Papel |
| --- | --- |
| **MME** | Ministério de Minas e Energia — define políticas. |
| **ANEEL** | Agência reguladora — homologa tarifas, fiscaliza distribuidoras, publica REN 1.000/2021 (regras gerais), define modalidades tarifárias e bandeiras. |
| **ONS** | Operador Nacional do Sistema — despacha as usinas em tempo real. |
| **CCEE** | Câmara de Comercialização — administra os contratos de compra/venda e leilões. |
| **EPE** | Empresa de Pesquisa Energética — planeja expansão. |
| **Distribuidora** | Concessionária local — entrega a energia, mede o consumo, emite fatura, recolhe tributos. |
| **Prefeitura** | Define a **CIP/COSIP** (contribuição de iluminação pública) — cobrada na conta de luz. |
| **Estado (SEFAZ)** | Define **alíquota e regras do ICMS** estadual sobre energia. |

## Tipos de clientes (classes, subclasses, grupos e subgrupos)

A ANEEL divide os consumidores em **dois grandes grupos**, definidos pela **tensão de fornecimento** (não pelo tamanho do negócio).

### Grupo A — Alta e Média Tensão (≥ 2,3 kV)

Indústrias, grandes shoppings, hospitais, redes de varejo e prédios comerciais de grande porte.

| Subgrupo | Tensão |
| --- | --- |
| **A1** | ≥ 230 kV |
| **A2** | 88 a 138 kV |
| **A3** | 69 kV |
| **A3a** | 30 a 44 kV |
| **A4** | 2,3 a 25 kV (subgrupo mais comum do Grupo A) |
| **AS** | < 2,3 kV via sistema subterrâneo |

**Particularidades do Grupo A:**

- **Tarifa binômia obrigatória:** paga separadamente **demanda de potência (kW)** e **consumo de energia (kWh)**.
- **Demanda contratada:** valor mínimo a ser pago todo mês, mesmo se não utilizado — como um "passe ilimitado" de potência.
- **Multa por ultrapassagem:** se a demanda medida exceder 5% da contratada, paga-se **3× a tarifa normal** sobre o excedente.
- **Fator de potência:** cobrança de energia reativa excedente quando FP < 0,92 (caracterizado nos exemplos abaixo).
- Modalidades disponíveis: **Convencional Binômia, Horária Verde, Horária Azul**.

### Grupo B — Baixa Tensão (< 2,3 kV)

Residências, pequenos comércios, pequenas indústrias, propriedades rurais e iluminação pública.

**A grande maioria dos consumidores brasileiros** está aqui.

| Subgrupo | Classe |
| --- | --- |
| **B1** | Residencial (com subclasses: convencional, baixa renda, BPC, indígena, quilombola, desconto social, multifamiliar) |
| **B2** | Rural (subclasses: agropecuária, aquicultura, irrigação, cooperativa de eletrificação rural, indústria rural, serviço público de irrigação rural) |
| **B3** | Demais classes: comércio, serviços, pequenas indústrias, poder público, serviço público, consumo próprio |
| **B4** | Iluminação pública (cobrança feita à prefeitura) |

**Particularidades do Grupo B:**

- **Tarifa monômia:** paga apenas o **consumo (kWh)**, sem demanda separada.
- **Custo de disponibilidade**: piso mensal — 30 kWh (monofásico), 50 kWh (bifásico), 100 kWh (trifásico).
- Modalidades disponíveis: **Convencional Monômia** ou **Branca** (B4 e baixa renda não podem aderir à Branca).

### Classes de uso (transversais aos grupos)

Independentemente do grupo, cada unidade consumidora tem uma **classe**, que pode dar direito a descontos:

- **Residencial** (e suas subclasses sociais)
- **Industrial**
- **Comercial, serviços e outras atividades**
- **Rural** (com descontos de 10% a 73% dependendo da subclasse e da região)
- **Poder Público**
- **Iluminação Pública**
- **Serviço Público** (saneamento, transporte ferroviário)
- **Consumo Próprio** (autoconsumo da própria distribuidora)

## Padronização e Variações do Sistema

### Padronizado em todo o Brasil (ANEEL)

- Estrutura de grupos, subgrupos, classes e subclasses (REN 1.000/2021).
- Definição de modalidades tarifárias (Convencional, Branca, Azul, Verde, Binômia).
- Custo de disponibilidade (30 / 50 / 100 kWh).
- Sistema de **bandeiras tarifárias** (mesmo valor adicional em todo o SIN — Sistema Interligado Nacional).
- Tarifa Social e Desconto Social (Lei 15.235/2025).
- Regras de faturamento mínimo, leitura, religação, geração distribuída (REN 482/2012, REN 1.059/2023).
- Alíquotas nominais de PIS (1,65%) e COFINS (7,6%) — **federais**.

### Variação por estado

- **Alíquota de ICMS** sobre energia elétrica (12% a 22%, com faixas e exceções).
- Existência ou não de **FECP/FECOEP** (Fundo Estadual de Combate à Pobreza) — adicional de 1% a 2%.

### Variação por município

- **CIP/COSIP** (Contribuição para o Custeio da Iluminação Pública) — valor fixo em R$ ou percentual sobre a conta, definido em lei municipal.

### Variação por distribuidora

- **Valores de TUSD e TE** (homologados anualmente pela ANEEL no Reajuste Tarifário Anual ou Revisão Tarifária Periódica).
- **Horário de ponta** (geralmente 18h–21h, mas varia em alguns locais e estado).
- **Tarifas dos serviços avulsos** (religação, vistoria, aferição de medidor).
- **Taxa mínima em R$**: como o piso é em kWh, o valor em reais varia conforme a tarifa local.

## Anatomia da tarifa: TUSD, TE, Parcela A, Parcela B, encargos

A tarifa final paga por kWh tem **duas grandes parcelas**:

### TUSD — Tarifa de Uso do Sistema de Distribuição

Financia a infraestrutura: postes, cabos, transformadores, subestações.

- **Parcela A:** custos das redes de transmissão (a distribuidora paga ao transmissor e repassa).
- **Parcela B:** custos das redes de distribuição (próprios da concessionária).
- **Encargos setoriais e perdas:** CDE, ESS, EER, perdas técnicas etc.

### TE — Tarifa de Energia

Financia a **compra da energia em si** para revenda ao consumidor cativo.

- TE Energia (geração propriamente dita).
- TE Encargos (P&D, eficiência energética, CFURH etc.).

### Parcela A × Parcela B (visão econômica/regulatória)

| Parcela | O que contém | Quem controla |
| --- | --- | --- |
| **Parcela A** | Custos não-gerenciáveis: compra de energia + transmissão + encargos setoriais. | Repassada ao consumidor; flutua com leilões e câmbio. |
| **Parcela B** | Custos da distribuidora (operação, manutenção, depreciação, remuneração do capital). | Distribuidora — reajustada por IGP-M/IPCA menos Fator X. |

### Tarifa final ao consumidor (Grupo B)

```plaintext
Tarifa final (R$/kWh) = (TUSD + TE) ÷ (1 − tributos por dentro) + bandeira
```

Onde "tributos por dentro" = PIS + COFINS + ICMS sobre a energia.

### Tarifa final ao consumidor (Grupo A) — visão binômia

```plaintext
Conta = [Demanda contratada × TUSD demanda]
      + [Energia consumida × (TUSD energia + TE energia) por posto tarifário]
      + [Energia reativa excedente, se FP < 0,92]
      + [Bandeira × consumo]
      + [Ultrapassagem de demanda, se houver]
      + tributos por dentro
      + CIP
```

## Modalidades tarifárias

### Grupo B

| Modalidade | Quem pode | Como funciona |
| --- | --- | --- |
| **Convencional Monômia** | Todos do Grupo B. Default. | Tarifa única por kWh, 24h/dia, todo dia. |
| **Branca** | B1 e B3 voluntariamente. **Vedada** a baixa renda, B4 e quem recebe outros descontos. | Três postos tarifários nos dias úteis: **Ponta** (mais cara, 3 horas, tipicamente 18h–21h), **Intermediário** (1h antes + 1h depois da ponta, valor intermediário) e **Fora de Ponta** (demais horas, mais barata que a convencional). Fins de semana e feriados: tudo fora de ponta. |

>[!IMPORTANT]
> **Verificado em 2026-08:** a proposta avançou para consulta pública formal (10/dez/2025 a 09/mar/2026) — migração automática obrigatória para quem consome ≥ 1 MWh/mês a partir de 2026 (~2,5 milhões de unidades, ~25% do consumo em baixa tensão) e ≥ 600 kWh/mês a partir de 2027; baixa renda, desconto social, iluminação pública e consumidores em pré-pagamento ficam isentos. Implementação prevista para o fim de 2026. Até esta verificação, **continua sendo proposta em consulta pública, não resolução normativa final** — confirme o status antes de tratar como regra vigente.

### Grupo A

| Modalidade | Quem pode | Como funciona |
| --- | --- | --- |
| **Convencional Binômia** | Apenas A3a, A4, AS com demanda contratada < 300 kW. | Demanda única + consumo único, sem distinção horária. Em extinção gradual. |
| **Horária Verde** | A3a, A4, AS. | **1 demanda contratada** + **2 tarifas de consumo** (ponta e fora de ponta). Ideal para quem consegue evitar consumo na ponta mas tem demanda estável. |
| **Horária Azul** | **Obrigatória** para A1, A2, A3 e para quem tem demanda ≥ 300 kW (opcional para os demais). | **2 demandas contratadas** (ponta e fora de ponta) + **2 tarifas de consumo** (ponta e fora de ponta). Total: 4 tarifas distintas. Mais complexa, ideal para indústrias com padrão de carga muito distinto entre horários. |

**Tolerância de demanda:** 5% acima da contratada. Acima disso, **ultrapassagem = 3× tarifa normal**.

## Sistemas (monofásico, bifásico, trifásico) e tensões

### Sistemas e tensões típicas

| Sistema | Fios condutores | Tensão típica (Brasil) | Carga instalada típica |
| --- | --- | --- | --- |
| **Monofásico** | 1 fase + 1 neutro (2 fios) | 127V ou 220V | até ~8 kW. Casas pequenas. |
| **Bifásico** | 2 fases + 1 neutro (3 fios) | 127/220V ou 220/380V | ~8 a 12 kW. Casas médias com 2 chuveiros. |
| **Trifásico** | 3 fases + 1 neutro (4 fios) | 127/220V, 220/380V, 380/660V | > 12 kW. Comércios, indústrias, casas grandes. |

>[!NOTE]
> No Brasil há **duas tensões fase-neutro** comuns: **127V** (SP capital, RJ, MG, PE, BA partes, etc.) e **220V** (CE, PB, RN, DF, AC, RO, RR, GO, MT, SC parte).

### O custo de disponibilidade

A distribuidora mantém a infraestrutura disponível mesmo quando você não consome. Por isso, **mesmo com consumo zero**, há um **piso mensal** de faturamento:

| Sistema | Piso mensal (REN 1.000/2021, art. 291) |
| --- | --- |
| **Monofásico** ou bifásico a 2 condutores | **30 kWh** |
| **Bifásico** a 3 condutores | **50 kWh** |
| **Trifásico** | **100 kWh** |

**Regra:** se o consumo medido for menor que o piso, a distribuidora cobra como se você tivesse consumido o piso. Se for maior, cobra o consumo real.

**Exemplo concreto:** uma casa trifásica em SP (CPFL Paulista, R\$ 0,85/kWh com tributos) consumiu 40 kWh em janeiro. Não pagará 40 × 0,85 = R\$ 34, e sim **100 × 0,85 = R$ 85** + CIP.

**Particularidade da Tarifa Branca:** o custo de disponibilidade na Branca é calculado com a **tarifa Convencional** (não com as tarifas horárias). Regra introduzida pela REN 1.098/2024.

**Particularidade da Tarifa Social:** unidades trifásicas atendidas pela TSEE têm o piso reduzido de 100 para **80 kWh**, alinhando com a gratuidade dos primeiros 80 kWh (Lei 15.235/2025).

>[!NOTE]
> O sistema não altera o R\$/kWh, o preço do kWh é o mesmo para monofásico, bifásico ou trifásico de uma mesma classe. **O que muda é o piso mínimo, não a tarifa.**

## Tributos: PIS, COFINS, ICMS, CIP — e o "cálculo por dentro"

### Tributos incidentes

| Tributo | Esfera | Alíquotas em 2026 | Base |
| --- | --- | --- | --- |
| **PIS** | Federal | ~1,65% nominal (varia mensalmente — apuração não cumulativa) | Energia + bandeira; **não** incide sobre ICMS, ECE ou CIP |
| **COFINS** | Federal | ~7,6% nominal (varia mensalmente) | Idem PIS |
| **ICMS** | Estadual | 12% a 22% (e até 25% com FECP em alguns estados), com **faixas** em vários estados | Energia + bandeira (varia: alguns estados incluem TUSD, outros não) |
| **CIP / COSIP** | Municipal | Valor fixo em R$ ou % sobre o consumo, varia por município | Não tem cálculo "por dentro" — é somado após |

### O que é "cálculo por dentro"

PIS, COFINS e ICMS **fazem parte de sua própria base de cálculo** — isto é, **o imposto incide sobre si mesmo**. Esse é o "cálculo por dentro" e é o que mais confunde o consumidor.

**Fórmula geral:**

```plaintext
Valor com tributos por dentro = Valor sem tributos / (1 − alíquota total)
```

**Exemplo numérico:**

- Energia sem tributos: R$ 100,00
- ICMS efetivo: 18%, PIS+COFINS: 9,25% → total: 27,25%
- "Por fora" (errado): R$ 100 × 1,2725 = R$ 127,25
- "Por dentro" (correto): R$ 100 / (1 − 0,2725) = R$ 137,46
Resultado: **a alíquota efetiva é maior que a nominal**. Uma alíquota nominal de 27,25% vira ~37,46% efetivos no bolso.

**Por que isso existe?** Pela lógica do "preço unificado de mercadoria": o preço que aparece na nota fiscal **já inclui** o imposto, então o imposto incide sobre o preço total cobrado. É a mesma regra que se aplica a gasolina, telefonia, etc.

### ICMS por estado

Após o **STF (Tema 745, RE 714139)** decidir que ICMS sobre energia não pode ser maior que a alíquota geral do estado (princípio da essencialidade), os estados ajustaram suas alíquotas:

| Estado (exemplos) | Alíquota geral | ICMS energia | Observações |
| --- | --- | --- | --- |
| **SP** | 18% | 18% (faixas: até 200 kWh sem ICMS para residencial baixa renda) | RICMS-SP, art. 52 — confirmado nesta verificação |
| **RJ** | 20% + 2% FECP = 22% (modal) | 18% + FECP específico sobre energia | Ver nota "Atualização RJ" abaixo — situação em mudança |
| **MG** | 18% | 18% | |
| **BA** | 19% (geral) | 19% (até 150 kWh baixa renda isento) | |
| **PE** | 18% | 18% | |
| **CE** | 18% | 18% | |
| **PR** | 19,5% (geral) | 19% | |
| **SC** | 17% | 17% | |
| **RS** | 17% | 17% | |
| **GO** | 19% | 19% | |
| **DF** | 18% | 18% | |
| **AM** | ~20% (modal) | 25% (estável há ~20 anos) | Ver nota "Atualização AM" abaixo |

>[!NOTE]
> Tabela **aproximada** (referência 2026-08) — só SP e as notas de RJ/AM abaixo foram checadas individualmente nesta verificação; os demais estados mantêm o valor herdado, não confirmado decreto a decreto. Confirme sempre no RICMS do estado ou no quadro tarifário homologado da distribuidora antes de um cálculo real.
>
> Vários estados também aplicam **alíquotas progressivas por faixa de consumo** para residências (ex.: 12% até 90 ou 200 kWh, 18% acima).

### Atualizações desta verificação (RJ e AM)

**RJ (verificado mar/2026):** a Lei estadual 10.253/2023 elevou o ICMS modal do RJ de 18% para 20% a partir de 2024 (+2% de FECP geral), mas a energia elétrica acima de 300 kWh/mês carrega um FECP **específico de 4%**, vigente até 2031 — maior que o FECP geral de 2% citado na tabela. Em março de 2026 o STF, na mesma lógica de essencialidade do Tema 745, declarou **inconstitucional** esse adicional de FECP sobre energia e telecomunicações; a cobrança segue temporariamente enquanto o estado ajusta a transição, sem prazo de encerramento definido até esta verificação. Trate como situação em mudança, não como definitiva — reconfirme antes de usar em qualquer cálculo.

**AM (verificado 2026-08):** o ICMS de 25% sobre energia é cobrado há cerca de 20 anos, via substituição tributária sobre o PMPF (Resolução 0012/2019-GSEFAZ) — estável, não é um valor sob disputa como a tabela anterior sugeria com "(questionado)". A afirmação de que um "subsídio federal compensa via CCC" **não foi confirmada** nesta verificação: a CCC subsidia o custo de geração térmica a diesel dos sistemas isolados da Amazônia (ver seção "Sistemas isolados" abaixo), não o ICMS do estado como um todo — a maior parte do Amazonas, incluindo Manaus, é hoje atendida pelo SIN, não por sistema isolado. Tratar como **aproximado** até confirmação.

### Isenção de ICMS na baixa renda (varia por estado)

Muitos estados isentam ICMS para residencial baixa renda em faixas iniciais de consumo (ex.: até 90 ou 150 kWh/mês).

### CIP / COSIP — Iluminação Pública

- **Lei Municipal** (art. 149-A CF/88, EC 39/2002).
- Cobrada **junto** com a conta de luz por convênio com a distribuidora.
- **Não** entra na base de cálculo de PIS/COFINS/ICMS.
- Modelos comuns:
  - Valor fixo em R$ (ex.: R\$ 12,00/mês para residencial monofásico).
  - Faixa por consumo (ex.: R\$ 8 até 100 kWh, R\$ 15 entre 100–200 kWh).
  - Percentual sobre a conta (raro).
- Repassada **integralmente** à prefeitura.

### PIS/COFINS em 2026 — atenção à Reforma Tributária

A Reforma Tributária (EC 132/2023 + LC 214/2025) substitui PIS/COFINS pela **CBS (Contribuição sobre Bens e Serviços)**. Cronograma corrigido nesta verificação (2026-08) — a versão anterior deste documento descrevia coexistência gradual "entre 2026 e 2032", o que não reflete a lei:

- **2026 — ano-teste:** CBS cobrada a alíquota simbólica de 0,9% (IBS 0,1%), em paralelo com PIS/COFINS ainda em vigor às alíquotas nominais de sempre — o valor pago em CBS neste ano é compensável, não é carga tributária adicional real. É o cenário vigente nos exemplos práticos deste documento (mês de referência maio/2026).
- **2027 — PIS e COFINS extintos.** A CBS passa a ter alíquota efetiva (~8,5%, com desconto de 0,1 p.p. em 2027–2028) e substitui de fato as duas contribuições.
- **Até 2033** — janela de transição do **IBS** (a parte estadual/municipal da reforma, substituindo ICMS/ISS gradualmente), já sem relação com PIS/COFINS/CBS, extintos/substituídos desde 2027.

## Bandeiras tarifárias

Sistema criado pela ANEEL em 2015 para sinalizar **mensalmente** o custo de geração ao consumidor.

| Bandeira | Acréscimo em 2026 | Quando aciona |
| --- | --- | --- |
| 🟢 **Verde** | R$ 0,000 / 100 kWh | Reservatórios saudáveis, geração hidrelétrica abundante. |
| 🟡 **Amarela** | R$ 1,885 / 100 kWh | Redução de chuvas, acionamento de algumas termelétricas. |
| 🔴 **Vermelha P1** | R$ 4,463 / 100 kWh | Cenário hídrico desfavorável. |
| 🔴 **Vermelha P2** | R$ 7,877 / 100 kWh | Cenário hídrico crítico, muitas termelétricas. |

>[!NOTE]
> **Verificado em 2026-08-09:** os quatro valores acima batem exatamente com a REH nº 3.306/2024 (vigente desde 2024-04-01, sem alteração até a data desta verificação) — a mesma fonte que a aplicação sincroniza automaticamente do Portal de Dados Abertos da ANEEL (ver `ADR-0007`).

### Como incide na conta?

- Cobrança proporcional ao **consumo total em kWh** (no Grupo B) ou no **consumo total medido** (no Grupo A).
- Aplica-se **sobre o consumo todo do mês**, inclusive nos primeiros kWh.
- **Cálculo por dentro também** — a bandeira entra na base de PIS, COFINS e ICMS.

### Diferenças por tipo de cliente

- **Grupo B:** acréscimo direto no kWh medido.
- **Grupo A:** acréscimo no consumo medido (não na demanda).
- **Tarifa Social (até 80 kWh)**: bandeira **não** se aplica à parcela gratuita.
- **Sistemas isolados** (parte da Amazônia fora do SIN): **isentos** de bandeiras.
- **Mercado Livre:** bandeira não se aplica à TE (que é negociada bilateralmente), mas se aplica à TUSD.

>[!NOTE]
>A ANEEL anuncia mensalmente, normalmente na **última sexta-feira útil** do mês anterior.

## Tarifa Social e Desconto Social (Lei 15.235/2025)

A **Lei 15.235/2025 ("Luz do Povo")** — sancionada em 08/10/2025, mas com a gratuidade já em vigor desde 05/07/2025 por força da Medida Provisória 1.300/2025, que a lei converteu — e regulamentada pela **REN 1.147/2025** (aprovada pela ANEEL em 09/12/2025, em vigor desde 01/01/2026), reformou os benefícios para baixa renda. Datas confirmadas nesta verificação (2026-08).

### Tarifa Social de Energia Elétrica (TSEE) — vigente desde 05/jul/2025

**Quem tem direito:**

- Famílias inscritas no **CadÚnico** com renda per capita ≤ ½ salário mínimo.
- Idosos 65+ ou pessoas com deficiência que recebem **BPC**.
- Famílias com renda total até 3 salários mínimos com membro que usa equipamento elétrico médico contínuo (Cliente Vital, com laudo).
- Indígenas e quilombolas cadastrados.

**Descontos:**

| Faixa de consumo | Desconto sobre tarifa de energia |
| --- | --- |
| 0 a 80 kWh | 100% gratuito (mudança da Lei 15.235/2025) |
| 81 a 220 kWh | descontos parciais escalonados (~10% a 40%) |
| Acima de 220 kWh | **sem desconto** (tarifa normal sobre toda a conta) |

Para indígenas e quilombolas, o limite de gratuidade permanece em 100 kWh.

>[!IMPORTANT]
> Desconto incide apenas sobre a **tarifa de energia**. Tributos, CIP e bandeiras seguem normais (mas não há bandeira sobre os 80 kWh gratuitos).
> Conta deve estar no nome de **beneficiário do CadÚnico/BPC** (regra que entrou em vigor em 2026).
> Concessão **automática** via cruzamento de dados CadÚnico ↔ distribuidora.

### Desconto Social (NOVO — vigente desde 01/jan/2026)

Para famílias **um degrau acima** da Tarifa Social:

- Renda per capita > ½ e ≤ 1 salário mínimo, inscritas no CadÚnico.
- **Benefício:** isenção das **quotas da CDE** para consumo até 120 kWh/mês.
- Acima de 120 kWh: tarifa residencial normal.
- Classificação na fatura: **"B1 Residencial Desconto Social"**.

### Resumo das classificações da baixa renda em 2026

| Classe | Critério | Benefício |
| --- | --- | --- |
| **B1 Residencial** | Default | Sem desconto. |
| **B1 Baixa Renda** | CadÚnico ≤ ½ SM ou BPC | TSEE: 100% até 80 kWh + descontos parciais até 220 kWh. |
| **B1 Baixa Renda Indígena/Quilombola** | Cadastrado | 100% até 100 kWh. |
| **B1 Baixa Renda BPC** | BPC | Mesma TSEE. |
| **B1 Cliente Vital** | Renda ≤ 3 SM + laudo médico | TSEE. |
| **B1 Desconto Social** | CadÚnico ½ a 1 SM | Isenção da CDE até 120 kWh (novo). |

## Diferenças regionais e por distribuidora

### Tarifa residencial B1 com tributos (R$/kWh) — em 2026, aproximada

| Região | Distribuidora | Estado | Tarifa efetiva (~R$/kWh) |
| --- | --- | --- | --- |
| Norte | Equatorial Pará | PA | ~0,94 (mais cara do país) |
| Norte | Amazonas Energia | AM | ~0,86 |
| Nordeste | Coelba (Neoenergia BA) | BA | ~0,82 |
| Nordeste | Neoenergia PE | PE | ~0,77 |
| Sudeste | Enel SP | SP | ~0,64 |
| Sudeste | CPFL Paulista | SP | ~0,70 |
| Sudeste | EDP SP | SP | ~0,68 |
| Sudeste | Light | RJ | ~0,78 |
| Sudeste | Enel RJ | RJ | ~0,76 |
| Sudeste | Cemig | MG | ~0,71 |
| Sul | Celesc | SC | ~0,53 (mais barata) |
| Sul | Copel | PR | ~0,68 |
| Sul | RGE Sul | RS | ~0,72 |
| Centro-Oeste | Neoenergia DF | DF | ~0,69 |

>[!NOTE]
> Diferença entre o mais caro (PA) e o mais barato (SC) chega a ~75%.

### Por que existe essa diferença?

1. **Densidade da rede:** Norte tem rede esparsa com poucos consumidores por km.
2. **Geração predominante:** regiões dependentes de térmica pagam mais.
3. **Perdas técnicas e não-técnicas (furtos):** Norte/Nordeste têm perdas maiores.
4. **ICMS estadual:** alíquota e regras de faixa diferem.
5. **CIP municipal:** cidades grandes tendem a cobrar mais.
6. **Subsídios federais (CDE):** Norte recebe subsídio que mitiga parte do custo.

### Sistemas isolados

Cerca de 250 localidades na Amazônia ainda **não estão conectadas ao SIN**. Recebem energia de termelétricas a diesel, subsidiadas pela CCC (Conta de Consumo de Combustíveis). **Bandeiras não se aplicam.**

### Horário de verão (descontinuado)

O Brasil **não tem mais horário de verão** desde 2019. Os horários de ponta da Tarifa Branca não mudam mais entre estações.

## Tópicos adicionais

### Geração Distribuída (energia solar fotovoltaica)

Regulamentada pela REN 482/2012, atualizada pela REN 1.059/2023 e Lei 14.300/2022 ("Marco Legal da GD"):

- Quem instala painéis solares pode injetar energia na rede e receber crédito (Sistema de Compensação).
- A partir de 07/jan/2023, novos sistemas pagam **fração do Fio B** crescente até atingir 100% em 2029.
- **Custo de disponibilidade continua sendo cobrado** mesmo com saldo de crédito (não pode ser abatido).
- **ICMS na GD:** Convênio CONFAZ 16/2015 → varia por estado. Alguns isentam (MG, SP), outros cobram (Sergipe, Ceará).

### Mercado Livre de Energia (ACL)

- Consumidor compra energia diretamente de geradores ou comercializadores.
- Continua pagando TUSD à distribuidora local, mas **negocia a TE** bilateralmente.
- Acesso obrigatório para A1/A2/A3 desde sempre; A3a/A4/AS desde jan/2024 sem restrição de demanda.
- A partir de **jan/2028** (proposta), pequenos consumidores e residências também poderão migrar.

### Fator de Potência e Energia Reativa Excedente (ERE)

- Aplica-se ao **Grupo A**.
- FP mínimo = **0,92**.
- Indutivo medido entre 6h e 24h; capacitivo entre 0h e 6h.
- Excedente cobrado a R$/kVArh (mesma tarifa de TUSD).

### Tarifa de Ultrapassagem (Grupo A)

Quando a demanda medida ultrapassa em mais de 5% a contratada:

```plaintext
Ultrapassagem = (Demanda medida − Demanda contratada) × 3 × Tarifa demanda
```

### Período seco × período úmido

Distinção histórica (maio–novembro = seco; dezembro–abril = úmido). Hoje **revogada** para fins de demanda contratada (REN 414/2010), mas ainda relevante para análise de bandeiras (período seco tende a ter bandeiras mais altas).

### Reajustes e revisões tarifárias

- **Reajuste Tarifário Anual (RTA):** todo ano, recompõe Parcela A integralmente e Parcela B por IPCA/IGP-M − Fator X.
- **Revisão Tarifária Periódica (RTP):** a cada 4 a 5 anos, redefine Parcela B.

### Faturamento mínimo × consumo medido

Independente do piso de disponibilidade, há também regras de faturamento mínimo para casos específicos (religação, mudança de titularidade etc.).

## Anatomia da fatura mensal

Uma fatura típica contém:

```plaintext
┌─────────────────────────────────────────────────────────────┐
│ DADOS CADASTRAIS                                            │
│ Nome, endereço, instalação, classe, subgrupo, modalidade    │
├─────────────────────────────────────────────────────────────┤
│ LEITURA E MEDIÇÃO                                           │
│ Leitura anterior, atual, multiplicador, kWh consumidos      │
├─────────────────────────────────────────────────────────────┤
│ DESCRIÇÃO DO FATURAMENTO                                    │
│   • Consumo (kWh) × tarifa = R$                             │
│   • Bandeira (kWh) × valor = R$                             │
│   • Demanda contratada (Grupo A)                            │
│   • Ultrapassagem / ERE (se houver)                         │
│   • CIP (R$)                                                │
│   • Desconto baixa renda / rural (se houver)                │
├─────────────────────────────────────────────────────────────┤
│ TRIBUTOS                                                    │
│   • Base PIS/COFINS, alíquota, R$                           │
│   • Base ICMS, alíquota, R$                                 │
├─────────────────────────────────────────────────────────────┤
│ HISTÓRICO DE CONSUMO (últimos 12 meses)                     │
├─────────────────────────────────────────────────────────────┤
│ AVISOS E TOTAL A PAGAR                                      │
└─────────────────────────────────────────────────────────────┘
```

## Exemplos práticos de cálculo

>[!NOTE]
> Mês de referência: maio/2026, **bandeira amarela** (R$ 0,01885/kWh).
> Tarifas usadas são realistas mas aproximadas (CPFL Paulista referência).
> PIS+COFINS efetivo: 9,25% (média). ICMS conforme cada exemplo.
> Fórmula "por dentro": `valor com tributos = valor sem / (1 − Σ alíquotas)`.

### Exemplo 1 — B1 Residencial Monofásico Convencional (família média em SP)

**Cliente:** Maria, casa monofásica 127V em Campinas (CPFL Paulista). 4 pessoas.
**Consumo medido:** 250 kWh
**ICMS efetivo SP:** 18% (consumo > 200 kWh, sem isenção)

| Item | Cálculo | Valor |
| --- | --- | --- |
| TUSD (R$ 0,30/kWh) | 250 × 0,30 | R$ 75,00 |
| TE (R$ 0,30/kWh) | 250 × 0,30 | R$ 75,00 |
| **Energia sem tributos** | | **R$ 150,00** |
| Bandeira amarela | 250 × 0,01885 | R$ 4,71 |
| **Subtotal energia + bandeira** | | **R$ 154,71** |
| **Aplicar "por dentro"** | 154,71 / (1 − 0,18 − 0,0925) | 154,71 / 0,7275 = R$ 212,66 |
| CIP municipal | (fixo) | R$ 14,00 |
| **TOTAL A PAGAR** | | **R$ 226,66** |

**Decomposição dos tributos:**

- ICMS: R\$ 212,66 × 18% = R\$ 38,28
- PIS+COFINS: R\$ 212,66 × 9,25% = R\$ 19,67
- Total tributos: R\$ 57,95 (≈ 27% da conta sem CIP)

### Exemplo 2 — B1 Residencial Baixa Renda Monofásico (Tarifa Social)

**Cliente:** Dona Joana, monofásica em Salvador (Coelba), CadÚnico, ½ SM per capita.
**Consumo medido:** 95 kWh
**ICMS BA:** isento até 150 kWh para baixa renda.

| Item | Cálculo | Valor |
| --- | --- | --- |
| Primeiros 80 kWh (gratuidade TSEE 100%) | 0 | **R$ 0,00** |
| 81 a 95 kWh = 15 kWh | 15 × R$ 0,90 (tarifa cheia) × (1 − 0,40 desconto 81–100) | 15 × 0,54 = R$ 8,10 |
| Bandeira amarela (sobre 15 kWh tributáveis) | 15 × 0,01885 | R$ 0,28 |
| **Subtotal** | | **R$ 8,38** |
| Tributos | ICMS isento (< 150 kWh BR) + PIS/COFINS 9,25% por dentro | 8,38 / 0,9075 = R$ 9,23 |
| CIP | (baixa renda em Salvador é isenta) | R$ 0,00 |
| **TOTAL A PAGAR** | | **R$ 9,23** |

**Comparação:** sem TSEE, essa mesma conta seria ~R\$ 95 × 0,90 / 0,9075 = R\$ 94,21. Economia de **90%**.

### Exemplo 3 — B1 Residencial Trifásico Tarifa Branca (consumidor "smart")

**Cliente:** João, casa trifásica 220/380V em Belo Horizonte (Cemig). Trabalha em home office.
**Consumo medido:** 450 kWh distribuídos:

- Ponta (18h–21h, dias úteis): 30 kWh
- Intermediário (17h–18h e 21h–22h, dias úteis): 50 kWh
- Fora de Ponta (demais horas + fins de semana): 370 kWh
**Tarifas (Cemig Branca, aprox.):**
- Ponta: R$ 1,20/kWh (TUSD+TE sem tributo)
- Intermediário: R$ 0,75/kWh
- Fora de Ponta: R$ 0,45/kWh
- Convencional equivalente: R$ 0,60/kWh
**ICMS MG:** 18%

| Item | Cálculo | Valor |
| --- | --- | --- |
| Consumo Ponta | 30 × 1,20 | R$ 36,00 |
| Consumo Intermediário | 50 × 0,75 | R$ 37,50 |
| Consumo Fora de Ponta | 370 × 0,45 | R$ 166,50 |
| **Energia sem tributos** | | **R$ 240,00** |
| Bandeira amarela | 450 × 0,01885 | R$ 8,48 |
| **Subtotal** | | **R$ 248,48** |
| Por dentro (18% + 9,25%) | 248,48 / 0,7275 | **R$ 341,55** |
| CIP | | R$ 18,00 |
| **TOTAL A PAGAR** | | **R$ 359,55** |

**Comparação com Convencional:** mesmos 450 kWh × R\$ 0,60 = R\$ 270 sem tributos. Com tributos: ~R\$ 371,55 + CIP = ~R\$ 389,55.
**Economia João com Branca:** ~R\$ 30/mês (~8%). Vale a pena porque ele concentra consumo fora da ponta.

>[!WARNING]
> **Cuidado:** se João tivesse 100 kWh na ponta (e 350 fora), a conta seria: 100×1,20 + 350×0,45 = R$ 277,50 — **mais cara que a convencional**. A Branca **só vale a pena** com perfil de consumo deslocado.

**Custo de disponibilidade na Branca:** se consumisse apenas 80 kWh, pagaria 100 kWh × tarifa **Convencional** (não pela Branca) — regra REN 1.098/2024.

### Exemplo 4 — B2 Rural Bifásico (pequena propriedade rural)

**Cliente:** Sítio do Pedro, bifásico em Goiás (Equatorial Goiás). Atividade: agropecuária.
**Consumo medido:** 180 kWh
**Desconto rural (classe B2 agropecuária):** 10% sobre TUSD + TE
**ICMS GO:** 19%

| Item | Cálculo | Valor |
| --- | --- | --- |
| TUSD + TE (R$ 0,65/kWh) | 180 × 0,65 | R$ 117,00 |
| Desconto rural 10% | −11,70 | R$ 105,30 |
| Bandeira amarela | 180 × 0,01885 | R$ 3,39 |
| **Subtotal** | | **R$ 108,69** |
| Por dentro (19% + 9,25% = 28,25%) | 108,69 / 0,7175 | R$ 151,49 |
| CIP rural | | R$ 5,00 |
| **TOTAL A PAGAR** | | **R$ 156,49** |

>[!CAUTION]
> **Cuidado:** se consumisse apenas 30 kWh, pagaria 50 kWh × R\$ 0,65 = R$ 32,50 + tributos + CIP, pelo custo de disponibilidade bifásico.

### Exemplo 5 — B3 Comercial Pequeno Trifásico (padaria)

**Cliente:** Padaria do Zé, trifásica em Recife (Neoenergia PE).
**Consumo medido:** 1.200 kWh
**ICMS PE:** 18%

| Item | Cálculo | Valor |
| --- | --- | --- |
| TUSD + TE (R\$ 0,68/kWh) | 1200 × 0,68 | R$ 816,00 |
| Bandeira amarela | 1200 × 0,01885 | R$ 22,62 |
| **Subtotal** | | **R\$ 838,62** |
| Por dentro (18% + 9,25%) | 838,62 / 0,7275 | **R\$ 1.152,74** |
| CIP comercial | | R$ 35,00 |
| **TOTAL A PAGAR** | | **R\$ 1.187,74** |

> [!IMPORTANT]
> Por ser B3 trifásico com >1.000 kWh/mês, a partir de 2026 a Neoenergia pode propor migração automática para **Tarifa Branca** (proposta ANEEL nov/2025). Hoje é opcional.

### Exemplo 6 — A4 Industrial Tarifa Verde (indústria média)

**Cliente:** Metalúrgica em Joinville/SC (Celesc), 13,8 kV, **subgrupo A4**, Tarifa Verde.
**Demanda contratada:** 200 kW (única, modalidade verde)
**Demanda medida no mês:** 195 kW (dentro da contratada)
**Consumo:** Ponta 800 kWh, Fora de Ponta 28.000 kWh = 28.800 kWh total
**Fator de potência médio:** 0,94 (acima de 0,92, sem ERE)
**ICMS SC:** 17%

**Tarifas (Celesc A4 Verde, aprox., **sem tributos**):**

- TUSD demanda: R$ 18,00/kW
- TUSD energia Fora de Ponta: R\$ 0,12/kWh; TE Fora Ponta: R\$ 0,28/kWh → total: R$ 0,40/kWh
- TUSD energia Ponta: R\$ 0,75/kWh; TE Ponta: R\$ 0,55/kWh → total: R$ 1,30/kWh

| Item | Cálculo | Valor |
| --- | --- | --- |
| Demanda contratada × tarifa | 200 × 18,00 | R$ 3.600,00 |
| Consumo Ponta | 800 × 1,30 | R$ 1.040,00 |
| Consumo Fora de Ponta | 28.000 × 0,40 | R$ 11.200,00 |
| **Subtotal energia + demanda** | | **R$ 15.840,00** |
| Bandeira amarela (sobre TODO o consumo) | 28.800 × 0,01885 | R$ 542,88 |
| **Subtotal** | | **R$ 16.382,88** |
| Por dentro (17% + 9,25% = 26,25%) | 16.382,88 / 0,7375 | **R$ 22.214,75** |
| CIP comercial industrial | | R$ 250,00 |
| **TOTAL A PAGAR** | | **R$ 22.464,75** |

> Se a metalúrgica ultrapassasse demanda (ex: medisse 230 kW), pagaria:
> Ultrapassagem = (230 − 200) × 3 × 18,00 = R$ 1.620,00 adicional **antes** dos tributos.

### Exemplo 7 — A4 Industrial Tarifa Azul (indústria com perfil de carga muito assimétrico)

**Cliente:** Frigorífico em Cuiabá/MT (Energisa MT), 13,8 kV, A4, Azul. Câmaras frias rodam 24h, mas processamento é intensivo durante o dia.
**Demanda contratada Ponta:** 150 kW
**Demanda contratada Fora de Ponta:** 400 kW
**Demanda medida Ponta:** 145 kW
**Demanda medida Fora de Ponta:** 395 kW
**Consumo:** Ponta 1.500 kWh, Fora de Ponta 95.000 kWh = 96.500 kWh
**FP:** 0,91 → **ERE incidente sobre tudo abaixo de 0,92**
**ICMS MT:** 19,5%

**Tarifas (Energisa MT A4 Azul, aprox., **sem tributos**):**

- TUSD demanda Ponta: R$ 45,00/kW
- TUSD demanda Fora Ponta: R$ 15,00/kW
- TUSD+TE energia Ponta: R$ 1,48/kWh
- TUSD+TE energia Fora Ponta: R$ 0,57/kWh

| Item | Cálculo | Valor |
| --- | --- | --- |
| Demanda contratada Ponta | 150 × 45,00 | R$ 6.750,00 |
| Demanda contratada Fora Ponta | 400 × 15,00 | R$ 6.000,00 |
| Consumo Ponta | 1.500 × 1,48 | R$ 2.220,00 |
| Consumo Fora de Ponta | 95.000 × 0,57 | R$ 54.150,00 |
| **Subtotal energia + demanda** | | **R$ 69.120,00** |
| Energia Reativa Excedente (ERE, ~2% do consumo) | ~96.500 × 0,02 × 0,40 (kVArh × tarifa) | R$ 772,00 |
| Bandeira amarela (sobre todo consumo) | 96.500 × 0,01885 | R$ 1.819,03 |
| **Subtotal** | | **R$ 71.711,03** |
| Por dentro (19,5% + 9,25% = 28,75%) | 71.711,03 / 0,7125 | **R$ 100.646,36** |
| CIP industrial | | R$ 850,00 |
| **TOTAL A PAGAR** | | **R$ 101.496,36** |

> [!NOTE]
> **Nota 1:** na Azul, ultrapassar a demanda **na ponta** custa muito mais que na fora de ponta (tarifas 3× maiores). É comum frigoríficos contratarem demanda Ponta baixa e parar processos pesados das 18h–21h.
> **Nota 2:** As tarifas usadas nos exemplos são ilustrativas; valores reais variam por distribuidora e devem ser consultados nos quadros tarifários homologados pela ANEEL.

---

## Glossário

| Termo | Definição |
| --- | --- |
| **kWh** | quilowatt-hora — unidade de energia (potência × tempo). |
| **kW** | quilowatt — unidade de potência (energia / tempo). |
| **Demanda** | maior potência média (em kW) medida em intervalos de 15 min. |
| **Posto tarifário** | janela horária com tarifa específica (ponta, intermediário, fora de ponta). |
| **SIN** | Sistema Interligado Nacional — rede que conecta a maior parte do país. |
| **UC** | Unidade Consumidora — endereço servido por um medidor único. |
| **TUSD** | Tarifa de Uso do Sistema de Distribuição. |
| **TE** | Tarifa de Energia. |
| **CDE** | Conta de Desenvolvimento Energético — fundo para subsídios. |
| **GD** | Geração Distribuída (solar fotovoltaica em telhado, biogás etc.). |
| **ACR** | Ambiente de Contratação Regulada (mercado cativo). |
| **ACL** | Ambiente de Contratação Livre (mercado livre). |
| **CIP / COSIP** | Contribuição para Custeio da Iluminação Pública. |
| **REN** | Resolução Normativa da ANEEL. |
| **FP** | Fator de Potência (razão entre potência ativa e aparente). |
