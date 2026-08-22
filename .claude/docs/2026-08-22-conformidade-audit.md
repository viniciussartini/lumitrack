# Auditoria de Conformidade Legal (LGPD) — 2026-08-22

> **Escopo:** varredura completa do monorepo (`backend/`, `frontend/`, `iot-simulator/`, `deploy/`, `render.yaml`, `docker-compose.yml`, schema Prisma), da documentação de governança (`.claude/docs/ROPA.md`, `RIPD.md`, `PROCEDIMENTO_DIREITOS_TITULAR.md`, `RUNBOOK_INCIDENTES.md`, ADRs 0008/0009/0010/0011, `DEPLOY.md`) e dos documentos legais publicados (`frontend/src/legal/`), contra o checklist de `.claude/project_context/09-conformidade-legal.md` — LGPD (Lei 13.709/2018), Res. CD/ANPD 2/2022, 15/2024, 19/2024 e Marco Civil (Lei 12.965/2014).
> **Base temporal:** branch `epic/225-correcoes-pos-deploy-2`, após as mudanças de deploy (ADR-0010, ADR-0011) e os ajustes pós-produção (#222, #226, #229).
> **Este laudo não é parecer jurídico.** Os achados Críticos e Altos envolvem obrigações com sanção prevista (Art. 52) e devem ser validados por advogado/encarregado antes de qualquer operação com titulares reais.

## Resumo (nº de achados por risco)

| Risco | Qtde | Temas |
|---|---|---|
| 🔴 Crítico | 3 | Canal do titular é placeholder inexistente em produção; aviso de privacidade contém afirmação factualmente falsa; contas de demonstração aceitam gravação de dado pessoal real |
| 🟠 Alto | 8 | IP de visitante real no banco nos EUA; ROPA desatualizado e autocontraditório; DPA/SCC ausentes; retenção indefinida do dado comportamental; DSAR incompleto; runbook fora da Res. 15/2024; consentimento empacotado e sem reaceite; RIPD não reavaliado após a mudança de hospedagem |
| 🟡 Médio | 6 | Marco Civil × minimização; backups fora do ROPA; aviso sem cookies/prazos/Art. 20/idade mínima; região do Neon não decidida; drift documental de status; contas inativas sem prazo |
| 🟢 Baixo | 5 | TLS SMTP; UX de direitos; ticket SSE em log; serviços externos não inventariados; credenciais demo versionadas |
| **Total** | **22** | |

**Veredito.** A camada técnica continua forte (cifra por categoria com chaves segregadas, blind index, redação de PII no log, trilha de auditoria, expurgo agendado, MFA, autorização por posse). O que mudou desde 2026-08-05 é a **topologia**: o produto saiu de "VM em São Paulo, zero operador estrangeiro" para "Render + Neon nos EUA", e a governança documental **não acompanhou por inteiro** — o ROPA, o RIPD e o § 5 do aviso de privacidade ainda descrevem o mundo da ADR-0008. Pior: a premissa que sustenta juridicamente toda a ADR-0010 ("não há dado pessoal de pessoa real no ambiente") é **falsa hoje em dois pontos verificáveis no código** — o IP de cada visitante que faz demo-login é gravado no Neon por 730 dias, e qualquer visitante pode digitar endereço real numa propriedade da conta demo. O ambiente não está apto a operar com titulares reais, e os três Críticos abaixo são corrigíveis com esforço baixo.

---

## Achados

### [CRÍTICO] O canal de direitos do titular publicado em produção é um placeholder inexistente — Res. CD/ANPD 2/2022 Art. 11 · LGPD Art. 18 §1º · Art. 6º VI

- **Evidência:**
  - `frontend/src/config/privacy.ts` faz fallback para o literal `privacidade@seu-dominio.com.br` quando `VITE_PRIVACY_CONTACT_EMAIL` não existe.
  - `render.yaml` (bloco `envVars` do site estático, linhas 103-123) define **apenas** `VITE_DEMO_MODE`, `VITE_SSE_URL` e `VITE_CSP_CONNECT_EXTRA`. `VITE_PRIVACY_CONTACT_EMAIL` **não é definida** — e Vite resolve `import.meta.env.VITE_*` em *build time*, então o valor publicado é o placeholder.
  - Esse endereço é renderizado como canal oficial em quatro lugares: rodapé da Landing (`frontend/src/pages/landing/LandingPage.tsx:658`), "Sobre o projeto" (`AboutPage.tsx:78`), card "Privacidade & dados" do Perfil (`ProfilePage.tsx:305`) e três vezes na Política (`PrivacyPolicyPage.tsx` substitui `{{PRIVACY_CONTACT_EMAIL}}`).
  - `.claude/docs/PROCEDIMENTO_DIREITOS_TITULAR.md` (§ "Antes de operar com titulares reais", item 1) já previa exatamente esse pré-requisito — ele não foi cumprido no deploy.
- **Por que é crítico:** o regime de pequeno porte dispensa o encarregado, **não o canal**. E o ambiente publicado *tem* titulares reais: todo visitante tem IP e registro de acesso tratados (achado Alto 1). Esses titulares não conseguem exercer confirmação, acesso, eliminação ou informação sobre compartilhamento — e a Política afirma, três vezes, que o canal funciona. É a mesma falha Crítica do laudo de 2026-08-05, reaberta pelo deploy: a estrutura foi construída, a configuração de produção não a ativou.
- **Recomendação:** definir um endereço monitorado de fato (um alias de e-mail pessoal já resolve, dado o porte) e fixá-lo em `render.yaml` como `VITE_PRIVACY_CONTACT_EMAIL`, com redeploy do site estático. Acrescentar a verificação ao checklist de go-live do `DEPLOY.md` ("Caminho A") e um teste que falhe o build se o valor de produção for igual ao placeholder — o controle precisa de trava mecânica, não de lembrete.

---

### [CRÍTICO] O aviso de privacidade vigente afirma que a infraestrutura está no Brasil, três seções depois de dizer que está nos EUA — Art. 6º VI · Art. 9º

- **Evidência:** `frontend/src/legal/privacy-policy.md`
  - § 4 (linhas 58-63): *"A infraestrutura que hospeda a demonstração fica **fora do Brasil**"*, com tabela nominal Render (EUA) e Neon (EUA).
  - § 5, último bullet (linhas 99-100): *"Infraestrutura hospedada exclusivamente no Brasil (ver seção 4), sem acesso de terceiros."* — a linha remanescente da versão 1.1 (ADR-0008), não removida quando o § 4 foi reescrito para a versão 1.2.
- **Por que é crítico:** este é o documento que evidencia o consentimento (`CURRENT_CONSENT_VERSION = "1.2"`, `backend/src/shared/legal/consentVersion.ts`) e está publicado em `/privacidade`. A própria ADR-0010 registra o princípio correto — *"um aviso de privacidade que afirme algo falso é pior que nenhum"* — e o documento publicado o viola. Um aviso autocontraditório sobre **transferência internacional**, justamente o ponto de maior exposição do projeto, compromete o valor probatório do consentimento inteiro e configura falha de transparência autônoma.
- **Recomendação:** remover/reescrever o bullet do § 5 ("Infraestrutura hospedada nos Estados Unidos — ver seção 4"), publicar como versão **1.3** e incrementar `CURRENT_CONSENT_VERSION` em sincronia (o mesmo procedimento que a ADR-0010 já documenta). Aproveitar o mesmo PR para as correções do achado Médio 3 e evitar duas bumps seguidas.

---

### [CRÍTICO] A trava de "somente leitura" das contas de demonstração cobre apenas a entidade `User` — qualquer visitante pode gravar dado pessoal real no banco nos EUA, visível a todos os outros visitantes — Art. 33-35 · Art. 46 · Art. 6º VII

- **Evidência:**
  - O guard existe só em três pontos, todos sobre a própria conta: `backend/src/modules/user/user.service.ts:128` (update) e `:183` (delete), e `backend/src/modules/auth/auth.service.ts:207,261,297` (forgot-password / MFA).
  - Busca por `DEMO_ACCOUNT_EMAILS` em `backend/src/` retorna **zero** ocorrências nos módulos `property`, `area`, `device`, `meter` e `alert`. `backend/src/modules/property/property.routes.ts` expõe `POST /`, `PUT /:id`, `DELETE /:id` protegidos apenas por `authenticate`.
  - `Property` guarda `address`, `city`, `state`, `zipCode` (`backend/prisma/schema.prisma:334-359`) — dado pessoal por excelência quando preenchido por uma pessoa real.
  - As duas contas demo são **compartilhadas e públicas** (`DEMO_LOGIN_ENABLED=true` em `render.yaml:27`, botões expostos por `VITE_DEMO_MODE=true`): o que um visitante grava, todos os outros leem.
- **Por que é crítico:** esta é a premissa que sustenta a conclusão de conformidade inteira da ADR-0010 e a afirmação do § 4 do aviso — *"Nenhum dado pessoal de pessoa real é coletado ou armazenado pela aplicação"*. `REGISTRATION_ENABLED=false` fecha a porta da frente; a porta lateral (escrita de domínio pela conta demo) ficou aberta. Um recrutador curioso que cadastre "sua casa" com o CEP verdadeiro produz, de uma vez: dado pessoal real num operador estrangeiro sem SCC, exposição desse dado a terceiros desconhecidos, e uma declaração falsa no aviso de privacidade.
- **Recomendação:** estender o guard de somente-leitura a **todas** as escritas de domínio quando o usuário autenticado for conta demo — o ponto certo é um middleware único aplicado às rotas de mutação (ou uma checagem no `authenticate`, marcando `req.user.isDemo`), não um `if` replicado em cinco services (isso volta a esquecer o próximo módulo). Se a demo precisa ser "brincável", a alternativa é permitir escrita apenas em campos sem PII (nomes de área/dispositivo) e bloquear `address`/`city`/`zipCode` explicitamente. Enquanto não houver trava, acrescentar aviso na UI da demo de que os campos são públicos e não devem receber dado real — mitigação, não correção.

---

### [ALTO] O Neon armazena dado pessoal de visitantes reais (IP + user-agent, 730 dias), contrariando o ROPA e o aviso de privacidade — Art. 33 · Art. 15/16 · Art. 6º VI

- **Evidência:**
  - `backend/src/modules/auth/auth.controller.ts:102-110`: todo `POST /api/auth/demo-login` bem-sucedido grava `audit_logs` com `...getRequestContext(req)`.
  - `backend/src/shared/audit/requestContext.ts:10-11` preenche `ipAddress: req.ip` e `userAgent` — com `trust proxy` ativo em produção (`backend/src/app.ts:84`), é o IP real do visitante.
  - Retenção: 730 dias (`DATA_RETENTION_AUDIT_LOG_DAYS`, `backend/src/config/env.ts:94`).
  - Contradição documental: `.claude/docs/ROPA.md:146` declara para o Neon *"Apenas dados sintéticos das contas de demonstração"*, e `frontend/src/legal/privacy-policy.md:63` repete a mesma frase na tabela do § 4. A ADR-0010 atribui a exposição de registros de acesso **só ao Render**.
- **Impacto:** a transferência internacional é maior e mais duradoura do que o declarado — o IP do visitante não passa apenas pela borda do Render, ele é **persistido** no banco nos EUA por dois anos. Dois problemas somados: transparência (declaração incorreta) e minimização (730 dias para o dado de um visitante que só clicou "entrar na demo" é desproporcional; o piso do Marco Civil é 6 meses).
- **Recomendação:** (a) corrigir a linha do Neon no ROPA e no § 4 do aviso; (b) avaliar retenção diferenciada para eventos de conta demo (ex.: expurgo em 6 meses, ou não gravar IP quando `demo: true` — o `metadata` já marca esses eventos); (c) registrar no ROPA a base legal e o prazo dessa categoria separadamente das demais operações.

### [ALTO] O ROPA está desatualizado e internamente contraditório — o registro do Art. 37 descreve um sistema que não existe mais — Art. 37

- **Evidência (`.claude/docs/ROPA.md`):**
  - As **sete** operações (linhas 34-131) declaram, cada uma, `Operadores: Nenhum` e `Transferência internacional: Nenhuma — processamento exclusivamente no Brasil (ADR-0008)`, enquanto a tabela de operadores da linha 145-146 lista Render e Neon nos EUA. O documento afirma as duas coisas.
  - A seção final (linhas 234-249) mantém: *"as SCCs da ANPD não se aplicam — não por dispensa, mas por inexistência do fato gerador. Não há operador (Art. 39), logo não há DPA a assinar"* — texto da ADR-0008 preservado abaixo do texto da ADR-0010 que diz o oposto.
  - Linhas 240-245: *"Esse controle ainda não está implementado — é item da Fase 13… Enquanto não existir, o ambiente não deve ser publicado"* — a Fase 13 está concluída e o ambiente está publicado.
  - Operação 3 (linha 74) ainda registra como gap aberto *"`Meter.extra` pode conter a senha do dispositivo em texto claro"* — já corrigido (`backend/src/shared/crypto/meterCredentialEncryption.ts`, `METER_CREDENTIAL_ENCRYPTION_KEY` em `env.ts:124`).
  - **Tabela ausente:** `email_changes` (`backend/prisma/schema.prisma:234-246`, guarda `newEmail` — dado pessoal, com token e TTL) não tem linha no ROPA. Também não constam a fila de notificações em memória (`backend/src/shared/notifications/notification-store.ts`) nem os tickets SSE (`sse-ticket.service.ts`), ambos ligados a `userId`.
- **Impacto:** o próprio ROPA adverte que *"um ROPA desatualizado é pior do que a ausência dele — cria falsa confiança numa eventual fiscalização"*. É exatamente o estado atual: o primeiro documento pedido em fiscalização afirma "sem operadores, sem transferência" em sete de sete operações.
- **Recomendação:** reescrever as sete linhas de `Operadores`/`Transferência internacional` para o estado ADR-0010 (com a ressalva de que a linha volta a zerar no Caminho B), remover o bloco residual da ADR-0008 (ou marcá-lo como histórico datado, sem ambiguidade), acrescentar `email_changes` e as duas estruturas em memória, e atualizar a operação 3. A regra de manutenção citada na linha 254 (Definition of Done da skill `nova-feature`) precisa ser estendida: **mudança de infraestrutura também dispara atualização do ROPA** — foi a categoria de mudança que a regra não cobria.

### [ALTO] Nenhum DPA e nenhuma SCC com Render e Neon — Art. 39 · Art. 33-35 · Res. CD/ANPD 19/2024

- **Evidência:** `.claude/docs/ROPA.md:145-146` (colunas "DPA assinado" e "SCC" = **Não** para ambos); `ADR-0010` § "Consequência de conformidade" (*"O projeto não celebra SCCs… e não há decisão de adequação para os EUA"*); `09-conformidade-legal.md:45,56` registra a mesma lacuna. Nenhum artefato contratual em `.claude/docs/`.
- **Impacto:** o período de graça da Res. 19/2024 encerrou em ago/2025 — não há mais janela. A lacuna está **reconhecida e assumida**, o que é honesto e reduz o risco de má-fé, mas não a elimina: os registros de acesso de visitantes reais (e, pelo achado acima, o IP persistido no Neon) são transferidos sem instrumento. Some-se que, sem DPA, não há obrigação contratual de o operador **notificar incidente** — o que quebra o Art. 48 na origem (ver achado do runbook).
- **Recomendação:** três caminhos, em ordem de custo: (1) aderir aos DPAs/adendos de proteção de dados que Render e Neon publicam para autoatendimento e arquivar a evidência de aceite fora do git, registrando data no ROPA — é gratuito e fecha o Art. 39 formalmente; (2) mover o Neon para a região São Paulo (achado Médio 4), o que remove metade da transferência sem custo; (3) manter a lacuna documentada como risco assumido, mas **só** enquanto os três Críticos acima estiverem fechados — hoje o risco assumido é maior do que o registrado, porque a premissa "sem dado real" não se sustenta.

### [ALTO] Retenção indefinida do dado comportamental — e a granularidade de minuto agora é consultável na UI — Art. 15, 16 · Art. 6º V

- **Evidência:** `backend/src/shared/retention/retention.service.ts:40-62` expurga **exatamente quatro** entidades (`auth_tokens`, `password_resets`, `audit_logs`, `refresh_tokens`). `MeterReading` e `AlertTriggerEvent` continuam sem prazo — confirmado pela ausência de variáveis correspondentes em `backend/src/config/env.ts:92-94,137`. O `DEPLOY.md:80` reconhece: *"o `RetentionService` ainda não cobre `MeterReading` (item da Fase 14), então vale revisar o volume periodicamente"* — controle manual, não política.
- **Agravante novo:** a issue #226 adicionou `"minute"` ao `granularitySchema` e a UI passou a **ler** o dado de minuto (aba "Hora" do painel). O próprio RIPD registra a mudança de premissa (`.claude/docs/RIPD.md:115-129`) e conclui, corretamente, que isso é um argumento **mais forte** para prazo curto — mas a reavaliação foi adiada para a Fase 14 e o prazo continua sendo "infinito".
- **Impacto:** o dado de maior risco do produto (série temporal por minuto ligável a CPF e endereço — todo o objeto do RIPD) é o único sem política de eliminação. Isso inverte a lógica do Art. 15/16 e amplia proporcionalmente o dano de qualquer incidente.
- **Recomendação:** implementar a recomendação do § 3.3 do RIPD (janela de 60-90 dias em granularidade de minuto, compactação para agregado horário depois), com novas `DATA_RETENTION_*` e extensão do `RetentionService` — a infraestrutura (scheduler) já existe, é extensão. Enquanto a decisão de prazo não passa por revisão jurídica, ligar ao menos um teto operacional configurável evita que "sem decisão" continue significando "para sempre".

### [ALTO] Direito de acesso e portabilidade incompleto — e a documentação afirma o contrário — Art. 18 II e V

- **Evidência:** `backend/src/modules/export/export.service.ts:30-39` — `DataExportPayload` traz `user`, `properties`, `distributors`, `areas`, `devices`, `alerts`, `auditLogs`. **Ficam de fora:** todo o histórico de consumo (`meter_readings`), a configuração dos medidores (`meters`), os episódios de alerta (`alert_trigger_events`), o status/segredo de MFA e as trocas de e-mail pendentes (`email_changes`). O comentário do próprio arquivo (linhas 19-23) documenta a lacuna como temporária desde a Fase 2.
- **Documentação que afirma o oposto:** `.claude/docs/AUDITORIA_SEGURANCA.md:244` marca Art. 18 como *"✅ Implementado… histórico de consumo completo (sem corte)"*; `.claude/docs/RUNBOOK_INCIDENTES.md:125` instrui usar o export porque *"traz todos os `ConsumptionRecord` do titular"* — modelo que **não existe mais** no schema v2. O risco residual 6.5 do RIPD já sinalizava a dúvida sem verificá-la; esta auditoria confirma: o export não inclui o consumo.
- **Impacto:** o titular exerce acesso/portabilidade e recebe tudo **menos** o dado que a plataforma mais coleta sobre ele. E o procedimento de resposta a incidentes depende de um export que não entrega o que o runbook promete.
- **Recomendação:** incluir consumo agregado (dia/mês via a agregação já existente em `consumption.service.ts`), `meters` e `alertTriggerEvents` no `ExportService`; corrigir `AUDITORIA_SEGURANCA.md` § 4 e `RUNBOOK_INCIDENTES.md` § 3.2 no mesmo PR (a correção documental é o que impede o erro de se repetir).

### [ALTO] Plano de resposta a incidentes fora da Res. CD/ANPD 15/2024, sem registro de 5 anos e sem cobertura dos operadores — Art. 48

- **Evidência (`.claude/docs/RUNBOOK_INCIDENTES.md`):**
  - § 4.1 (linha 147): *"Prazo: comunicação em prazo razoável (ANPD reconhece 72h como referência…)"* — a Res. 15/2024 fixa **3 dias úteis do conhecimento**, dobrados no pequeno porte. "72h corridas" é outro prazo.
  - § 4.2 (linha 155): canal apontando para a **ouvidoria do Ministério da Cidadania**, não para o formulário de comunicação de incidente da ANPD.
  - § 5.1 (linhas 206-219): registro em "arquivo/ticket externo", **sem** a guarda obrigatória de **5 anos** e sem previsão de registrar os incidentes avaliados e **não** comunicados com a justificativa. Não existe `.claude/docs/REGISTRO_INCIDENTES.md`.
  - Nada no runbook trata do cenário **incidente no operador**: não há contato de escalação com Render/Neon, nem prazo contratual de notificação (não há DPA — ver achado acima), nem procedimento para o caso de o vazamento ocorrer na infraestrutura de terceiro, que hoje é onde o dado vive.
  - § 1.1 (linha 14) ainda recomenda *"rotear para um agregador externo (CloudWatch, DataDog)"* sem nenhuma ressalva de transferência internacional — orientação que, se seguida, cria operador novo sem passar pelo gate do ROPA.
- **Recomendação:** atualizar prazo (3 dias úteis, dobrados, contados do conhecimento), canal correto da ANPD, criar o registro de incidentes com retenção de 5 anos, acrescentar um item "incidente no operador" com os canais de suporte/status de Render e Neon, e substituir a recomendação de agregador estrangeiro por um ponteiro para o gate de operador novo do ROPA.

### [ALTO] Base legal empacotada num único aceite, sem revogação e sem reaceite — apesar de duas mudanças materiais na Política — Art. 7º, Art. 8º §§ 4º e 5º, Art. 9º

- **Evidência:**
  - `CURRENT_CONSENT_VERSION` já foi de `1.0` → `1.1` → `1.2` (`backend/src/shared/legal/consentVersion.ts`), sendo que a 1.2 **introduziu transferência internacional** — a mudança mais material possível. A busca por `CURRENT_CONSENT_VERSION` em `backend/src/` mostra que ele é **escrito** no cadastro (`user.service.ts:104`) e **nunca comparado** com `user.consentVersion` em lugar nenhum: não há tela de reaceite.
  - Aceite único: `frontend/src/pages/auth/RegisterPage.tsx:37,71,303` (`acceptedTerms`) cobre simultaneamente Termos **e** Política.
  - Sem endpoint ou UI de revogação: `ProfilePage.tsx:259` marca "Revogação do consentimento" como "Pelo canal", e o `PROCEDIMENTO_DIREITOS_TITULAR.md` (linha 54) admite que revogar *"implica, na prática, encerrar a conta"* — o que é eliminação, não revogação.
  - `privacy-policy.md` § 3 lista consentimento + execução de contrato + obrigação legal para o conjunto, sem dizer qual base cobre qual operação; o ROPA (linha 42) repete "Consentimento + execução de contrato" para o cadastro.
- **Impacto:** consentimento não específico (Art. 8º §4º) e não revogável com a mesma facilidade com que foi dado (Art. 8º §5º); e declarar consentimento como base de um tratamento sem o qual o produto não existe é escolha frágil — a base correta ali é execução de contrato. O mecanismo de reaceite foi construído e nunca ligado, justamente na versão em que ele mais importava.
- **Recomendação:** atribuir **uma base por operação** no ROPA (com revisão jurídica), separar os dois aceites no cadastro, e ligar a verificação `user.consentVersion !== CURRENT_CONSENT_VERSION` → tela de reaceite no login. Como hoje só existem contas demo, o custo de ligar o reaceite é praticamente zero — é o momento mais barato que vai existir.

### [ALTO] O RIPD não foi reavaliado após a mudança de hospedagem e ainda afirma que o dado comportamental não sai do Brasil — Art. 38

- **Evidência (`.claude/docs/RIPD.md`):**
  - Risco residual 6.3 (linha 207): *"**Tratado.** Resolvido pela ADR-0008 (issue #158): hospedagem própria em São Paulo… o dado comportamental avaliado neste RIPD não sai do Brasil."* — falso desde a ADR-0010.
  - Risco residual 6.2 (linha 206): `Meter.extra` em texto claro "planejado para a Fase 13" — já implementado (`meterCredentialEncryption.ts`).
  - § 7 "Reavaliação" (linha 222) lista explicitamente *"mudança na topologia de hospedagem"* como gatilho obrigatório de revisão. O gatilho disparou em 2026-08-09 e a revisão não ocorreu; a única atualização feita (linhas 115-129, sobre a granularidade de minuto) reconhece a mudança de premissa mas adia a conclusão.
- **Impacto:** o RIPD é o artefato do Art. 38 e a base do argumento de proporcionalidade que a Fase 14 vai usar para fixar retenção. Um RIPD que afirma "o dado não sai do Brasil" enquanto o banco está no Oregon torna a avaliação de risco inutilizável — e, numa fiscalização, é evidência de que a avaliação não acompanha o tratamento real.
- **Recomendação:** revisar 6.2 (fechar) e 6.3 (reabrir com a natureza correta: risco jurisdicional restaurado, sem SCC, mitigado apenas pelo escopo de demonstração — e agora com a ressalva do Crítico 3, que enfraquece essa mitigação). Datar a revisão e referenciar a ADR-0010 e a ADR-0011.

---

### [MÉDIO] Guarda de registros de acesso não está garantida em nenhum dos dois caminhos de deploy — Marco Civil Art. 15 × minimização LGPD

- **Evidência:**
  - Os logs de requisição (`pinoHttp`, `backend/src/app.ts:156-166`) vão para **stdout**; `backend/src/shared/logger/logger.ts` não define destino nem rotação.
  - **Caminho A (Render):** a retenção do log de stdout é a do free tier do provedor (dias), fora do controle do projeto — nada garante 6 meses, e nada garante sigilo (é log de terceiro, sem DPA).
  - **Caminho B (self-hosted):** `docker-compose.yml` não configura `logging:` em nenhum serviço → driver `json-file` padrão, **sem `max-size`/`max-file`** — crescimento ilimitado no disco da VM, sem prazo de eliminação. `deploy/Caddyfile` **não habilita access log** algum.
  - A tabela `audit_logs` cobre eventos de autenticação/CRUD, não o conjunto dos registros de acesso à aplicação; e seus 730 dias nunca foram confrontados explicitamente com a minimização.
- **Impacto:** os dois lados da moeda ao mesmo tempo — nem o piso de 6 meses do Art. 15 está assegurado, nem existe teto que satisfaça a minimização (no Caminho B, log com IP acumula indefinidamente e ainda vira risco de disco cheio).
- **Recomendação:** decidir explicitamente a posição sobre o Art. 15 (o LumiTrack como portfólio sem fins econômicos provavelmente não é "provedor de aplicação com fins econômicos" — mas essa conclusão precisa estar **escrita** no ROPA, com fundamento, e não ser omissão); e, em qualquer hipótese, configurar `logging: driver json-file, max-size, max-file` no compose e um prazo de retenção declarado. Registrar a base legal (Art. 7º, II) e o prazo no ROPA.

### [MÉDIO] Backups com dado pessoal fora do ROPA, sem cifra e sem propagação de exclusão — Art. 16 · Art. 18 VI · Art. 46

- **Evidência:** `deploy/backup-postgres.sh` grava `pg_dump | gzip` em `/opt/lumitrack/backups` **sem cifra**, retenção por `find -mtime +14`, na **mesma VM** onde vivem as chaves de cifra (`backend/.env`) — ou seja, quem tem a máquina tem o dump e as chaves que decifram CPF/CNPJ e endereço. Não há cópia externa nem verificação de integridade automatizada. `DEPLOY.md:310-330` documenta o procedimento, mas nenhuma linha do `.claude/docs/ROPA.md` menciona backups. No Caminho A, a retenção de histórico/PITR do Neon também não está documentada nem inventariada.
- **Impacto adicional:** não existe procedimento para propagar a exclusão de conta (Art. 18 VI) aos backups — hoje o titular que apaga a conta continua presente nos dumps por até 14 dias, sem que isso esteja informado a ele (o § 7 do aviso diz que os dados "são removidos da nossa base").
- **Recomendação:** acrescentar linha de "Cópias de segurança" ao ROPA (finalidade, prazo, local, medidas); cifrar o dump (`age`/`gpg`, chave fora da VM) ou, no mínimo, restringir permissões e documentar o risco; declarar no § 7 do aviso que a eliminação se completa em até N dias por causa dos backups — é a redação honesta e comum.

### [MÉDIO] Aviso de privacidade sem cookies, sem prazos concretos, sem Art. 20 e sem idade mínima — e ainda autodeclarado "documento-modelo" — Art. 9º · Art. 14 · Art. 20

- **Evidência (`frontend/src/legal/privacy-policy.md` e `terms-of-use.md`):**
  - Nenhuma seção de cookies/armazenamento local, embora existam quatro cookies essenciais (`AUTH_COOKIE_NAME`, `CSRF_COOKIE_NAME` e os equivalentes de refresh, `backend/src/config/env.ts`) e uso de `localStorage` para tema e propriedade selecionada (`frontend/src/lib/storage.ts`, `frontend/src/hooks/usePropertySelection.ts`). *(Nota positiva: não há analytics nem rastreador — banner de consentimento **não** é exigível hoje; ver "Itens em conformidade".)*
  - § 7 sem nenhum prazo numérico, embora o código opere 30/30/30/730 dias.
  - Nenhuma seção sobre **decisões automatizadas** (Art. 20), apesar de o produto decidir automaticamente disparo de alerta (`alert-evaluator.ts`, regra de amostras consecutivas) e cálculo de custo (`TariffService`). O `PROCEDIMENTO_DIREITOS_TITULAR.md:55` reconhece o direito, mas o aviso não informa os critérios.
  - Nenhuma cláusula de **idade mínima** em `terms-of-use.md` § 2, e nenhuma coleta/declaração de maioridade no cadastro (`backend/src/modules/user/user.schema.ts`) — Art. 14 sem tratamento algum.
  - Aviso de "documento-modelo… deve ser revisado por um profissional jurídico" publicado em produção nos dois documentos (linhas 19-22 e 9-12).
- **Recomendação:** um único PR com: seção "Cookies e armazenamento local" (nome, finalidade, natureza estritamente necessária, duração), prazos reais do ROPA no § 7, seção "Decisões automatizadas" explicando alerta e cálculo de custo em linguagem simples, cláusula de idade mínima nos Termos § 2 + declaração no cadastro, e — quando houver revisão jurídica — remoção dos avisos de "documento-modelo" (mantê-los publicados fragiliza o valor probatório do consentimento). Publicar como 1.3 junto com a correção do Crítico 2.

### [MÉDIO] A região do banco no Neon nunca foi escolhida deliberadamente — havia opção no Brasil, de graça — Art. 33 · `09` ("preferir região BR/UE")

- **Evidência:** `.claude/docs/DEPLOY.md:55-57` ("Crie um projeto e copie a connection string") **não menciona região**. A tabela de contexto da própria ADR-0010 registra, para o Neon: *"Região BR? Sim, mas irrelevante aqui"* — e a ADR § "Consequência de conformidade" fala em *"Neon, região a definir"*, enquanto o ROPA e o aviso já afirmam **Estados Unidos** sem evidência de verificação.
- **Impacto:** metade da transferência internacional do projeto (o banco, que é onde o dado persiste, inclusive o IP do achado Alto 1) pode ser eliminada escolhendo `sa-east-1` no Neon — custo zero, sem trade-off técnico relevante. Hoje ela existe por omissão, não por decisão.
- **Recomendação:** verificar a região efetiva do projeto Neon; se estiver fora do Brasil, migrar (o banco tem seed reproduzível e volume baixo — é uma janela de minutos). Fixar a instrução "selecionar região São Paulo" no passo 1 do `DEPLOY.md` e atualizar ROPA/aviso com a região verificada. Se a migração for feita, a exposição restante cai para os registros de borda do Render.

### [MÉDIO] Drift documental faz a autoavaliação de conformidade reportar verde onde há Alto aberto

- **Evidência:**
  - `.claude/project_context/01-descricao.md:57`: *"os achados 🔴 Crítico e 🟠 Alto estão fechados, e nenhum achado acima de 🟢 Baixo permanece aberto"* — falso: a Fase 14 do roadmap existe exatamente porque retenção, DSAR, consentimento e documentos legais (todos Altos) continuam abertos. A mesma linha fala em "8 ADRs"; há 11.
  - `.claude/docs/AUDITORIA_SEGURANCA.md:244,248,249,250`: Art. 18 ✅ ("histórico de consumo completo"), Art. 15/16 ✅, Art. 48 ✅, Art. 37-39 ⚠️ *"nenhum provedor de produção escolhido ainda"* — três afirmações desmentidas por este laudo e uma desmentida pela ADR-0010. Este é o mesmo documento que o ROPA (linhas 176-181) indica como **anexo técnico do futuro DPA**.
- **Recomendação:** atualizar `01-descricao.md` para refletir o estado real (auditorias de 2026-08-05 remediadas em parte; Fase 14 pendente; este laudo), e marcar o `AUDITORIA_SEGURANCA.md` como documento histórico com data de congelamento no topo, em vez de mantê-lo como se fosse status vigente.

### [MÉDIO] Contas inativas e códigos de MFA usados sem prazo de eliminação — Art. 15, 16

- **Evidência:** `RetentionService` não trata `MfaBackupCode` usados (hashes bcrypt permanecem até o desligamento do MFA) nem define qualquer critério de **conta abandonada** — não há job, nem env, nem menção em `.claude/docs/ROPA.md` (operação 1 registra "Conta ativa: indefinida, enquanto o titular não a excluir"). O § 7 do aviso diz "enquanto sua conta estiver ativa" sem definir "ativa".
- **Recomendação:** definir política de conta inativa (ex.: aviso em 24 meses sem login, eliminação em 30) e expurgo de `MfaBackupCode` usados após 30 dias; refletir os dois no ROPA e no § 7 do aviso. Baixo esforço, fecha a lacuna conceitual do Art. 15 ("término do tratamento").

---

### [BAIXO] TLS não é obrigatório na configuração SMTP — contradiz o próprio checklist de DPA

- **Evidência:** `backend/src/config/env.ts:39` (`SMTP_SECURE` default `false`, sem guard de produção) e `backend/src/modules/auth/email.service.ts:16` repassando direto ao nodemailer, sem `requireTLS`. `render.yaml:76-83` provisiona `SMTP_*` com placeholders — ou seja, o caminho está montado para o dia em que um provedor for contratado.
- **Recomendação:** `requireTLS: true` como piso no transporter e guard de boot em produção. Lembrar que contratar SMTP cria **operador novo** (DPA + SCC se fora do BR/UE) e reabre o § 4 do aviso — o gate já está escrito no ROPA, basta cumpri-lo.

### [BAIXO] UX de direitos ainda incompleta no Perfil — Art. 9º, Art. 18

- **Evidência:** `frontend/src/pages/profile/ProfilePage.tsx:338` oferece apenas `format=json`; a API suporta `pdf` (`backend/src/modules/export/export.controller.ts`). `consentedAt`/`consentVersion` continuam não expostos ao titular (comentário em `ProfilePage.tsx:36`). *(A lista de direitos do Art. 18 com marcação "Autoatendido/Pelo canal" foi implementada e é um bom controle — ver "Itens em conformidade".)*
- **Recomendação:** oferecer os dois formatos e exibir data/versão do consentimento aceito — insumo natural da tela de reaceite do achado Alto 7.

### [BAIXO] Ticket de sessão do SSE entra no log de acesso do operador estrangeiro — Art. 46 · minimização

- **Evidência:** `GET /api/iot/stream?ticket=...` (`backend/src/modules/iot/iot-stream.routes.ts:84-91`) autentica por query string; o `pinoHttp` de `app.ts` loga `req.url` de toda requisição não-`/health`, e esse stdout é coletado pelo Render (EUA). O ticket é de uso único e 30s, o que limita muito o impacto.
- **Recomendação:** redigir o parâmetro no log (`customProps`/serializer que remova `ticket` da URL) — correção de duas linhas, mantendo o desenho da ADR-0010 intacto.

### [BAIXO] Serviços externos adotados no deploy não constam de nenhum inventário — Art. 37 (completude)

- **Evidência:** UptimeRobot (ADR-0011) e GitHub Actions (`.github/workflows/keep-alive.yml`) batem em `/health` a cada 5/10 min. A análise da ADR-0011 é **correta** (o endpoint é público, não autenticado, excluído do `autoLogging` em `app.ts:159`, e o fluxo é de entrada), mas nem o ROPA nem o aviso registram a decisão — quem consultar o inventário no futuro não encontra a avaliação, só a ausência.
- **Recomendação:** uma linha no ROPA na categoria "serviços externos sem tratamento de dado pessoal (avaliados)", com o ponteiro para a ADR-0011. Custo trivial, evita reanálise futura.

### [BAIXO] Credenciais de demonstração versionadas com `VITE_DEMO_MODE=true` em produção

- **Evidência:** `frontend/src/config/demoUsers.ts` versiona e-mail/senha das duas contas; `render.yaml:110` liga a flag em produção. Aceitável enquanto as contas forem sintéticas (`backend/prisma/seed-demo/identities.ts` gera CPF/CNPJ nunca emitidos; endereço fictício em `topology.ts:128-131`) — **mas o Crítico 3 mostra que "conta sintética" não implica "conteúdo sintético"**.
- **Recomendação:** manter, com a trava do Crítico 3 implementada; e garantir no checklist de go-live do Caminho B que a flag seja `false` em qualquer ambiente com titulares reais.

---

## Itens em conformidade

Controles verificados **neste código, nesta data** — vários são remediações efetivas do laudo de 2026-08-05:

- **Redação de PII e credenciais no log — corrigido e testado.** `backend/src/shared/logger/logger.ts:40-60` redige cookie, authorization, set-cookie, CSRF, `*.password`, `*.token`, `*.cpf`, `*.cnpj` e `metadata.attemptedEmail`; há teste de regressão (`backend/src/app.log-redaction.test.ts`). Era um Alto do laudo anterior.
- **`attemptedEmail` substituído por blind index** — e-mail de não-titulares não é mais retido em claro (issue #149, registrado no ROPA).
- **Credencial do medidor cifrada** — `backend/src/shared/crypto/meterCredentialEncryption.ts` + `METER_CREDENTIAL_ENCRYPTION_KEY`, com chave segregada. Era um Médio do laudo anterior (e o RIPD 6.2 pode ser fechado).
- **Cifra em repouso com segregação de chaves por categoria** — CPF/CNPJ (AES-256-GCM + blind index HMAC), endereço/cidade/estado/CEP (chave própria), segredo TOTP (chave própria), credencial do medidor (chave própria): **cinco** chaves independentes, geradas distintas por instrução explícita do `DEPLOY.md`. Compartimentalização acima do usual para o porte.
- **Cadastro público fechado por configuração, com fail-closed correto** — `REGISTRATION_ENABLED` usa `z.stringbool()` (não `z.coerce.boolean()`, que tornaria `"false"` verdadeiro) e está fixado como `"false"` em `render.yaml:25-26`.
- **Estrutura de exercício de direitos publicada** — bloco "Exercer meus direitos" no Perfil com os nove direitos do Art. 18 marcados como autoatendido/pelo canal (`ProfilePage.tsx:239-326`), procedimento documentado com o prazo em dobro de 30 dias (`PROCEDIMENTO_DIREITOS_TITULAR.md`). Falta apenas o endereço funcionar (Crítico 1).
- **Eliminação em cascata correta e completa** — `onDelete: Cascade` de `User` até `MeterReading` pela cadeia `Property → Area → Device → Meter`, com `AuditLog` deliberadamente em `SetNull` para sobreviver à exclusão (Art. 48). Verificado em `backend/prisma/schema.prisma`.
- **Trilha de auditoria desenhada com a LGPD em mente** — `metadata` limitado a nomes de campo, nunca valores; `DATA_EXPORT` e `ADMIN_AUDIT_LOG_VIEW` auditados como leitura privilegiada.
- **Sem analytics, sem rastreador, sem cookie não essencial** — `frontend/index.html` não carrega nenhum script de terceiro, CSP com `connect-src 'self'` (+ a origem da própria API), nenhuma fonte ou pixel externo. **Banner de consentimento continua não exigível** — a conformidade aqui veio de não adicionar nada.
- **Análise do UptimeRobot tecnicamente correta** — `/health` está de fato excluído do `autoLogging` (`app.ts:159`) e não processa dado de visitante; a ADR-0011 acertou ao não abrir a tabela de operadores por isso (falta só registrar a avaliação — Baixo 4).
- **Transparência sobre a própria lacuna** — a ADR-0010, o ROPA e o § 4 do aviso **nomeiam** os operadores, o país e a ausência de SCC em vez de omitir. Isso não sana a lacuna, mas é a postura correta e reduz materialmente o risco de má-fé numa fiscalização.
- **Dados de demonstração sintéticos** — CPF/CNPJ matematicamente válidos porém nunca emitidos, e-mails em domínio inexistente, endereço fictício.
- **Integração ANEEL e protocolos IoT** — `GET` de dados públicos de órgão brasileiro e conexões a equipamentos do próprio titular; nenhum dado pessoal enviado a terceiro.
- **Segredos fora do código** — `.env` no `.gitignore`, `sync: false` no `render.yaml` para todo segredo, gitleaks no CI, hook que bloqueia leitura de `.env*` pelo agente.

---

## Próximos passos sugeridos

**Bloco 0 — corrigir a produção (dias, não semanas; os três Críticos são de esforço baixo)**

1. Definir `VITE_PRIVACY_CONTACT_EMAIL` no `render.yaml` + redeploy, com trava no checklist de go-live (Crítico 1).
2. Corrigir o § 5 do `privacy-policy.md`, publicar 1.3 e bumpar `CURRENT_CONSENT_VERSION` — agrupando com as correções do Médio 3 para uma única versão (Crítico 2 + Médio 3).
3. Estender a trava de somente-leitura das contas demo a todas as escritas de domínio, via middleware único (Crítico 3).

**Bloco 1 — realinhar a governança com a realidade (só documental, alta alavancagem)**

4. Reescrever as sete operações do ROPA para o estado ADR-0010, acrescentar `email_changes`, backups e os serviços avaliados sem dado pessoal, e remover o bloco residual da ADR-0008 (Alto 2, Alto 1, Médio 2, Baixo 4).
5. Revisar o RIPD (6.2 fechado, 6.3 reaberto com a natureza correta), datando a revisão (Alto 8).
6. Atualizar `RUNBOOK_INCIDENTES.md` (3 dias úteis dobrados, canal da ANPD, incidente no operador) e criar o registro de incidentes com guarda de 5 anos (Alto 6).
7. Corrigir o drift de status em `01-descricao.md` e congelar `AUDITORIA_SEGURANCA.md` como histórico (Médio 5).

**Bloco 2 — reduzir a exposição real (custo zero ou quase)**

8. Verificar/migrar a região do Neon para São Paulo (Médio 4) e aderir aos DPAs de autoatendimento de Render e Neon (Alto 3).
9. Reduzir a retenção do IP de visitante em `audit_logs` para eventos de demo (Alto 1) e configurar `logging` com limite no `docker-compose.yml` (Médio 1).

**Bloco 3 — Fase 14 do roadmap, como já planejada**

10. Retenção de `MeterReading`/`AlertTriggerEvent` conforme o § 3.3 do RIPD, + conta inativa e `MfaBackupCode` (Alto 4, Médio 6).
11. DSAR completo (consumo, medidores, disparos) e correção da documentação que promete o que o export não entrega (Alto 5).
12. Base legal por operação com revisão jurídica, separação dos aceites e tela de reaceite ligada (Alto 7).

**Encaminhamento.** Os 22 achados são convertíveis em issues pela skill `criar-issues` (labels `origem: auditoria` + `tipo: conformidade`, prioridade mapeada da severidade). Recomendo que os três Críticos entrem como issues individuais P0 (são independentes entre si e todos pequenos), e que os Blocos 1 e 2 formem um épico de "realinhamento pós-deploy" antes da abertura formal da Fase 14 — hoje a documentação de conformidade descreve um sistema que deixou de existir em 2026-08-09, e isso contamina qualquer decisão que a Fase 14 tome sobre ela. A atribuição de base legal e a decisão sobre aplicabilidade do Marco Civil Art. 15 são **decisões jurídicas**, não de engenharia: devem passar por advogado ou encarregado antes de serem consideradas fechadas.
