# 02 — Requisitos e Funcionamento

> Guia de preenchimento: RF testável, na forma "o sistema deve permitir que [ator] [ação]".
> RNF mensurável (ex.: "p95 < 300ms"). RN é regra de negócio — restrição que vale independentemente da tela. FNC descreve o fluxo passo a passo.

## Convenções deste documento

**Status por item.** Todo requisito carrega um marcador:

- `[implementado]` — existe no código hoje; o texto foi conferido contra a implementação, não contra a intenção.
- `[planejado — Fase N]` — tem fase no `.claude/docs/roadmap.md`.
- `[planejado — sem fase]` — nasce do handoff de design ou do documento de referência do setor elétrico e ainda não foi sequenciado. Não é compromisso de entrega; é escopo conhecido.

**Numeração é append-only.** Um número nunca é reaproveitado nem renumerado — o roadmap, os laudos de auditoria e as issues do GitHub referenciam RFs por número (RF08, RF10, RF12, RF13 aparecem em várias fases). Requisito que deixa de valer é marcado como removido, não apagado.

**Onde cada coisa mora.** Regra que vale independentemente da tela é **RN**, não RF — o piso de disponibilidade é RN, "consultar o custo" é RF. Fluxo de tela é **FNC**. Toda RN de origem normativa cita a norma; toda RN de origem interna cita o serviço ou o ADR que a implementa.

**Fontes desta revisão (2026-09-06):** código atual (`backend/src/modules/`), handoff de design `.claude/design/2026-09-06-lumitrack-completo/` (telas `LumiTrack Home v2` e `LumiTrack Relatório A4`), `.claude/docs/roadmap.md` (Fases 19–22) e `.claude/docs/O-Sistema-Eletrico-Brasileiro.md`.

## 2.1 Requisitos Funcionais

### Conta e autenticação

- RF01 `[implementado]`: o sistema deve permitir que um visitante se cadastre como pessoa física (nome, e-mail, senha, CPF) ou jurídica (razão social, e-mail, senha, CNPJ), registrando consentimento LGPD versionado. O cadastro público é **fechável por configuração** (`REGISTRATION_ENABLED`, default **desligado** desde a ADR-0014 — fail-closed): desligado, `POST /api/users` recusa com 403 — premissa de validade da ADR-0008/ADR-0014 no ambiente de demonstração pública.
- RF02 `[implementado]`: o sistema deve permitir que um usuário autentique via e-mail/senha, com canal `WEB` (cookie `HttpOnly`) ou `MOBILE` (Bearer token de longa duração).
- RF03 `[implementado]`: o sistema deve permitir que um usuário habilite MFA via TOTP (QR code) e receba um lote de códigos de backup de uso único.
- RF04 `[implementado]`: o sistema deve exigir o segundo fator no login quando o MFA estiver habilitado, aceitando código TOTP ou código de backup.
- RF05 `[implementado]`: o sistema deve permitir logout (revogação do token/sessão) e recuperação de senha por e-mail, sem revelar se o e-mail existe (anti-enumeração).
- RF06 `[implementado]`: a sessão WEB deve renovar-se via refresh token opaco rotacionado, detectando e reagindo ao reuso de um token já trocado.
- RF20 `[implementado]`: o sistema deve exigir a senha atual para iniciar uma troca de e-mail e só efetivá-la após confirmação pelo novo endereço (token hasheado, com expiração), revogando todas as sessões da conta na confirmação.
- RF21 `[implementado]`: o sistema deve permitir entrar em contas de demonstração (residencial e comercial) sem e-mail nem senha, com o backend resolvendo a conta internamente, quando `DEMO_LOGIN_ENABLED` estiver ligado — independente de `REGISTRATION_ENABLED`.
- RF44 `[planejado — Fase 30]`: o sistema deve permitir que um usuário veja suas sessões ativas (dispositivo, origem, último acesso) e encerre qualquer uma delas, individualmente ou todas as outras de uma vez. `AuthToken`/`RefreshToken` hoje não guardam device/IP/user-agent — só canal e datas; a granularidade real de "dispositivo, origem" depende de decisão na execução da Fase 30.

### Hierarquia do consumidor

- RF07 `[implementado]`: o sistema deve permitir que um usuário cadastre Propriedades (endereço, distribuidora, sistema elétrico, classe de faturamento B1/B2/B3), Áreas dentro de uma Propriedade e Aparelhos dentro de uma Área.
- RF08 `[implementado]`: o sistema deve permitir que um usuário consulte o catálogo de distribuidoras de energia (somente leitura, dados tarifários reais) e a bandeira tarifária vigente.
- RF24 `[implementado]`: o sistema deve manter a bandeira tarifária vigente sincronizada automaticamente com a fonte oficial da ANEEL (ADR-0007), permitindo override manual por usuário `ADMIN` — a sincronização automática nunca é o único caminho para corrigir um valor errado.
- RF46 `[planejado — Fase 23]`: o sistema deve concentrar a gestão do cadastro (Propriedade, Área, Dispositivo, Medidor) numa tela única de Configurações, exibindo a estrutura hierárquica completa com ações de edição e exclusão em cada nível.

### Medição IoT

- RF09 `[implementado]`: o sistema deve permitir que um usuário vincule um Medidor a exatamente um alvo (Propriedade, Área ou Aparelho), configurando o protocolo de conexão (MQTT, Modbus TCP/RTU, EtherNet/IP, Profibus, PROFINET, RS232, RS485).
- RF10 `[implementado]`: o sistema deve ingerir amostras elétricas (tensão, corrente, potência, fator de potência) do medidor e agregá-las em leituras por minuto, com médias ponderadas por tempo de vigência de cada amostra.
- RF11 `[implementado]`: o sistema deve expor as leituras e disparos de alerta em tempo real via SSE, por usuário autenticado.
- RF37 `[planejado — Fase 25]`: o sistema deve ingerir e persistir o conjunto ampliado de grandezas elétricas por fase — tensão por fase e fase-neutro média, desequilíbrio, corrente por fase e de neutro, potência ativa total e por fase, reativa, aparente, frequência, fator de potência por fase, e THD de tensão e de corrente por fase.
- RF47 `[implementado]`: o simulador IoT deve permitir que o administrador da aplicação gerencie redes e medidores de demonstração, publicando pelo protocolo MQTT, com acesso restrito (não público e não divulgado na documentação). Suporte a Modbus TCP/RTU é `[planejado — Fase 31]` — hoje o simulador só emula MQTT.

### Consumo, custo e análise

- RF12 `[implementado]`: o sistema deve permitir que um usuário consulte consumo (kWh) agregado por minuto, hora, dia, mês ou ano, em qualquer nível da hierarquia (Propriedade/Área/Aparelho).
- RF13 `[implementado]`: o sistema deve calcular o custo em reais de cada agregação para o Grupo B, devolvendo a decomposição completa (energia, bandeira, tributos, CIP, total) — ver RN10–RN16. O caminho binômio do Grupo A não amplia este requisito: é RF29, porque o cálculo ramifica por grupo em vez de generalizar (RN23).
- RF22 `[implementado]`: o sistema deve permitir simular o custo de um consumo hipotético, informado em kWh direto ou em watts × horas de uso, sem persistir a simulação.
- RF38 `[planejado — Fase 24]`: o sistema deve permitir que um usuário analise as grandezas elétricas de um item selecionado — em tempo real e em série histórica, escolhendo grandeza, janela (hora/dia) e agregação. A cobertura completa de grandeza depende de RF37 (Fase 25); até lá, a análise opera sobre o que já é medido hoje.
- RF39 `[planejado — Fase 26]`: o sistema deve permitir comparar dois períodos arbitrários (A e B) de um mesmo alvo e grandeza, apresentando o gráfico e as diferenças entre eles.

### Tarifação — Grupo A e modalidades horárias

- RF25 `[planejado — Fase 19]`: o sistema deve permitir cadastrar uma Propriedade do Grupo A com subgrupo (A1–A4, AS), modalidade tarifária e demanda contratada em kW, validando a demanda como obrigatória conforme a modalidade.
- RF26 `[planejado — Fase 19]`: o catálogo tarifário deve comportar valores por distribuidora × subgrupo × modalidade × posto, com tarifa de energia (TUSD + TE) e de demanda (TUSD demanda), preservando sem perda os dados de Grupo B existentes.
- RF27 `[planejado — Fase 19]`: o sistema deve classificar o consumo por posto tarifário (ponta, intermediário, fora de ponta) conforme horário e dia, com janela de ponta configurável por distribuidora e calendário de feriados nacionais, incluindo os móveis.
- RF28 `[planejado — Fase 19]`: o sistema deve apurar a demanda medida (kW) por posto a partir das próprias leituras do medidor, sem exigir que o usuário informe qualquer valor.
- RF29 `[planejado — Fase 19]`: o sistema deve calcular a conta binômia da modalidade Horária Verde, devolvendo a decomposição separada de demanda, consumo por posto, bandeira, tributos e CIP.
- RF30 `[planejado — Fase 20]`: o sistema deve suportar a modalidade Horária Azul, com duas demandas contratadas (ponta e fora de ponta) e quatro tarifas distintas.
- RF31 `[planejado — Fase 20]`: o sistema deve calcular a ultrapassagem de demanda e permitir que um usuário do Grupo A configure alerta de ultrapassagem da demanda contratada. *(Substitui o item anteriormente registrado sem número como "RFXX".)*
- RF32 `[planejado — Fase 20]`: o sistema deve calcular a energia reativa excedente quando o fator de potência ficar abaixo do mínimo regulatório.
- RF33 `[planejado — Fase 21]`: o sistema deve distinguir o ambiente de contratação da Propriedade (ACR cativo × ACL livre) e registrar o contrato de energia do ACL — comercializadora, volume contratado, submercado, fonte e vigência.
- RF34 `[planejado — Fase 21]`: o sistema deve permitir registrar e consultar o PLD (Preço de Liquidação das Diferenças) por submercado, usado na análise econômica do mercado livre.
- RF35 `[planejado — Fase 21]`: o sistema deve comparar o custo no mercado cativo com o custo no mercado livre a partir do consumo real do próprio usuário, respondendo "vale a pena migrar?".
- RF36 `[planejado — Fase 22]`: o sistema deve suportar a modalidade Tarifa Branca para o Grupo B, incluindo o alerta de quando ela sai mais cara que a Convencional para o perfil de consumo do usuário.
- RF45 `[planejado — sem fase]`: o sistema deve permitir manter os parâmetros tarifários da distribuidora com vigência (tarifas por posto, tributos, postos horários e regra de feriados), preservando o histórico para recálculo de períodos anteriores.

### Alertas e notificações

- RF14 `[implementado]`: o sistema deve permitir que um usuário crie um alerta por faixa de potência (potência de referência em kW + tolerância em %) associado a um medidor, habilitando/desabilitando-o.
- RF15 `[implementado]`: o sistema deve avaliar cada amostra recebida contra os alertas habilitados do medidor e abrir/fechar episódios de disparo conforme a histerese de RN32.
- RF16 `[implementado]`: o sistema deve persistir cada episódio de disparo encerrado (início, fim, duração, potência mín./máx./média, nº de amostras) e notificar o usuário.
- RF23 `[implementado]`: o sistema deve permitir que um usuário consulte suas notificações e as remova, individualmente ou todas de uma vez.
- RF43 `[planejado — Fase 28]`: o sistema deve permitir configurar alerta de meta, disparado ao atingir um percentual definido da meta, visível junto dos demais alertas.

### Relatórios e metas

- RF40 `[planejado — Fase 27]`: o sistema deve permitir emitir um relatório sob demanda escolhendo escopo (propriedade, área, dispositivo), tipo (mensal, consumo, alertas, qualidade de energia, demanda), período e formato (PDF ou CSV), registrando-o no histórico.
- RF41 `[planejado — Fase 27]`: o sistema deve permitir agendar relatórios automáticos (periodicidade, dia de envio, destinatários), listar os envios agendados e gerenciar as configurações criadas.
- RF42 `[planejado — Fase 28]`: o sistema deve permitir que um usuário cadastre metas anuais de consumo (kWh) e custo (R$) — e de demanda, no Grupo A — com meta mês a mês, ano de referência e acompanhamento de realizado, desvio e situação.

### Dados pessoais e administração

- RF17 `[implementado]`: o sistema deve permitir que um usuário exporte seus próprios dados pessoais em **JSON ou PDF** (portabilidade, Art. 18 LGPD).
- RF18 `[implementado]`: o sistema deve permitir que um usuário com papel `ADMIN` consulte a trilha de auditoria (login, logout, acesso negado, CRUD de dados pessoais), com filtros e paginação.
- RF19 `[implementado]`: o sistema deve registrar em trilha de auditoria: login, logout, acesso negado, CRUD de usuário/propriedade, exportação de dados, habilitação/desabilitação de MFA e reuso de refresh token detectado.

## 2.2 Requisitos Não Funcionais

### Segurança

- RNF01 `[implementado]`: rate limit global de 1000 requisições / 15 min por IP; rate limit estrito de 10 requisições / 15 min por IP em `/login`, `/login/mfa`, `/demo-login`, `/forgot-password`, `/reset-password`, `/confirm-email-change` e no cadastro (`POST /api/users`, escopado só na criação — as rotas autenticadas de `/api/users/:id` seguem no limite global).
- RNF02 `[implementado]`: senhas com bcrypt (12 rounds); CPF, CNPJ, endereço, segredo MFA e credencial MQTT do medidor (`Meter.extra.password`) cifrados em repouso com AES-256-GCM — **cinco chaves segregadas por finalidade**, cada uma obrigatória e sem default; refresh token, token de sessão, token de reset de senha e token de troca de e-mail armazenados como hash SHA-256, nunca em texto claro.
- RNF03 `[implementado]`: sessão WEB expira em 1h (`JWT_WEB_EXPIRES_IN`, renovável via refresh token de 7 dias); token MOBILE expira em 90 dias (`MOBILE_TOKEN_EXPIRES_IN`), sem rotação.
- RNF04 `[implementado]`: HSTS com 1 ano + subdomínios; CSP deny-all na API (JSON pura) e CSP própria no SPA (`frontend/index.html`, via `<meta>`); redirect HTTP→HTTPS sempre para um **host canônico fixo** (`PUBLIC_API_ORIGIN`), nunca o header `Host` do cliente — requisição com Host fora do canônico recebe 400; `CORS_ORIGIN` não pode ser `*` e `PUBLIC_API_ORIGIN` não pode ficar no default de localhost em produção (ambos guardados por schema, fail-fast no boot).
- RNF05 `[implementado]`: cada controle crítico (A01, A04, A05, A07, A10 do OWASP Top 10:2025) deve ter teste automatizado que falha se o controle for removido.

### Retenção e conformidade

- RNF06 `[implementado]`: tokens de autenticação e resets de senha inativos (expirados/revogados/usados) são expurgados após 30 dias (`DATA_RETENTION_AUTH_TOKEN_DAYS` / `DATA_RETENTION_PASSWORD_RESET_DAYS`); refresh tokens inativos após 30 dias (`DATA_RETENTION_REFRESH_TOKEN_DAYS`); logs de auditoria após 730 dias / ~2 anos (`DATA_RETENTION_AUDIT_LOG_DAYS`).

### Qualidade e entrega

- RNF07 `[implementado]`: o pipeline de CI (`.github/workflows/ci.yml`) deve bloquear o merge em caso de falha de lint, build, testes ou `npm audit --audit-level=high` nos **três** pacotes (backend, frontend e `iot-simulator`), mais a suíte E2E Playwright, o `root-format` e o `secret-scan` (gitleaks, com config própria em `.gitleaks.toml`) — 15 jobs no total.
- RNF08 `[implementado]`: instalação de dependências sempre via `npm ci` (build reprodutível a partir do lockfile).
- RNF09 `[implementado]`: TypeScript em modo `strict`, sem uso de `any` (ver `06-code-quality-standards.md`).

### Apresentação

- RNF10 `[implementado]`: toda grandeza numérica é apresentada em formato pt-BR — vírgula decimal, `R$` para moeda, unidade explícita (kWh, kW, V, A) — inclusive em relatórios exportados.
- RNF11 `[implementado]`: a interface segue WCAG 2.2 AA, com foco de teclado sempre visível e contraste mínimo verificado nos dois temas (claro e escuro) — ver `10-design-system.md`.

## 2.3 Regras de Negócio

Regras que valem independentemente da tela ou do endpoint. Cada uma cita a origem: norma do setor elétrico, ADR do projeto ou o serviço que a implementa.

### Cadastro e hierarquia

- RN01 `[implementado]`: um Medidor pertence a **exatamente um** alvo — Propriedade, Área **ou** Aparelho; nunca a nenhum, nunca a mais de um. Regra cruzada validada no `meter.service.ts` (o schema sozinho não a expressa).
- RN02 `[implementado]`: a posse é resolvida de baixo para cima — Aparelho → Área → Propriedade → Usuário. Nenhum recurso é acessível fora dessa cadeia, mesmo com o identificador correto.
- RN03 `[implementado]`: Área e Aparelho são **recortes internos** da unidade consumidora, não unidades consumidoras próprias — consequência direta em RN13 e RN14.
- RN04 `[implementado]`: a senha de protocolo de um Medidor nunca sai da API. A resposta devolve `extra.passwordSet: boolean`; o valor cifrado só é decifrado internamente, para o worker abrir a conexão.

### Conta, sessão e dados pessoais

- RN05 `[implementado]`: redefinir senha e confirmar troca de e-mail revogam **todas** as sessões do usuário na mesma transação que efetiva a mudança — um sequestro anterior à troca não sobrevive a ela.
- RN06 `[implementado]`: o papel (`role`) é sempre relido do banco a cada requisição, nunca aceito como claim do JWT.
- RN07 `[implementado]`: respostas de recuperação de senha são idênticas exista ou não a conta (anti-enumeração).
- RN08 `[implementado]`: desabilitar o MFA exige senha **e** código válido — nunca só um dos dois; reconfigurar exige desabilitar antes (step-up).
- RN09 `[implementado]`: os ambientes publicados não tratam dado de titular real (ADR-0014). O cadastro público nasce fechado (fail-closed) e reabri-lo exige nova auditoria de conformidade.

### Tarifação — Grupo B (monômio)

Fórmulas conferidas contra `backend/src/shared/tariff/tariff.service.ts`, não apenas contra o documento de referência.

- RN10 `[implementado]`: **custo de disponibilidade** — o faturamento tem piso mensal em kWh conforme o sistema elétrico (REN 1.000/2021, art. 291):

  ```text
  piso = 30 kWh (monofásico) | 50 kWh (bifásico) | 100 kWh (trifásico)
  kwhBilled = max(kwhConsumed, piso)
  ```

- RN11 `[implementado]`: **energia e bandeira** compõem a base tributável:

  ```text
  energia  = kwhBilled × (TUSD + TE)
  bandeira = kwhBilled × (valorPor100Kwh / 100)
  ```

- RN12 `[implementado]`: **tributos "por dentro"** — ICMS, PIS e COFINS integram a própria base de cálculo, então a alíquota efetiva é maior que a nominal:

  ```text
  baseSemTributos = energia + bandeira
  totalComTributos = baseSemTributos / (1 − (ICMS + PIS + COFINS))
  tributos = totalComTributos − baseSemTributos
  ```

- RN13 `[implementado]`: **CIP/COSIP fica fora da base de tributos** — é taxa municipal somada depois, e só no alvo Propriedade:

  ```text
  totalPropriedade = totalComTributos + CIP
  ```

- RN14 `[implementado]`: alvo **Área ou Aparelho** não recebe piso de disponibilidade nem CIP — os dois pertencem à unidade consumidora inteira, e rateá-los por submedidor cobraria duas vezes (decorre de RN03):

  ```text
  kwhBilled = kwhConsumed
  totalSubAlvo = totalComTributos
  ```

- RN15 `[implementado]`: o cálculo devolve sempre a **decomposição completa** (energia, bandeira, tributos, CIP, total), nunca só o total — a UI precisa detalhar de onde vem cada real.
- RN16 `[planejado — sem fase]`: a tarifa efetiva ao consumidor, quando exibida em R$/kWh, segue a mesma composição:

  ```text
  tarifaFinal = (TUSD + TE) / (1 − tributos) + bandeira
  ```

### Tarifação — Grupo A (binômio)

Origem: `.claude/docs/O-Sistema-Eletrico-Brasileiro.md`. Oráculos de teste: Exemplo 6 (A4 Verde, R$ 22.464,75) e Exemplo 7 (A4 Azul com ERE, R$ 101.496,36).

- RN17 `[planejado — Fase 19]`: **conta binômia** — demanda e consumo são cobrados separadamente, e os tributos incidem por dentro sobre o conjunto:

  ```text
  parcelaConsumo = Σ_posto (consumoPosto × (TUSDenergiaPosto + TEenergiaPosto))
  baseSemTributos = parcelaDemanda + parcelaConsumo + ERE + bandeira + ultrapassagem
  totalComTributos = baseSemTributos / (1 − (ICMS + PIS + COFINS))
  total = totalComTributos + CIP
  ```

- RN18 `[planejado — Fase 19 / Fase 20]`: **parcela de demanda** varia com a modalidade:

  ```text
  Verde: parcelaDemanda = demandaContratada × TUSDdemanda
  Azul:  parcelaDemanda = Σ_posto (demandaContratadaPosto × TUSDdemandaPosto)   // ponta e fora de ponta
  ```

- RN19 `[planejado — Fase 19]`: **demanda medida** é a maior potência média em janelas de 15 minutos, apurada por posto — derivada das próprias leituras, não informada pelo usuário:

  ```text
  demandaPosto = max( média(potênciaAtiva) em cada janela de 15 min do posto )
  ```

  Janela incompleta (medidor offline em parte do intervalo) não pode ser tratada como janela cheia: uma janela de 3 minutos virando "demanda" infla a conta.

- RN20 `[planejado — Fase 20]`: **ultrapassagem de demanda** só existe acima da tolerância de 5%, é cobrada ao triplo e entra **antes** dos tributos:

  ```text
  se demandaMedida > 1,05 × demandaContratada:
      ultrapassagem = (demandaMedida − demandaContratada) × 3 × TUSDdemanda
  senão:
      ultrapassagem = 0
  ```

- RN21 `[planejado — Fase 20]`: **energia reativa excedente (ERE)** é cobrada quando o fator de potência fica abaixo de 0,92 — indutivo medido entre 6h e 24h, capacitivo entre 0h e 6h, tarifado em R$/kVArh.
- RN22 `[planejado — Fase 19]`: a **bandeira incide sobre o consumo medido, nunca sobre a demanda**.
- RN23 `[planejado — Fase 19]`: **não há piso de disponibilidade no Grupo A** — o papel equivalente é da demanda contratada, que é paga integralmente mesmo se não utilizada. O caminho de cálculo ramifica por grupo em vez de aplicar o piso incondicionalmente.

### Postos tarifários e calendário

- RN24 `[planejado — Fase 19]`: o consumo é classificado em **ponta, intermediário e fora de ponta** conforme o horário. A janela de ponta é configurável **por distribuidora** — tipicamente 18h–21h, mas varia por local e estado; um valor fixo no código estaria errado para parte do catálogo.
- RN25 `[planejado — Fase 19]`: **fim de semana e feriado contam integralmente como fora de ponta.** O calendário inclui os feriados móveis derivados da Páscoa (Carnaval, Sexta-Feira Santa, Corpus Christi) — é cálculo, não lista fixa: uma lista fixa funciona por um ano e silenciosamente cobra ponta num feriado no ano seguinte.
- RN26 `[implementado]`: o Brasil não tem horário de verão desde 2019 — premissa registrada, a revisar se voltar a existir.
- RN27 `[planejado — Fase 22]`: na Tarifa Branca, o **custo de disponibilidade é calculado com a tarifa Convencional**, não com as horárias (REN 1.098/2024) — armadilha que uma implementação ingênua erra.
- RN28 `[planejado — Fase 22]`: a Tarifa Branca é **vedada** a B4, à baixa renda e a quem recebe outros descontos; é voluntária para B1 e B3.

### Medição e alertas

- RN29 `[implementado]`: uma amostra só entra no pipeline se for válida — tensão, corrente e potência não negativas e fator de potência dentro de [0,1]. Amostra inválida é descartada com log, sem derrubar a conexão.
- RN30 `[implementado]`: o intervalo entre amostras é limitado a 5 segundos no cálculo de energia — um medidor que ficou offline não pode gerar um salto de consumo proporcional ao tempo parado.
- RN31 `[implementado]`: a agregação por minuto usa **média ponderada pelo tempo de vigência** de cada amostra, não média aritmética.
- RN32 `[implementado]`: **histerese assimétrica do alerta** — abre após 3 amostras consecutivas fora da faixa, fecha após 5 consecutivas dentro dela. A assimetria é proposital: é mais barato permanecer "em alerta" um pouco além do que alternar entre disparado e normal a cada amostra.

  ```text
  minW = referênciaKW × 1000 × (1 − tolerância%)
  maxW = referênciaKW × 1000 × (1 + tolerância%)
  fora = potênciaW < minW  ou  potênciaW > maxW
  ```

- RN33 `[implementado]`: alerta desabilitado ou excluído durante um episódio em curso **encerra e persiste** o episódio no estado em que estava — não o descarta.
- RN34 `[planejado — Fase 25]`: o sistema aceita medidores que não medem todas as grandezas; grandeza ausente é exibida como "-", nunca como zero — zero é uma medição, ausência não é. *(Quais grandezas o medidor real entrega medidas e quais são calculadas é decisão em aberto — ver `07-decisoes-em-aberto.md`; bloqueia a Fase 25.)*

### Relatórios e metas

- RN35 `[planejado — Fase 27]`: relatório gerado é **imutável** — para obter informação diferente, gera-se outro. Todos seguem template padronizado com a identidade visual do projeto.
- RN36 `[planejado — Fase 27]`: no agendamento, o dia de envio aceita 1 a 31, mas meses mais curtos não têm todos eles — quando o dia escolhido não existe no mês (fevereiro, meses de 30 dias, ano bissexto), o envio ocorre no **último dia do mês**.
- RN37 `[planejado — Fase 28]`: só a meta do ano vigente pode ser editada. Metas de anos anteriores são imutáveis, não podem ser excluídas e podem ser usadas como base de referência para uma meta nova.

## 2.4 Funcionamento

**FNC001 — Ingestão de leitura IoT até a leitura agregada** `[implementado]`

1. O adaptador do protocolo configurado no Medidor (`IoTConnectionManager`) recebe uma amostra bruta.
2. `IoTDataProcessor` valida a amostra (RN29), normaliza (calcula `deltaSeconds` desde a anterior, com o clamp de RN30) e a repassa ao `MinuteBuffer` do medidor.
3. `MinuteBuffer` acumula a amostra no balde do minuto corrente, ponderando tensão/corrente/potência/fator de potência pelo `deltaSeconds` (RN31).
4. `MinuteRollupScheduler` persiste periodicamente os baldes fechados como `MeterReading`, via upsert idempotente (`secondsCovered` permite merge se o rollup rodar mais de uma vez no mesmo minuto).
5. A amostra bruta é simultaneamente repassada ao `AlertEvaluator` (FNC002) e transmitida via SSE (`UserEventHub`) a quem estiver com a tela aberta.

**FNC002 — Avaliação e ciclo de vida de um alerta** `[implementado]`

1. `AlertEvaluator` mantém em memória um cache `meterId → Alert[]` (só habilitados), carregado no boot e invalidado a cada create/update/delete/toggle de alerta.
2. A cada amostra recebida, compara a potência ativa contra a faixa de RN32.
3. Fora da faixa por 3 amostras consecutivas → abre o episódio (`firing = true`), guardando `startedAt` e acumulando min/máx/soma de potência.
4. Dentro da faixa por 5 amostras consecutivas → fecha o episódio: persiste um `AlertTriggerEvent` (duração, estatísticas) e emite notificação + evento SSE.
5. Se o alerta for desabilitado ou excluído durante um episódio em curso, aplica-se RN33.

**FNC003 — Cálculo de custo de uma agregação de consumo (Grupo B)** `[implementado]`

1. Dado um `kwhConsumed` do período e o alvo, busca os parâmetros tarifários da distribuidora da Propriedade (`tusdPerKwh`, `tePerKwh`, `icmsRate`, `pisRate`, `cofinsRate`) e o valor por 100 kWh da bandeira vigente.
2. Se o alvo for **Propriedade**: aplica o piso de RN10 e soma a CIP conforme RN13; Área e Aparelho seguem RN14.
3. Calcula energia e bandeira (RN11) e aplica os tributos por dentro (RN12).
4. Retorna a decomposição completa (RN15).

> As telas descritas de FNC004 a FNC013 nascem do handoff `2026-09-06-lumitrack-completo` (tela `LumiTrack Home v2`), que **substitui a `Home` anterior como design-alvo do app logado**. A navegação passa a ser Painel · Análise · Histórico · Relatórios · Alertas · Distribuidoras · Sobre, mais Configurações. Cada FNC registra o que já existe hoje, para o planejamento não confundir "redesenhar" com "construir do zero".

**FNC004 — Painel** `[planejado — Fase 29]` *(estrutura de navegação: Fase 23)*

Tela inicial com o panorama geral, filtrada pela propriedade selecionada no seletor da topbar. Seções:

1. Bandeira tarifária vigente (Grupo B).
2. Alertas em disparo no momento.
3. Consumo de hoje em tabela hierarquizada, expansível por nível.
4. Gráfico do peso de cada medidor no total.
5. Gráfico de meta versus realizado (depende de FNC011).
6. Gráfico de demanda contratada versus demanda atual, exclusivo do Grupo A (depende de RF28).

**Hoje:** o Painel já entrega bandeira vigente, alertas em disparo, KPIs de consumo/custo e gráfico de potência em tempo real. Faltam a tabela hierarquizada, o peso por medidor, a meta e a demanda.

**FNC005 — Análise** `[planejado — Fase 24 (Consumo e Custos); Fase 25 (Grandezas Elétricas)]`

Onde o usuário examina em detalhe consumo, custo e medições de cada item cadastrado.

1. À esquerda, lista hierarquizada (Propriedades → Áreas → Dispositivos) com campo de busca; à direita, a página de detalhes do item selecionado.
2. A página de detalhes tem duas abas: **Consumo e Custos** e **Grandezas Elétricas**.
3. Na aba **Consumo e Custos**: dados do item e do seu medidor, gráfico de consumo em tempo real (minuto a minuto) e lista de comparações — entre Áreas quando o alvo é uma Propriedade, entre Dispositivos quando o alvo é uma Área, sempre restrita aos que têm medidor vinculado.
4. Na aba **Grandezas Elétricas**: cards em tempo real (segundo a segundo) de tensão (por fase, fase-neutro média, desequilíbrio), corrente (por fase, neutro e média), potência (ativa total e por fase, reativa, aparente, frequência), fator de potência (média em destaque, por fase) e THD de tensão e corrente por fase. Grandeza não fornecida pelo medidor aparece como "-" (RN34).
5. Abaixo dos cards, a área de análise: o usuário escolhe janela do gráfico, dia, hora, agregação e grandeza, e aciona "Gerar análise" para plotar gráfico e tabela.
6. Com janela **Hora**, gráfico e tabela seguem a agregação escolhida. Com janela **Dia**, os dados são exibidos de hora em hora e os campos Hora e Agregação ficam desabilitados.

**Hoje:** existe a rota `/propriedades` com detalhes por nível e gráfico em tempo real, mas sem a aba de grandezas elétricas (que depende de RF37) e sem a área de análise configurável.

**FNC006 — Histórico e comparações** `[planejado — Fase 26]`

1. O usuário seleciona o alvo (Propriedade, Área ou Dispositivo) e a grandeza medida.
2. Define dois períodos — A (início e fim) e B (início e fim).
3. O sistema plota o gráfico comparativo e uma seção com as diferenças entre os períodos, incluindo a variação de B sobre A.

**FNC007 — Relatórios** `[planejado — Fase 27]`

Gestão e agendamento de relatórios em PDF e CSV, com template padronizado (referência: tela `LumiTrack Relatório A4` do handoff) e imutabilidade conforme RN35.

1. A tela reúne três blocos: emissão de um relatório, envios automáticos previstos para os próximos 15 dias, e histórico de todos os relatórios gerados.
2. Para emitir, o usuário seleciona **escopo** (propriedades, áreas, dispositivos), **tipo** (mensal, consumo, alertas, qualidade de energia, demanda — este último exclusivo do Grupo A), **período** (depende do tipo) e **formato** (depende do tipo). Ao acionar "Gerar relatório", o histórico é atualizado e o arquivo é oferecido para download.
3. No histórico, cada relatório pode ser baixado ou excluído.
4. O agendamento é configurado em Configurações → Relatórios (FNC008), acrescentando aos campos de emissão: **periodicidade** (diária, semanal, mensal, trimestral, semestral, anual), **dia do envio** (com a regra de RN36) e **destinatários** (e-mails separados por vírgula). A lista de configurações permite editar e excluir.

**Hoje:** a rota `/relatorios` entrega consulta de consumo com seletor em cascata e granularidades — não há emissão de arquivo, template, histórico nem agendamento.

**FNC008 — Configurações** `[planejado — Fase 23 (estrutura); Fase 27 (sub-página Relatórios); Fase 28 (sub-página Metas)]`

Menu à esquerda com as configurações disponíveis e, à direita, a página da configuração selecionada.

- **Cadastro:** seções de cadastro e a estrutura hierárquica completa, com botões de edição e exclusão em cada componente. As três ações abrem janela modal; a exclusão exige confirmação.
- **Relatórios:** gestão dos relatórios automáticos descritos em FNC007.
- **Metas:** gestão das metas descritas em FNC011.
- **Conta:** dados pessoais, troca de senha, exportação de dados (RF17), exclusão da conta e 2FA.

**FNC009 — Simulador IoT** `[implementado (item 2); planejado — Fase 31 (item 1)]`

1. O simulador provê os protocolos MQTT `[implementado]` e Modbus TCP/RTU `[planejado — Fase 31]`. *(A viabilidade de um simulador Modbus embutido, em vez de integração com simulador externo, é decisão em aberto — ver `07-decisoes-em-aberto.md`; bloqueia a Fase 31.)*
2. A interface permite ao administrador criar redes e adicionar dispositivos (nome, tópico MQTT, parâmetros iniciais), ligar/desligar cada dispositivo com indicação de "publicando há X segundos", injetar parâmetros (tensão, potência, fator de potência, ruído, perfil) e disparar anomalias. `[implementado]`
3. O acesso é restrito ao administrador da aplicação: o endereço não é público nem aparece em nenhum ponto da documentação. `[implementado]`

**FNC010 — Grandezas fornecidas pelo medidor** `[planejado — Fase 25]`

O medidor envia ao sistema: tensão (por fase, fase-neutro média, desequilíbrio); corrente (por fase e de neutro); potência (ativa total, reativa, aparente, ativa por fase, frequência); fator de potência por fase; THD de tensão por fase; THD de corrente por fase.

O sistema opera com qualquer medidor, inclusive os que não medem todas as grandezas — a ausência é exibida conforme RN34. *(Quais dessas grandezas um medidor real mede e quais ele calcula internamente é decisão em aberto — ver `07-decisoes-em-aberto.md`; a resposta define o que o `MeterReading` persiste.)*

**FNC011 — Metas** `[planejado — Fase 28]`

1. O usuário cadastra metas de consumo (kWh) e custo (R$); propriedades do Grupo A têm também meta de demanda.
2. A tela mostra: card "Metas de consumo anual" com a meta vigente e botão de nova meta; seção com gráfico de barras de meta versus realizado, acompanhada dos cards Meta do ano, Realizado até o mês corrente, Desvio acumulado em % e Consumo específico alvo em kWh; e o histórico de metas em tabela (ano, meta, realizado, desvio, base de referência e situação).
3. O histórico oferece as ações: usar como referência, editar (só a meta vigente) e excluir — conforme RN37.
4. O formulário de nova meta pede: ano da meta, ano de referência, consumo específico alvo em kWh, meta mês a mês em kWh e o percentual de alerta ao atingir (RF43).

**FNC012 — Sessões ativas** `[planejado — Fase 30]`

1. O usuário consulta em quais dispositivos sua conta está autenticada.
2. Pode encerrar qualquer sessão individualmente, ou todas as outras de uma vez.
3. Em modo de demonstração, a listagem é apenas representativa.

**FNC013 — Alertas (ampliação)** `[planejado — Fase 20 (item 1); Fase 28 (item 2)]`

1. Para verificação de ultrapassagem de demanda contratada, a demanda atual considerada é o agregado de 15 minutos (RN19) — `[planejado — Fase 20]`.
2. O usuário pode configurar alerta de meta, que aparece na página de alertas junto dos demais — `[planejado — Fase 28]`.
