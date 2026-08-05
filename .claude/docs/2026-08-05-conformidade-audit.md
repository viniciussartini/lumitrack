# Auditoria de Conformidade Legal (LGPD) — 2026-08-05

> Escopo: LGPD (Lei nº 13.709/2018), regulamentação da ANPD (Res. CD/ANPD 2/2022, 15/2024, 19/2024) e Marco Civil da Internet (Lei 12.965/2014), conforme o checklist `.claude/project_context/09-conformidade-legal.md`.
> Base de evidências: código real dos pacotes `backend/`, `frontend/`, `iot-simulator/`, schema Prisma, documentação em `.claude/docs/` e contexto em `.claude/project_context/`.
> **Este laudo não é parecer jurídico.** Os achados Críticos e Altos envolvem obrigações legais com sanção prevista (Art. 52) e devem ser validados por advogado/encarregado antes de qualquer operação com titulares reais.

## Resumo (nº de achados por risco)

| Risco | Qtde | Temas |
|---|---|---|
| 🔴 Crítico | 2 | Canal do titular inexistente; transferência internacional sem SCC + declaração incorreta no aviso |
| 🟠 Alto | 7 | ROPA; RIPD; DPAs/operadores; PII e credenciais em log; retenção indefinida do dado de consumo; DSAR incompleto; base legal/consentimento empacotado |
| 🟡 Médio | 6 | Credenciais MQTT em claro; prazo de incidente fora da Res. 15/2024; aviso de privacidade sem cookies/prazos; menores; Art. 20; Marco Civil Art. 15 |
| 🟢 Baixo | 4 | UX de direitos incompleta; drift documental; TLS SMTP opcional; credenciais de demo versionadas |
| **Total** | **19** | |

**Veredito de prontidão:** o LumiTrack tem uma base técnica de proteção de dados acima da média para um projeto solo (cifra em repouso por categoria de dado, trilha de auditoria, expurgo agendado, MFA, consentimento versionado). O que falta é quase inteiramente a **camada de governança documental e contratual** — justamente a que a ANPD fiscaliza primeiro em caso de incidente. O sistema **não está apto a operar com titulares reais** enquanto os dois achados Críticos existirem.

---

## Achados

### [CRÍTICO] Não existe canal de comunicação com o titular — e o aviso de privacidade aponta para um canal inexistente — Res. CD/ANPD 2/2022 Art. 11 · LGPD Art. 18 §1º, Art. 41 §4º

- **Evidência:**
  - `frontend/src/legal/privacy-policy.md` § 1, § 6 e § 9 remetem o titular três vezes ao "e-mail de contato do encarregado (DPO) **informado no rodapé da plataforma**".
  - O rodapé não tem e-mail nenhum: `frontend/src/pages/landing/LandingPage.tsx` (`FOOTER_COLUMNS`, linhas 562-591, e `LandingFooter`, 593-660) contém apenas links de produto, conta, Termos/Privacidade/LGPD e um link para o GitHub.
  - Busca por `mailto`/endereço de contato em todo `frontend/src` retorna zero ocorrências fora de fixtures de teste e dos usuários de demonstração (`frontend/src/config/demoUsers.ts`).
  - `frontend/src/pages/profile/ProfilePage.tsx` (`PrivacyDataCard`, linhas 216-296) oferece apenas "Exportar meus dados" e "Excluir minha conta" — nenhum caminho para confirmação de tratamento, oposição, informação sobre compartilhamento, revogação de consentimento ou revisão de decisão automatizada.
- **Por que é crítico:** o regime de agente de pequeno porte **dispensa o encarregado, mas não o canal de comunicação** (Res. CD/ANPD 2/2022, Art. 11). Hoje, os cinco direitos do Art. 18 que não estão automatizados na plataforma são, na prática, **inexercíveis**. Pior: o aviso de privacidade afirma que o canal existe, o que soma uma falha de transparência (Art. 6º, VI) à falha de disponibilização.
- **Recomendação:**
  1. Definir um endereço de contato de privacidade (pode ser um alias simples, ex.: `privacidade@<domínio>`) e publicá-lo no rodapé da landing **e** no shell autenticado, além de substituir as três referências vagas no `privacy-policy.md` pelo endereço literal.
  2. Documentar o procedimento interno de atendimento com o **prazo em dobro do pequeno porte** (30 dias para o Art. 18 §3º/§5º; 30 dias para a resposta simplificada do §2º).
  3. Adicionar ao card "Privacidade & dados" do Perfil um bloco "Exercer meus direitos" com o canal e a lista dos direitos do Art. 18, incluindo os que não são autoatendidos.

---

### [CRÍTICO] Transferência internacional não avaliada, sem SCCs — e o aviso de privacidade declara que ela não ocorre — Art. 33-36 · Res. CD/ANPD 19/2024 · Art. 6º VI

- **Evidência:**
  - `.claude/project_context/07-decisoes-em-aberto.md`: "**Hospedagem e infra de produção:** onde o backend, frontend e banco rodam (nenhuma config de Vercel/Railway/Neon ou equivalente existe no repositório hoje)" e "**Observabilidade de produção:** rastreamento de erro/APM (ex.: Sentry)".
  - `backend/.env.example` só parametriza `SMTP_HOST/USER/PASS` genéricos — nenhum provedor definido, nenhuma restrição de região.
  - `frontend/src/legal/privacy-policy.md` § 4 afirma: *"Não realizamos transferência internacional de dados além do necessário para o funcionamento do provedor de e-mail, quando aplicável."*
  - `.claude/docs/RUNBOOK_INCIDENTES.md` § 1.1 já pressupõe "rotear para um agregador externo (CloudWatch, DataDog, etc.)" — todos EUA — sem qualquer análise de transferência.
- **Por que é crítico:** o checklist do `09` marca este item como **CRÍTICO neste stack** por um motivo concreto: o período de graça da Res. CD/ANPD 19/2024 encerrou em **agosto/2025**. No instante em que o deploy acontecer em Vercel/Railway/Neon/Sentry (ou em qualquer SMTP norte-americano — Resend, SendGrid, Mailgun, SES), haverá transferência internacional para país **sem decisão de adequação** e sem Cláusulas-Padrão Contratuais incorporadas. A declaração atual do aviso de privacidade tornar-se-á **factualmente falsa no dia do deploy**, transformando um problema contratual num problema de transparência.
- **Recomendação:**
  1. Tratar a decisão de hospedagem do `07` como **decisão de conformidade**, não só técnica: avaliar região Brasil (ex.: Neon `sa-east-1`, RDS São Paulo, provedores nacionais) ou UE (adequada pela Res. 32/2026) antes de default para EUA — é a mitigação mais barata.
  2. Para cada provedor que permanecer nos EUA, **exigir a incorporação das SCCs da ANPD** ao contrato antes do primeiro byte de dado pessoal; registrar a via assinada fora do repositório e referenciá-la no ROPA.
  3. Reescrever o § 4 do `privacy-policy.md` com a lista nominal de operadores, país de processamento e o mecanismo de transferência adotado (SCC / adequação), incrementando `CURRENT_CONSENT_VERSION` em `backend/src/shared/legal/consentVersion.ts`.
  4. Registrar a decisão como ADR (`.claude/docs/adr/`), já que ela vincula arquitetura e conformidade.

---

### [ALTO] Não existe ROPA (registro das operações de tratamento) — Art. 37

- **Evidência:** busca por `ROPA` / "registro de operações" em `.claude/docs/` retorna apenas a menção no próprio checklist `09` e no prompt do agente. O inventário de `.claude/docs/README.md` lista auditoria, runbook, RBAC, planos de IoT e ADRs — nenhum registro de tratamento. O mais próximo é a tabela § 2 do `privacy-policy.md`, que é aviso ao titular, não registro do controlador (não traz base legal por operação, prazo de retenção, operadores, medidas de segurança nem transferências).
- **Impacto:** o registro é exigível **mesmo do agente de pequeno porte** (em forma simplificada, Res. CD/ANPD 2/2022). É o primeiro documento pedido em fiscalização e o insumo obrigatório dos achados de transferência internacional, DPA e retenção abaixo.
- **Recomendação:** criar `.claude/docs/ROPA.md` com uma linha por operação já identificável no código — cadastro/autenticação (`users`), gestão de propriedades e endereço (`properties`), medição e consumo (`meters`, `meter_readings`), alertas (`alerts`, `alert_trigger_events`), trilha de auditoria (`audit_logs`), recuperação de senha (SMTP), MFA (`mfa_backup_codes`) — e, para cada uma: finalidade, categorias de dados e de titulares, **base legal do Art. 7º**, prazo de retenção, operadores envolvidos, transferência internacional e medidas de segurança. Manter versionado e atualizado por toda feature que toque dado pessoal (vale acrescentar isso ao Definition of Done da skill `nova-feature`).

### [ALTO] Nenhum RIPD/DPIA, embora o tratamento tenha o perfil clássico de alto risco — Art. 38 · Art. 10 §3º

- **Evidência:**
  - `backend/prisma/schema.prisma`, modelo `MeterReading` (linhas 421-439): uma linha por medidor **por minuto**, com tensão, corrente, potência e fator de potência — alimentada por amostras a ~1/s (`.claude/project_context/02-requisitos.md`, RF10/FNC001).
  - `Meter` (linhas 389-415) pode ser vinculado a um **aparelho individual** (`deviceId`), e `Property` (317-347) guarda endereço cifrado, classe de faturamento e sistema elétrico. A cadeia `MeterReading → Meter → Device → Area → Property → User` liga cada leitura minuto-a-minuto a um **CPF e a um endereço**.
  - `AlertTriggerEvent` (515-531) persiste episódios com início, fim e duração — histórico comportamental.
- **Impacto:** medição elétrica granular dentro de uma residência é dado de comportamento que permite inferir **presença/ausência, rotina de sono, horários de trabalho e número de ocupantes**. Isso configura monitoramento sistemático de comportamento em escala, hipótese em que a ANPD espera RIPD; nem o regime de pequeno porte dispensa. O RIPD também é o documento que sustenta juridicamente a escolha de base legal (achado abaixo) e o prazo de retenção.
- **Recomendação:** produzir `.claude/docs/RIPD.md` cobrindo: descrição do tratamento; necessidade e proporcionalidade da granularidade por minuto (por que não 15 min?); riscos aos titulares (inferência de presença, uso por terceiros como seguradoras/credores, exposição em caso de vazamento); salvaguardas já existentes (cifra de CPF/CNPJ e endereço, autorização por posse, MFA, audit log); e riscos residuais com plano de tratamento. Reavaliar a cada mudança material do modelo de dados.

### [ALTO] Nenhum DPA (contrato de operador) assinado, e o inventário de operadores não existe — Art. 39

- **Evidência:** `.claude/docs/AUDITORIA_SEGURANCA.md` § 4 registra Art. 37-39 como "⚠️ Parcial — checklist de requisitos documentado (Seção 7.1); nenhum provedor de produção escolhido ainda; DPA pendente de assinatura". O checklist da § 7.1 é bom, mas continua sendo **um checklist, não um contrato**. Não há nenhum artefato de DPA, nem lista de operadores, em `.claude/docs/`.
- **Impacto:** o único operador já codificado é o SMTP (`backend/src/modules/auth/email.service.ts`), que recebe o e-mail do titular e um token de redefinição de senha. Assim que houver hospedagem, banco gerenciado, APM e agregador de logs, o conjunto de operadores cresce para 4-6 — todos processando dados pessoais sem instrumento contratual.
- **Recomendação:** manter no ROPA uma tabela de operadores (nome, serviço, dado tratado, país, DPA assinado S/N, SCC S/N, data) e tratar "DPA assinado + SCC quando fora do Brasil/UE" como **gate obrigatório de go-live** para cada provedor. Reaproveitar a § 7.1 do `AUDITORIA_SEGURANCA.md` como anexo técnico do contrato.

### [ALTO] PII e credenciais de sessão vazam para o log estruturado — Art. 6º III/VII, Art. 46 · `05-security-standards.md` ("PII nunca em log")

- **Evidência:**
  - `backend/src/shared/logger/logger.ts` (linhas 32-35) instancia o pino **sem a opção `redact`** — busca por `redact` em todo `backend/src` retorna zero resultados.
  - `backend/src/app.ts` (linhas 109-117) monta `pinoHttp` com serializers padrão. Os serializers default do `pino-http` (`pino-http@^11`, `pino@^10` — `backend/package.json`) incluem `req.headers` e `res.headers`, ou seja, **`cookie` (com o JWT de sessão `lumitrack_session` e o refresh token), `authorization` (Bearer do canal MOBILE) e `set-cookie`** entram no log de cada requisição.
  - `backend/src/modules/auth/auth.controller.ts` (linhas 58-69) grava, em toda falha de login, `metadata: { attemptedEmail }` — o **e-mail digitado em texto claro**, inclusive de pessoas que não são usuárias da plataforma (erro de digitação, tentativa de enumeração).
  - `backend/src/shared/audit/audit.service.ts` (linha 14) espelha toda entrada de auditoria — incluindo esse `attemptedEmail`, `ipAddress` e `userAgent` — para o stream do pino: `logger.info({ audit: entry }, ...)`.
  - O `schema.prisma` (linhas 247-254) documenta a intenção oposta: *"`metadata` guarda contexto adicional **sem incluir valores sensíveis**"*. O código contradiz o próprio comentário.
- **Impacto:** combinado com o plano da § 1.1 do `RUNBOOK_INCIDENTES.md` ("rotear para um agregador externo"), isso significa exportar **tokens de sessão válidos e e-mails de titulares e de não-titulares** para um operador terceiro — provavelmente fora do Brasil (ver achado Crítico 2). Um token de sessão em log é credencial viva: quem lê o log assume a sessão. E o `attemptedEmail` retido por 730 dias é dado pessoal de terceiros coletado **sem base legal**, violando frontalmente a minimização.
- **Recomendação:**
  1. Adicionar `redact` explícito no pino: `["req.headers.cookie", "req.headers.authorization", "res.headers['set-cookie']", "req.headers['x-csrf-token']", "*.password", "*.token"]`, com `censor: "[REDACTED]"`. Cobrir com teste (o `05` já exige teste que falhe se o controle for removido — RNF05).
  2. Substituir `attemptedEmail` por um **hash com sal** (ou o mesmo blind index HMAC já existente em `shared/crypto/blindIndex.ts`), preservando a capacidade de correlacionar tentativas contra o mesmo alvo sem armazenar o e-mail. Registrar a decisão no ROPA.
  3. Rever `logger.info({ audit: entry })` — a duplicação log/banco só faz sentido depois da redação acima.

### [ALTO] Retenção indefinida do dado mais sensível do produto — Art. 15, 16 · Art. 6º V

- **Evidência:** `backend/src/shared/retention/retention.service.ts` (`purgeExpiredData`, linhas 40-62) expurga **exatamente quatro** entidades: `AuthToken`, `PasswordReset`, `AuditLog` e `RefreshToken`. Os prazos correspondentes em `backend/src/config/env.ts` (linhas 70-72, 109) confirmam o escopo.
  Ficam **sem qualquer prazo de eliminação**: `MeterReading` (leituras por minuto, crescimento perpétuo), `AlertTriggerEvent`, `MfaBackupCode` (hashes bcrypt de códigos já usados), `TariffFlagHistory` e as **contas inativas** (nenhum critério de conta abandonada). O `privacy-policy.md` § 7 diz apenas "enquanto sua conta estiver ativa" — sem prazo, sem definição de "ativa".
- **Impacto:** o dado de maior risco do sistema (o perfil comportamental descrito no achado do RIPD) é exatamente o único **sem** política de retenção. Isso inverte a lógica do Art. 15/16 e amplia proporcionalmente o dano de um eventual incidente.
- **Recomendação:**
  1. Definir e documentar no ROPA prazos por entidade — sugestão de ponto de partida: `MeterReading` bruto por 12-24 meses com **agregação irreversível** (mês/ano) depois disso, preservando a utilidade do produto (comparação histórica) sem manter a granularidade por minuto; `AlertTriggerEvent` por 24 meses; `MfaBackupCode` usados por 30 dias.
  2. Estender `RetentionService` com essas regras (o `RetentionPurgeScheduler` já roda no boot + 24h — é extensão, não infraestrutura nova) e novas variáveis `DATA_RETENTION_*`, mantendo o padrão atual de configurabilidade.
  3. Definir política de **conta inativa** (ex.: aviso em 24 meses sem login, eliminação em 30 meses) e refletir no § 7 do aviso de privacidade.

### [ALTO] Direito de acesso e portabilidade incompleto — e a documentação afirma o contrário — Art. 18 II e V · Art. 9º

- **Evidência:** `backend/src/modules/export/export.service.ts`, `DataExportPayload` (linhas 24-33), exporta `user`, `properties`, `distributors`, `areas`, `devices`, `alerts` e `auditLogs`. O próprio comentário do arquivo (linhas 13-17) documenta a lacuna: *"o histórico de consumo [...] foi removido daqui — esse modelo não existe mais (schema v2). A exportação de consumo agregado via MeterReading fica para quando a agregação (TariffService/Fase 3) existir."* O `TariffService` já existe (`.claude/project_context/03-arquitetura.md` § `shared/`), mas o export não voltou.
  Nunca estiveram no export: `Meter` (configuração dos medidores do titular) e `AlertTriggerEvent` (histórico de disparos).
  Em contrapartida, `.claude/docs/AUDITORIA_SEGURANCA.md` § 4 e § 6 (Fase 2, #09) ainda declaram: *"histórico de consumo completo (sem corte)"* e *"JSON sem corte/paginação (inclui `ConsumptionRecord` completo)"* — e marcam o Art. 18 como "✅ Implementado".
- **Impacto:** o titular exerce acesso/portabilidade e recebe tudo **menos** o dado que a plataforma mais coleta sobre ele. O `RUNBOOK_INCIDENTES.md` § 3.2 agrava: instrui a usar o export DSAR justamente "para conferir se houve acesso não-autorizado a dados de consumo" — procedimento que não funciona mais. O drift documental faz a autoavaliação de conformidade do projeto reportar verde num item amarelo.
- **Recomendação:**
  1. Reincluir consumo no `ExportService` — agregado por dia/mês via `TariffService` atende o Art. 18 V (formato interoperável) sem o peso de milhões de linhas por minuto; se optar pelo bruto, paginar/streamar.
  2. Incluir `meters` e `alertTriggerEvents`.
  3. Corrigir `AUDITORIA_SEGURANCA.md` (§ 4 e § 6) e o § 3.2 do `RUNBOOK_INCIDENTES.md` para refletir o conteúdo real do export.

### [ALTO] Base legal mal atribuída e consentimento empacotado, sem revogação nem reaceite — Art. 7º, Art. 8º §§ 4º e 5º, Art. 9º

- **Evidência:**
  - `backend/src/modules/user/user.schema.ts` (linhas 47-56): um **único** `acceptedTerms: z.literal(true)` cobre simultaneamente a Política de Privacidade **e** os Termos de Uso — sem granularidade.
  - `frontend/src/pages/auth/RegisterPage.tsx` (linha 37 e 71) confirma o checkbox único ("Li e concordo…").
  - `frontend/src/legal/privacy-policy.md` § 3 lista consentimento **e** execução de contrato **e** obrigação legal para o mesmo conjunto de tratamentos, sem dizer qual base cobre qual operação.
  - `backend/src/shared/legal/consentVersion.ts` fixa `CURRENT_CONSENT_VERSION = "1.0"`; a busca por `CURRENT_CONSENT_VERSION` em `backend/src` mostra que ele é **escrito** no cadastro (`user.service.ts`, linhas 56-57) e **nunca comparado** depois — não há fluxo de reaceite quando o documento mudar.
  - Não há nenhum endpoint ou UI de **revogação de consentimento** (o único caminho é excluir a conta, o que não é revogação — é eliminação).
- **Impacto:** três problemas somados. (a) O consentimento não é **específico** (Art. 8º §4º) — um checkbox para dois documentos e para todas as finalidades. (b) Declarar consentimento como base do tratamento necessário para prestar o serviço é escolha frágil: o consentimento tem de ser **livre e revogável tão facilmente quanto concedido** (Art. 8º §5º), o que é incompatível com um tratamento sem o qual o produto não existe — a base correta aí é **execução de contrato** (Art. 7º, V). (c) O campo `consentVersion` foi construído exatamente para permitir reaceite, mas o mecanismo nunca foi ligado.
- **Recomendação:**
  1. No ROPA, atribuir **uma base por operação**: cadastro/autenticação, medição e cálculo de custo → execução de contrato (Art. 7º, V); trilha de auditoria e retenção de logs → obrigação legal / legítimo interesse (Art. 7º, II e IX, com teste de balanceamento registrado); e-mails não essenciais/analytics futuros → consentimento granular e revogável.
  2. Separar os aceites no cadastro (Termos ≠ Política) e reservar checkbox opcional para o que for de fato consentimento.
  3. Implementar a verificação `user.consentVersion !== CURRENT_CONSENT_VERSION` → tela de reaceite no login; expor `consentedAt`/`consentVersion` no Perfil (o comentário em `ProfilePage.tsx`, linhas 39-42, já registra essa lacuna como conhecida).

---

### [MÉDIO] Credenciais do broker MQTT do titular armazenadas em texto claro e devolvidas pela API — Art. 46

- **Evidência:** `backend/prisma/schema.prisma`, modelo `Meter`, campo `extra Json?` (linha 403), sem cifra. `backend/src/modules/iot/iot-worker/IoTConnectionManager.ts` (linhas 76-84) lê `username` e `password` de dentro desse `extra` para conectar ao broker. E `backend/src/modules/meter/meter.repository.ts` (`MeterResponse`, linhas 5-20, e `toMeterResponse`, linha 37) inclui `extra` **na resposta da API**, sem filtro.
- **Contraste:** CPF/CNPJ, endereço e segredo TOTP receberam cifra em repouso com chaves segregadas (`CPF_CNPJ_ENCRYPTION_KEY`, `ADDRESS_ENCRYPTION_KEY`, `MFA_SECRET_ENCRYPTION_KEY` em `backend/src/config/env.ts`). A credencial de infraestrutura do titular ficou de fora do mesmo tratamento.
- **Recomendação:** cifrar seletivamente as chaves sensíveis de `extra` (`password`, e qualquer token futuro) na borda do `MeterRepository` — mesmo padrão já validado no `PropertyRepository` — e **omitir** esses campos do `MeterResponse` (write-only, como já se faz com a senha do usuário). Documentar a credencial como dado do titular no ROPA.

### [MÉDIO] Plano de resposta a incidentes com prazo divergente da Res. CD/ANPD 15/2024 e sem registro de 5 anos — Art. 48

- **Evidência:** `.claude/docs/RUNBOOK_INCIDENTES.md` § 4.1 estabelece: *"Prazo: comunicação em prazo razoável (ANPD reconhece 72h como referência…)"*. A Res. CD/ANPD 15/2024 fixa **3 dias úteis** contados do conhecimento de que o incidente afetou dados pessoais — e o `09` registra o **dobro** para o pequeno porte. "72h corridas" e "3 dias úteis (×2)" são prazos diferentes; o runbook ancora numa referência antiga.
  A § 5.1 também reconhece que não há registro formal de incidentes ("enquanto não há tabela formal `SecurityIncident`… registre em um arquivo/ticket externo"), sem estabelecer a **guarda por 5 anos** dos incidentes — inclusive dos **não comunicados**, com a justificativa da não comunicação.
  O canal indicado na § 4.2 aponta para a ouvidoria do Ministério da Cidadania, não para o formulário de comunicação de incidente da ANPD.
- **Recomendação:** atualizar o runbook com (a) o prazo correto (3 dias úteis, dobrado no pequeno porte, contado do **conhecimento**), (b) os critérios de "risco relevante" alinhados à Res. 15/2024, (c) o canal correto da ANPD, e (d) um registro de incidentes versionado (`.claude/docs/REGISTRO_INCIDENTES.md`) com retenção de 5 anos, incluindo os incidentes avaliados e **não** comunicados, com a justificativa. Preencher o Apêndice B (checklist pré-incidente) — vários itens dependem da decisão de infra ainda em aberto.

### [MÉDIO] Aviso de privacidade não informa cookies/armazenamento local nem prazos concretos de retenção, e se autodeclara não revisado juridicamente — Art. 9º

- **Evidência:**
  - `frontend/src/legal/privacy-policy.md` não tem seção de cookies. A aplicação usa quatro cookies (`lumitrack_session`, `lumitrack_csrf`, `lumitrack_refresh`, `lumitrack_refresh_csrf` — `backend/src/config/env.ts`, linhas 40-42 e 106-108) e `localStorage` para tema e propriedade selecionada (`frontend/src/lib/storage.ts`, `frontend/src/hooks/usePropertySelection.ts`).
  - § 7 do mesmo documento não traz **nenhum prazo numérico**, embora o código já opere prazos definidos (30/30/730/30 dias em `env.ts`).
  - O documento traz, em produção, o aviso: *"este é um documento-modelo gerado como parte de uma auditoria… deve ser revisado por um profissional jurídico"* (§ 1) — replicado nos Termos e no bundle de design `LumiTrack LGPD.dc.html` (linha 74).
- **Nota positiva:** como **não há analytics, Sentry, PostHog ou qualquer cookie não essencial** implementado (confirmado por varredura em `frontend/src`), **não é exigível banner de consentimento de cookies hoje** — os cookies existentes são estritamente necessários. Isso muda no instante em que o item "Observabilidade de produção" do `07` for decidido.
- **Recomendação:** adicionar seção "Cookies e armazenamento local" listando cada cookie, finalidade, natureza (estritamente necessário) e duração; substituir "enquanto a conta estiver ativa" pelos prazos reais do ROPA; e, antes do go-live, submeter Política e Termos a revisão jurídica e remover os avisos de "documento-modelo" (mantê-los publicados fragiliza o valor probatório do consentimento coletado).

### [MÉDIO] Nenhum tratamento de dados de crianças e adolescentes — Art. 14

- **Evidência:** varredura por `idade`, `menor`, `18 anos`, `nascimento`, `birth` em todo o código e documentação legal: nenhuma ocorrência funcional. O cadastro (`backend/src/modules/user/user.schema.ts`) coleta CPF, mas **não** data de nascimento nem declaração de maioridade. `frontend/src/legal/terms-of-use.md` § 2 não estabelece idade mínima.
- **Impacto:** nada impede o cadastro de um menor de 18 anos, cujo tratamento exigiria consentimento **específico e destacado** de um dos pais/responsável (Art. 14 §1º) e observância do melhor interesse. O risco é baixo em probabilidade (produto de gestão de conta de energia), mas a ausência total de controle e de cláusula é uma lacuna objetiva.
- **Recomendação:** (a) inserir cláusula de idade mínima (18 anos, ou 16+ assistido) nos Termos § 2; (b) adicionar declaração de maioridade no cadastro; (c) documentar no ROPA a decisão de "não tratar dados de menores" e o procedimento de eliminação caso se detecte um cadastro de menor.

### [MÉDIO] Sem procedimento de revisão de decisões automatizadas — Art. 20

- **Evidência:** o produto toma duas decisões automatizadas relevantes ao titular: abertura/fechamento de episódio de alerta (`backend/src/modules/alert/alert-evaluator.ts`, regra de 3/5 amostras consecutivas descrita em `02-requisitos.md` FNC002) e cálculo automatizado de custo em reais (FNC003, `TariffService`). Nem o `privacy-policy.md` § 6 nem a UI mencionam direito a **explicação ou revisão** dessas decisões.
- **Impacto:** o risco material é hoje limitado (as decisões não restringem direitos nem definem perfil para terceiros), mas o Art. 20 exige, no mínimo, **informação clara sobre os critérios** e um canal de revisão. Torna-se relevante se o produto evoluir para recomendações, scoring ou compartilhamento com distribuidoras/seguradoras.
- **Recomendação:** acrescentar ao aviso de privacidade uma seção "Decisões automatizadas" explicando, em linguagem simples, o critério de disparo do alerta e a fórmula de custo (a decomposição já é exposta na UI por decisão de design — é meio caminho andado), e vincular o pedido de revisão ao canal do titular criado no achado Crítico 1.

### [MÉDIO] Guarda de registros de acesso a aplicações não está garantida — Marco Civil Art. 15 × minimização LGPD

- **Evidência:** os logs de requisição (`pinoHttp` em `backend/src/app.ts`) vão para **stdout** — `backend/src/shared/logger/logger.ts` não configura destino nem rotação, e o roteamento para agregador externo é hipótese futura (`RUNBOOK_INCIDENTES.md` § 1.1; item aberto no `07`). A tabela `audit_logs` (`schema.prisma`, linhas 255-275) registra `LOGIN`/`LOGOUT` com IP e user-agent por 730 dias (`DATA_RETENTION_AUDIT_LOG_DAYS`), mas cobre eventos de autenticação, não o conjunto dos registros de acesso à aplicação.
- **Impacto:** dois lados da mesma moeda. Se o Marco Civil Art. 15 for aplicável (provedor de aplicação pessoa jurídica com fins econômicos), há obrigação de guardar registros de acesso por **6 meses** sob sigilo — e hoje nada garante que sobrevivam a um restart do contêiner. Do outro lado, o prazo de 730 dias do `audit_logs` foi escolhido sem confronto explícito com a minimização (o comentário em `env.ts`, linhas 67-69, reconhece o trade-off mas não o fundamenta).
- **Recomendação:** decidir junto com a hospedagem (achado Crítico 2) um destino persistente de logs com retenção **de 6 meses** para registros de acesso, sob sigilo e com acesso restrito; registrar no ROPA a base legal (obrigação legal — Art. 7º, II) e o prazo; e revisitar os 730 dias do `audit_logs` justificando-os pela reconstrução de incidentes (Art. 48) ou reduzindo-os.

---

### [BAIXO] UX de direitos incompleta no Perfil — Art. 9º, Art. 18

- **Evidência:** `frontend/src/pages/profile/ProfilePage.tsx` (linhas 255-260) oferece só `format=json`; a API suporta `pdf` (`backend/src/modules/export/export.controller.ts`, linhas 28-33) — formato mais acessível ao titular leigo. O comentário nas linhas 39-42 registra que a linha "Política de Privacidade (Aceita)" do handoff ficou de fora porque o tipo `User` do frontend não expõe `consentedAt`/`consentVersion`.
- **Recomendação:** oferecer os dois formatos, exibir data e versão do consentimento aceito e linkar o aviso de privacidade a partir do Perfil.

### [BAIXO] Drift documental faz a conformidade parecer mais completa do que é

- **Evidência:** `.claude/docs/AUDITORIA_SEGURANCA.md` § 4 marca Art. 18 e Art. 48 como "✅ Implementado" — o primeiro está incompleto (ver achado do DSAR) e o segundo tem prazo divergente da Res. 15/2024. `.claude/project_context/01-descricao.md` (linha 47) propaga: *"Auditoria OWASP Top 10:2025 + LGPD concluída, sem achados acima de 🟢 Baixo"*.
- **Recomendação:** atualizar os dois documentos citando este laudo, e adotar a convenção do kit para laudos novos (`.claude/docs/2026-08-05-conformidade-audit.md`), mantendo o `AUDITORIA_SEGURANCA.md` como histórico.

### [BAIXO] TLS não é obrigatório na configuração SMTP — contradiz o próprio checklist de DPA

- **Evidência:** `backend/src/config/env.ts` (linha 22) define `SMTP_SECURE` com default `false` e sem qualquer guard para produção; `backend/src/modules/auth/email.service.ts` (linhas 9-17) repassa direto ao nodemailer. Enquanto isso, a § 7.1 do `AUDITORIA_SEGURANCA.md` exige do futuro operador "TLS 1.2+ obrigatório… nenhuma transmissão em texto claro".
- **Recomendação:** aplicar o mesmo padrão do guard de `CORS_ORIGIN` — falhar o boot se `NODE_ENV=production` e `SMTP_SECURE=false` sem STARTTLS comprovado (`requireTLS: true` no transporter como piso).

### [BAIXO] Credenciais de demonstração versionadas — higiene de ambiente

- **Evidência:** `frontend/src/config/demoUsers.ts` versiona e-mail e senha de duas contas de demonstração, expostas na UI atrás da flag `VITE_DEMO_MODE`.
- **Impacto:** aceitável para demonstração, desde que os dados semeados sejam **fictícios** (o seed usa CNPJ real de distribuidora — pessoa jurídica terceira, decisão já registrada e defensável) e que a flag jamais fique ligada num ambiente com titulares reais.
- **Recomendação:** garantir no pipeline de deploy que `VITE_DEMO_MODE` seja `false` em produção e documentar no ROPA que os dados de demonstração são sintéticos.

---

## Itens em conformidade

Controles verificados no código e considerados adequados ao estágio do projeto:

- **Regime de pequeno porte corretamente presumido** — projeto solo/MVP se enquadra na Res. CD/ANPD 2/2022; a dispensa de encarregado está bem aproveitada, e a única obrigação remanescente do regime (canal de comunicação) foi corretamente identificada como pendente pelos próprios documentos legais — só não foi implementada.
- **Consentimento versionado e registrado** — `consentedAt` + `consentVersion` no modelo `User` (`schema.prisma`, linhas 129-133), gravados no cadastro (`user.service.ts`, 56-57), com aceite obrigatório validado no backend (`user.schema.ts`, 53-55) e no frontend. A estrutura para reaceite existe; falta acioná-la.
- **Aviso de privacidade e Termos publicados e versionados em código** — `frontend/src/legal/` renderizados em `/privacidade` e `/termos`, linkados do rodapé e do cadastro, abrindo em aba nova.
- **Criptografia de PII em repouso com segregação de chaves por categoria** — CPF/CNPJ (AES-256-GCM + blind index HMAC), endereço completo da propriedade e segredo TOTP, cada um com chave própria (`CPF_CNPJ_ENCRYPTION_KEY`, `ADDRESS_ENCRYPTION_KEY`, `MFA_SECRET_ENCRYPTION_KEY`), cifra/decifra centralizada na borda dos repositórios. Compartimentalização acima do usual para o porte.
- **Tokens nunca em texto claro** — JWT e refresh token persistidos como hash SHA-256; senhas em bcrypt(12); backup codes de MFA em bcrypt.
- **Autorização por posse de recurso consistente** — inclusive nos endpoints de dados pessoais (`user.controller.ts`, linhas 40-42, 58-60, 88-90) e no stream SSE (`iot-stream.routes.ts`, `resolveUserMeterIds`).
- **Trilha de auditoria desenhada com a LGPD em mente** — `AuditLog` com `onDelete: SetNull` deliberado para o registro sobreviver à exclusão da conta (Art. 48); `USER_UPDATE` grava apenas os **nomes** dos campos alterados, nunca os valores; `DATA_EXPORT` e `ADMIN_AUDIT_LOG_VIEW` auditados como leitura privilegiada.
- **Eliminação e retificação autoatendidas** — `DELETE /api/users/:id` com cascade e confirmação na UI; `PUT /api/users/:id`; ambos auditados.
- **Expurgo automatizado de credenciais** — `RetentionPurgeScheduler` no boot + 24h, com prazos configuráveis por env (30/30/730/30 dias) — bom padrão, ainda que de escopo insuficiente (ver achado Alto).
- **Runbook de incidentes existente e operacional** — detecção, contenção por tipo, avaliação de risco com consultas SQL prontas, templates de comunicação à ANPD e ao titular. Precisa de correção de prazo e de registro, não de reescrita.
- **Integração ANEEL não implica transferência internacional nem tratamento de dados pessoais** — `backend/src/modules/tariff-flag/sync/AneelTariffFlagSource.ts` faz apenas `GET` de dados públicos em `dadosabertos.aneel.gov.br` (órgão brasileiro), sem enviar qualquer dado do titular. Fluxo unidirecional de entrada, corretamente isolado atrás de `ITariffFlagSource`.
- **Protocolos IoT operam em rede local** — os adaptadores (MQTT, Modbus, EtherNet/IP, Profibus, PROFINET, RS232/485) conectam a equipamentos do próprio titular; nenhum envia dado pessoal a terceiro.
- **Sem analytics, sem rastreador, sem cookie não essencial** — varredura em `frontend/src` não encontra PostHog, GA, Sentry, gtag ou pixel. Banner de cookies **não é exigível hoje** — a maior conformidade aqui veio de não ter adicionado nada.
- **Segredos fora do código** — `.env` no `.gitignore`, `.env.example` com placeholders, guard de boot que derruba a aplicação com config inválida, e hooks que bloqueiam a leitura de `.env*` pelo agente.

---

## Próximos passos sugeridos

**Bloco 0 — bloqueadores de go-live (fazer antes de qualquer titular real)**

1. Publicar o **canal de comunicação do titular** (rodapé + Perfil + aviso de privacidade) — achado Crítico 1. Custo baixo, risco removido alto.
2. Decidir a **hospedagem com a lente de transferência internacional** (preferir Brasil/UE) e, para o que ficar nos EUA, exigir **SCCs da ANPD**; corrigir o § 4 do aviso de privacidade — achado Crítico 2. Registrar como ADR e atualizar `07-decisoes-em-aberto.md`.

**Bloco 1 — governança documental (2 documentos destravam 5 achados)**

3. Escrever o **ROPA** (`.claude/docs/ROPA.md`) — resolve o Art. 37 e é pré-requisito da correção de base legal, de retenção e do inventário de operadores.
4. Escrever o **RIPD** (`.claude/docs/RIPD.md`) para o tratamento de medição contínua — Art. 38.
5. Fechar **DPAs** com o operador SMTP e com cada provedor de infra escolhido no passo 2, usando a § 7.1 do `AUDITORIA_SEGURANCA.md` como anexo técnico.

**Bloco 2 — correções de código (todas pequenas, alto retorno)**

6. `redact` no pino + hash do `attemptedEmail` — remove credenciais e PII de terceiros do log, com teste de regressão conforme RNF05.
7. Estender o `RetentionService` a `MeterReading`/`AlertTriggerEvent`/`MfaBackupCode` e definir política de conta inativa.
8. Reincluir consumo, medidores e disparos no **export DSAR**; oferecer PDF na UI.
9. Cifrar `Meter.extra.password` e removê-lo do `MeterResponse`.
10. Ligar a verificação de `consentVersion` (reaceite) e separar os aceites no cadastro.

**Bloco 3 — ajustes documentais**

11. Corrigir o `RUNBOOK_INCIDENTES.md` (3 dias úteis dobrados, canal da ANPD, registro de 5 anos) e criar `.claude/docs/REGISTRO_INCIDENTES.md`.
12. Complementar o aviso de privacidade (cookies, prazos reais, decisões automatizadas, idade mínima) e submetê-lo a revisão jurídica, incrementando `CURRENT_CONSENT_VERSION` para `2.0` ao publicar.
13. Atualizar `AUDITORIA_SEGURANCA.md` § 4 e `01-descricao.md` (linha 47) para eliminar o drift de status de conformidade.

**Sugestão de encaminhamento:** os 19 achados são diretamente convertíveis em issues pela skill `criar-issues` (labels `origem: auditoria` + `tipo: conformidade` + prioridade mapeada da severidade). Os Blocos 0 e 1 são documentais/contratuais e não competem com o roadmap de features; o Bloco 2 cabe como uma fase curta do roadmap, no padrão das fases anteriores. Recomenda-se que os achados Críticos e os itens de base legal (achado Alto sobre consentimento) passem por validação de advogado ou encarregado antes da implementação — a escolha de base legal é decisão jurídica, não de engenharia.
