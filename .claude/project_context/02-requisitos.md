# 02 — Requisitos e Funcionamento

> Guia de preenchimento: RF testável, na forma "o sistema deve permitir que [ator] [ação]".
> RNF mensurável (ex.: "p95 < 300ms"). FNC descreve o fluxo passo a passo.
>
> Derivado do código existente (`backend/src/modules/`) — reflete o que está implementado, não um backlog. Requisitos futuros nascem do roadmap (`.claude/docs/roadmap.md`).

## 2.1 Requisitos Funcionais

**Conta e autenticação**
- RF01: o sistema deve permitir que um visitante se cadastre como pessoa física (nome, e-mail, senha, CPF) ou jurídica (razão social, e-mail, senha, CNPJ), registrando consentimento LGPD versionado. O cadastro público é **fechável por configuração** (`REGISTRATION_ENABLED`, default ligado): desligado, `POST /api/users` recusa com 403 — premissa de validade da ADR-0008 no ambiente de demonstração pública.
- RF02: o sistema deve permitir que um usuário autentique via e-mail/senha, com canal `WEB` (cookie `HttpOnly`) ou `MOBILE` (Bearer token de longa duração).
- RF03: o sistema deve permitir que um usuário habilite MFA via TOTP (QR code) e receba um lote de códigos de backup de uso único.
- RF04: o sistema deve exigir o segundo fator no login quando o MFA estiver habilitado, aceitando código TOTP ou código de backup.
- RF05: o sistema deve permitir logout (revogação do token/sessão) e recuperação de senha por e-mail, sem revelar se o e-mail existe (anti-enumeração).
- RF06: a sessão WEB deve renovar-se via refresh token opaco rotacionado, detectando e reagindo ao reuso de um token já trocado.
- RF20: o sistema deve exigir a senha atual para iniciar uma troca de e-mail e só efetivá-la após confirmação pelo novo endereço (token hasheado, com expiração), revogando todas as sessões da conta na confirmação.

**Hierarquia do consumidor**
- RF07: o sistema deve permitir que um usuário cadastre Propriedades (endereço, distribuidora, sistema elétrico, classe de faturamento B1/B2/B3), Áreas dentro de uma Propriedade e Aparelhos dentro de uma Área.
- RF08: o sistema deve permitir que um usuário consulte o catálogo de distribuidoras de energia (somente leitura, dados tarifários reais) e a bandeira tarifária vigente.

**Medição IoT**
- RF09: o sistema deve permitir que um usuário vincule um Medidor a exatamente um alvo (Propriedade, Área ou Aparelho), configurando o protocolo de conexão (MQTT, Modbus TCP/RTU, EtherNet/IP, Profibus, PROFINET, RS232, RS485).
- RF10: o sistema deve ingerir amostras elétricas (tensão, corrente, potência, fator de potência) do medidor e agregá-las em leituras por minuto, com médias ponderadas por tempo de vigência de cada amostra.
- RF11: o sistema deve expor as leituras e disparos de alerta em tempo real via SSE, por usuário autenticado.

**Consumo e custo**
- RF12: o sistema deve permitir que um usuário consulte consumo (kWh) agregado por hora, dia, mês ou ano, em qualquer nível da hierarquia (Propriedade/Área/Aparelho).
- RF13: o sistema deve calcular o custo em reais de cada agregação usando TUSD + TE decompostos, tributos "por dentro" (ICMS/PIS/COFINS), bandeira tarifária vigente e CIP municipal; ao nível Propriedade, deve aplicar o piso de disponibilidade (30/50/100 kWh conforme sistema monofásico/bifásico/trifásico).

**Alertas**
- RF14: o sistema deve permitir que um usuário crie um alerta por faixa de potência (potência de referência em kW + tolerância em %) associado a um medidor, habilitando/desabilitando-o.
- RF15: o sistema deve avaliar cada amostra recebida contra os alertas habilitados do medidor e abrir um episódio de disparo após 3 amostras consecutivas fora da faixa, fechando-o após 5 amostras consecutivas dentro dela.
- RF16: o sistema deve persistir cada episódio de disparo encerrado (início, fim, duração, potência mín./máx./média, nº de amostras) e notificar o usuário.

**Dados pessoais e administração**
- RF17: o sistema deve permitir que um usuário exporte seus próprios dados pessoais em PDF (portabilidade, Art. 18 LGPD).
- RF18: o sistema deve permitir que um usuário com papel `ADMIN` consulte a trilha de auditoria (login, logout, acesso negado, CRUD de dados pessoais), com filtros e paginação.
- RF19: o sistema deve registrar em trilha de auditoria: login, logout, acesso negado, CRUD de usuário/propriedade, exportação de dados, habilitação/desabilitação de MFA e reuso de refresh token detectado.

## 2.2 Requisitos Não Funcionais

**Segurança**
- RNF01: rate limit global de 1000 requisições / 15 min por IP; rate limit estrito de 10 requisições / 15 min por IP em `/login`, `/login/mfa`, `/forgot-password`, `/reset-password` e no cadastro (`POST /api/users`, escopado só na criação — as rotas autenticadas de `/api/users/:id` seguem no limite global).
- RNF02: senhas com bcrypt (12 rounds); CPF, CNPJ, endereço, segredo MFA e credencial MQTT do medidor (`Meter.extra.password`) cifrados em repouso com AES-256-GCM — **cinco chaves segregadas por finalidade**, cada uma obrigatória e sem default; refresh token, token de sessão, token de reset de senha e token de troca de e-mail armazenados como hash SHA-256, nunca em texto claro.
- RNF03: sessão WEB expira em 15 min (`JWT_WEB_EXPIRES_IN`, renovável via refresh); token MOBILE expira em 90 dias (`MOBILE_TOKEN_EXPIRES_IN`).
- RNF04: HSTS com 1 ano + subdomínios; CSP deny-all na API (JSON pura) e CSP própria no SPA (`frontend/index.html`, via `<meta>`); redirect HTTP→HTTPS sempre para um **host canônico fixo** (`PUBLIC_API_ORIGIN`), nunca o header `Host` do cliente — requisição com Host fora do canônico recebe 400; `CORS_ORIGIN` não pode ser `*` e `PUBLIC_API_ORIGIN` não pode ficar no default de localhost em produção (ambos guardados por schema, fail-fast no boot).
- RNF05: cada controle crítico (A01, A04, A05, A07, A10 do OWASP Top 10:2025) deve ter teste automatizado que falha se o controle for removido.

**Retenção e conformidade**
- RNF06: tokens de autenticação e resets de senha inativos (expirados/revogados/usados) são expurgados após 30 dias (`DATA_RETENTION_AUTH_TOKEN_DAYS` / `DATA_RETENTION_PASSWORD_RESET_DAYS`); refresh tokens inativos após 30 dias (`DATA_RETENTION_REFRESH_TOKEN_DAYS`); logs de auditoria após 730 dias / ~2 anos (`DATA_RETENTION_AUDIT_LOG_DAYS`).

**Qualidade e entrega**
- RNF07: o pipeline de CI (`.github/workflows/ci.yml`) deve bloquear o merge em caso de falha de lint, build, testes ou `npm audit --audit-level=high` nos **três** pacotes (backend, frontend e `iot-simulator`), mais a suíte E2E Playwright e o `secret-scan` (gitleaks, com config própria em `.gitleaks.toml`) — 15 jobs no total.
- RNF08: instalação de dependências sempre via `npm ci` (build reprodutível a partir do lockfile).
- RNF09: TypeScript em modo `strict`, sem uso de `any` (ver `06-code-quality-standards.md`).

## 2.3 Funcionamento

**FNC001 — Ingestão de leitura IoT até a leitura agregada**
1. O adaptador do protocolo configurado no Medidor (`IoTConnectionManager`) recebe uma amostra bruta.
2. `IoTDataProcessor` normaliza a amostra (calcula `deltaSeconds` desde a anterior, com clamp) e a repassa ao `MinuteBuffer` do medidor.
3. `MinuteBuffer` acumula a amostra no balde do minuto corrente, ponderando tensão/corrente/potência/fator de potência pelo `deltaSeconds`.
4. `MinuteRollupScheduler` persiste periodicamente os baldes fechados como `MeterReading`, via upsert idempotente (`secondsCovered` permite merge se o rollup rodar mais de uma vez no mesmo minuto).
5. A amostra bruta é simultaneamente repassada ao `AlertEvaluator` (FNC002) e transmitida via SSE (`UserEventHub`) a quem estiver com a tela aberta.

**FNC002 — Avaliação e ciclo de vida de um alerta**
1. `AlertEvaluator` mantém em memória um cache `meterId → Alert[]` (só habilitados), carregado no boot e invalidado a cada create/update/delete/toggle de alerta.
2. A cada amostra recebida, compara a potência ativa contra a faixa `referência × (1 ± tolerância%)` de cada alerta do medidor.
3. Fora da faixa por 3 amostras consecutivas → abre o episódio (`firing = true`), guardando `startedAt` e acumulando min/máx/soma de potência.
4. Dentro da faixa por 5 amostras consecutivas → fecha o episódio: persiste um `AlertTriggerEvent` (duração, estatísticas) e emite notificação + evento SSE.
5. Se o alerta for desabilitado ou excluído durante um episódio em curso, o episódio é encerrado e persistido no estado em que estava.

**FNC003 — Cálculo de custo de uma agregação de consumo**
1. Dado um `kwhConsumed` do período e o alvo (Propriedade, Área ou Aparelho), busca os parâmetros tarifários da distribuidora da Propriedade (`tusdPerKwh`, `tePerKwh`, `icmsRate`, `pisRate`, `cofinsRate`) e o valor por 100 kWh da bandeira vigente.
2. Se o alvo for **Propriedade**: aplica o piso de disponibilidade (`kwhBilled = max(kwhConsumed, piso)` conforme sistema elétrico) e soma a CIP municipal fora da base de tributos; Área/Aparelho não têm piso (são recortes internos da unidade).
3. Calcula energia (`kwhBilled × (tusd + te)`) e bandeira (`kwhBilled × flagPer100Kwh / 100`), soma os dois, e aplica os tributos "por dentro": `totalComTributos = totalSemTributos / (1 − (icms + pis + cofins))`.
4. Retorna a decomposição completa (energia, bandeira, tributos, CIP, total) — nunca só o total, para que a UI possa exibir o detalhamento.
