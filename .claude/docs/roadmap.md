# Roadmap de Implementação — LumiTrack

> Documento vivo. Atualizado ao fim de cada fase. Fonte: `02-requisitos.md` + ADR-0005 + `.claude/design/2026-07-31-lumitrack-completo/`.
> Última atualização: 2026-08-04 · Fase atual: 5 (Fase 1 concluída — épico #94; Fase 2 concluída — épico #104; Fase 3 concluída — épico #110, PR #112; Fase 4 concluída — épico #114, branch `feat/114-painel-perfil`)
>
> Escopo: guia geral de implementação do projeto, não mais restrito a uma área. Fases 1–5 cobrem a migração do frontend para o design system Industry e a construção das telas do handoff que ainda não existem (nenhuma delas altera RF de backend). A partir da Fase 6 o escopo se amplia para incluir dívida técnica e mudanças de backend fora do design system.

## Visão geral das fases

| Fase | Objetivo (comportamento entregue) | Status |
|---|---|---|
| 1 | Fundação Industry + Autenticação (login, registro, recuperar senha) restilizados | **Concluída** (#89–#93, épico #94) |
| 2 | Hierarquia do consumidor (Propriedade→Área→Dispositivo) via modal + LGPD | **Concluída** (#97–#103, épico #104) |
| 3 | Alertas, Distribuidoras, Segurança/MFA restilizados | **Concluída** (#107–#109, #111, #113, épico #110, PR #112) |
| 4 | Painel (feature nova) + Perfil (tela nova) | **Concluída** (#115–#120, épico #114, branch `feat/114-painel-perfil`) |
| 5 | Landing pública (tela nova) + Simulador IoT (restyle) | Planejada — detalhe abaixo |
| 6 | Migração ethernet-ip v1→v2 no backend (dívida técnica) | Planejada — a iniciar após a Fase 5, detalhe abaixo |

## Fase 1 — Fundação Industry + Autenticação

### Fundação de tokens

- **Comportamento:** nenhum RF diretamente — infraestrutura. O app builda com os tokens do Industry (`@theme` do Tailwind mapeado para `frontend/src/styles/industry.css`), fontes Barlow self-hospedadas (sem request externo), dark mode via `data-theme`.
- **Cobre:** habilita RF01–RF19 na UI (nenhum RF específico).
- **Priority:** P0 · **Size:** S (a maior parte já feita)
- **Critérios de aceite:** `npm run build` e `npm run lint` sem erro novo; toggle de tema muda `data-theme` em `<html>` e as cores resolvem via os tokens do Industry; nenhuma requisição a `fonts.googleapis.com` em runtime; `ThemeContext.test.tsx` verde.
- **Depende de:** —
- **Risco/observações:** baixo — mudança isolada em 5 arquivos, sem tocar componente visual ainda. Progresso: fontes baixadas e self-hospedadas, `industry.css` copiado do bundle com override de dark mode, `ThemeContext`/`index.html`/`ThemeContext.test.tsx` migrados de `.dark` para `data-theme`. Falta: reescrever `frontend/src/index.css` (import + `@theme inline` mapeando os tokens + `@custom-variant dark`).

### Componentes base Industry

- **Comportamento:** nenhum RF diretamente — os 8 primitivos existentes (`Button`, `Input`, `Select`, `ConfirmDialog`, `EmptyState`, `Pagination`, `PasswordRequirements`, `ThemeToggle`) passam a usar as classes do Industry (`.btn`, `.input`, `.lt-modal`...) preservando as props públicas.
- **Cobre:** habilita todas as telas das fases seguintes.
- **Priority:** P0 · **Size:** L
- **Critérios de aceite:** cada primitivo mantém sua API (nenhuma tela consumidora quebra); testes unitários existentes passam com as novas classes; ícones com `strokeWidth={1.5}`; nenhum `border-radius` fora de zero (regra "sem cantos arredondados" do Industry).
- **Depende de:** Fundação de tokens.
- **Risco/observações:** médio — é o item que mais componentes futuros vão herdar; erro aqui se propaga. **Correção (achada durante #107):** o plano original previa 7 primitivos React novos (`Card`, `Tag`, `Table`, `IconButton`, `SegmentedControl`, `DefinitionList`, `Menu`) além dos 8 existentes — na prática só `Tag.tsx` foi construído como componente. Os demais tiveram a necessidade coberta diretamente por classes CSS do Industry usadas inline nos JSX das telas migradas (`.blueprint`, `.table`, `.corner`, etc.), sem precisar de um wrapper React dedicado — YAGNI: cria-se o primitivo quando um segundo consumidor real pedir a mesma API, não especulativamente.

### Login restilizado

- **Comportamento:** usuário autentica via e-mail/senha (com MFA se habilitado) na tela `LoginPage`, agora com a linguagem visual do Industry.
- **Cobre:** RF02, RF04.
- **Priority:** P0 · **Size:** S
- **Critérios de aceite:** layout conforme `LumiTrack Login.dc.html`; `auth.spec.ts` (E2E) verde sem mudança estrutural de testid; dark mode funcional na tela.
- **Depende de:** Componentes base Industry.
- **Risco/observações:** baixo — página já funcional, mudança é só visual.

### Registro restilizado

- **Comportamento:** visitante se cadastra como pessoa física ou jurídica, com `PasswordRequirements` restilizado.
- **Cobre:** RF01.
- **Priority:** P0 · **Size:** S
- **Critérios de aceite:** layout conforme `LumiTrack Registro.dc.html`; `RegisterPage.test.tsx` e E2E de registro verdes.
- **Depende de:** Componentes base Industry.
- **Risco/observações:** baixo.

### Recuperar senha (tela nova)

- **Comportamento:** usuário pede reset de senha por e-mail e define nova senha via link recebido — o backend já existe (`POST /api/auth/forgot-password` e `/reset-password`), só a UI está faltando.
- **Cobre:** RF05.
- **Priority:** P1 · **Size:** M
- **Critérios de aceite:** `ForgotPasswordPage` + `ResetPasswordPage` novas, conforme `LumiTrack Recuperar Senha.dc.html`; mensagem de sucesso genérica (anti-enumeração, não revela se o e-mail existe); teste cobrindo o fluxo (E2E ou integração, a decidir na execução — SMTP precisa de mock).
- **Depende de:** Componentes base Industry.
- **Risco/observações:** baixo-médio — tela nova, mas contrato de API já testado no backend.

## Fase 2 — Hierarquia do consumidor + LGPD (concluída)

Restyle de `PropertiesPage`/`PropertyDetailsPage`/`AreaDetailsPage`/`DeviceDetailsPage` (RF07) **e** migração do CRUD de 6 rotas dedicadas para modais (`.lt-modal`) — reescreveu os E2E `properties/area/device.spec.ts`. Restyle de `PrivacyPolicyPage`/`TermsOfUsePage` (consentimento, RF01, `09-conformidade-legal.md`). Épico #104, sub-issues #97–#103, PR #106.

## Fase 3 — Alertas, Distribuidoras, Segurança/MFA

> Handoff de design: as 3 telas estão dentro de `LumiTrack Home.dc.html` (app single-file multi-view, `state.view`) — views `isAlerts` (linhas 644–761), `isDist` (764–820), `isSecurity` (917–1035). Nenhum arquivo `.dc.html` separado por tela nesta fase.

### Restyle de Alertas

- **Comportamento:** usuário gerencia alertas por faixa de potência (criar/editar/habilitar/excluir) e consulta o histórico de disparos, agora com a linguagem visual Industry.
- **Cobre:** RF14, RF15, RF16.
- **Priority:** P1 · **Size:** L
- **Critérios de aceite:** layout conforme o bloco `isAlerts` do handoff (KPIs, tabela de alertas configurados, seção de histórico de disparos, dialog de criar/editar); o dialog de criar/editar (hoje `Dialog.Root` do Radix cru em `AlertFormDialog.tsx`) migrado pro `FormDialog` já padronizado (mesmo padrão de `MeterFormDialog`/`PropertyFormDialog`); KPIs "Alertas ativos" e "Em disparo agora" com dado real (deriváveis do catálogo de alertas já buscado + `GET /api/alerts/firing`, já consumido hoje pelo `WarningBadge`); **sem** o KPI "Disparos · últimos 30d" do protótipo — sem dado real, o backend (`GET /api/alert-events`) exige `alertId` e não tem endpoint agregado por período; `alerts.spec.ts` (E2E, hoje verde) continua verde sem quebra estrutural de fluxo.
- **Depende de:** Componentes base Industry (Fase 1, já entregue — a classe CSS `.table` de `industry.css` cobre a tabela, sem precisar de um primitivo `Table` React; ver correção na Fase 1 acima).
- **Risco/observações:** médio — maior superfície das 3 telas (tabela dupla + dialog + menu de contexto + badges de status), e a troca do dialog cru pro `FormDialog` é mudança estrutural, não só visual (mesma classe de risco que a unificação de modais em #97).

### Restyle de Distribuidoras

- **Comportamento:** usuário consulta o catálogo de distribuidoras (somente leitura, sem CRUD — populado por seed), agora com a linguagem visual Industry.
- **Cobre:** RF08 (parte — catálogo; a "bandeira tarifária vigente" de RF08 já está alocada na Fase 4, junto do Painel, não repetida aqui).
- **Priority:** P1 · **Size:** S
- **Critérios de aceite:** layout conforme o bloco `isDist` do handoff (grid de cards, filtro por UF, busca, estado vazio); `distributors.spec.ts` (E2E, hoje verde) continua verde.
- **Depende de:** Componentes base Industry.
- **Risco/observações:** baixo — menor superfície das 3 telas (sem CRUD, sem dialog), migração puramente visual.

### Restyle de Segurança/MFA

- **Comportamento:** usuário habilita/desabilita MFA (TOTP + códigos de backup), agora com a linguagem visual Industry.
- **Cobre:** RF03, RF04.
- **Priority:** P1 · **Size:** M
- **Critérios de aceite:** layout conforme o bloco `isSecurity` do handoff, restrito aos passos que já existem funcionalmente (`idle → setup → backup → disable`) — **sem** "Card Senha" (troca de senha autenticada) nem "Card Sessões ativas" do protótipo: nenhum dos dois tem RF ou endpoint de backend hoje (confirmado por grep — sem rota de change-password autenticado nem de listagem/encerramento de sessões); `SecurityPage.test.tsx`/`MfaCodeForm.test.tsx` verdes; nenhum uso residual do token legado pré-Industry `text-success`/`bg-success` (definido em `src/index.css`, não em `industry.css`) — trocar pelo token Industry `--color-status-success` real.
- **Depende de:** Componentes base Industry.
- **Risco/observações:** baixo-médio — funcionalmente já pronto, o risco é de consistência visual: `SecurityPage.tsx` está no token legado enquanto `MfaCodeForm.tsx` (componente compartilhado com `LoginPage`, já migrado na Fase 1) já usa tokens Industry reais — os dois precisam ficar coerentes no mesmo passe.

**Fechamento (2026-08-03):** entregue via PR #112. Além das 3 sub-issues planejadas, a branch tratou 2 achados descobertos durante a execução — #111 (bug de `autoFocus` vs. foco automático do Radix `Dialog.Content`, herdado de fases anteriores — `AreaForm`/`DeviceForm`) e #113 (testes de audit log pós-resposta racy em `admin`/`export`, achado durante investigação de CI) — e um fix de segurança sem issue própria (tolerância de tempo zerada por padrão na verificação TOTP, `otplib` `epochTolerance`). Nenhuma mudança de escopo nos 3 itens originalmente planejados.

## Fase 4 — Painel (feature nova) + Perfil (tela nova)

> Handoff de design: ambas as telas estão dentro de `LumiTrack Home.dc.html` (mesmo app single-file da Fase 3) — views `isDashboard` (linhas 152–246) e `isProfile` (823–914). Nenhuma das duas está "aguardando design" — handoff hifi cobre 100% do escopo abaixo.
>
> Achados de exploração que definem o escopo: RF12 (agregação por hora/dia/mês/ano, `GET /api/consumption`) e RF13 (custo TUSD+TE com tributos por dentro, CIP, piso de disponibilidade, `TariffService`) **já estão implementados no backend**. RF08 (bandeira vigente, módulo `tariff-flag`, GET público/PUT admin) **também já existe no backend** — falta só a integração no frontend. RF11 (SSE) já tem client funcional (`RealtimeContext`/`appStream.ts`). Não existem hoje: hook/service de bandeira no frontend, hook/service de usuário no frontend, topbar/seletor de propriedade, troca de senha autenticada, listagem/revogação de sessões (os 2 últimos ficam fora do escopo desta fase — sem RF/endpoint, mesmo corte já aplicado em #109).

### Seletor de propriedade (pré-requisito compartilhado)

- **Comportamento:** usuário troca a propriedade ativa num seletor na topbar/painel; a escolha persiste durante a navegação e direciona os dados exibidos abaixo.
- **Cobre:** habilita RF08, RF11, RF12, RF13 na UI (nenhum RF isolado).
- **Priority:** P0 · **Size:** S
- **Critérios de aceite:** componente novo consumindo `useProperties` (já existe); nenhuma tela quebra sem propriedade selecionada (estado vazio quando o usuário não tem propriedade cadastrada); teste de integração cobrindo a troca de propriedade.
- **Depende de:** Componentes base Industry (Fase 1).
- **Risco/observações:** baixo — peça isolada, mas bloqueia os 2 itens de Painel seguintes.

### Painel — visão em tempo real

- **Comportamento:** usuário abre `/dashboard`, vê "Potência agora" (kW) + custo estimado/h atualizando ao vivo, e um gráfico de consumo em tempo real (toggle última hora/24h).
- **Cobre:** RF11.
- **Priority:** P1 · **Size:** M
- **Critérios de aceite:** layout conforme o bloco `isDashboard` (KPIs "Potência agora" + gráfico de consumo em tempo real); dado via `RealtimeContext`/`appStream.ts` (já existe, client SSE) somando as leituras dos medidores da propriedade ativa — **sem endpoint agregado por propriedade no backend**, a soma é feita no cliente sobre `readingsByMeterId`; `dashboard.spec.ts` novo (E2E — hoje não existe nenhum teste, nem para o placeholder atual).
- **Depende de:** Seletor de propriedade.
- **Risco/observações:** médio — maior incerteza técnica da fase (agregação de múltiplos medidores em tempo real no cliente, sem precedente no código; atenção a performance de re-render em alta frequência de eventos SSE).

### Painel — KPIs de consumo/custo e bandeira vigente

- **Comportamento:** usuário vê "Consumo hoje" (kWh + delta vs. ontem), "Custo projetado do mês" e a "Bandeira tarifária vigente" (+ lista das 4 bandeiras com valores).
- **Cobre:** RF12, RF13, RF08 (parte pendente — bandeira vigente na UI; o catálogo de distribuidoras já foi restilizado na Fase 3).
- **Priority:** P1 · **Size:** M
- **Critérios de aceite:** novo `tariff-flag.service.ts`/`useTariffFlag` no frontend (backend já pronto, `GET /api/tariff-flag` público, sem restrição de role para leitura); KPIs de consumo/custo via `useConsumption` já existente (já traz `costBrl` calculado por bucket); card "Bandeiras tarifárias" lista as 4 com a vigente destacada.
- **Depende de:** Seletor de propriedade.
- **Risco/observações:** baixo-médio — dado já calculado no backend (`TariffService.calculateCore`/`calculateForProperty`), é composição de UI + 1 hook novo.

### Perfil — visualizar e editar dados pessoais

- **Comportamento:** usuário visualiza nome/sobrenome/CPF (mascarado, read-only)/e-mail/tipo de conta, e edita nome/sobrenome/e-mail.
- **Cobre:** sem RF formal — funcionalidade nova sobre `PUT /api/users/:id` (já existe, aceita `email`/`firstName`/`lastName`/`companyName`/`tradeName`; CPF/CNPJ deliberadamente fora do schema de update, batendo com o texto do handoff "O CPF não pode ser alterado após o cadastro").
- **Priority:** P1 · **Size:** S/M
- **Critérios de aceite:** rota `/perfil` nova + habilitar o item hoje `disabled` "Perfil (em breve)" em `UserMenu.tsx`; novo `user.service.ts`/hook de mutation no frontend; layout conforme o bloco `isProfile` (card de identidade + card "Dados pessoais" com os 2 modos leitura/edição); teste cobrindo o fluxo de edição.
- **Depende de:** Componentes base Industry (Fase 1). Independente do Painel — pode ser feito em paralelo.
- **Risco/observações:** baixo — CRUD simples sobre endpoint já testado no backend.

### Painel — histórico e comparação entre propriedades

- **Comportamento:** usuário vê o histórico de consumo mensal (toggle 6/12 meses) e compara consumo/custo entre suas propriedades (toggle kWh/R$).
- **Cobre:** RF12, RF13.
- **Priority:** P2 · **Size:** M
- **Critérios de aceite:** histórico via `useConsumption` (granularidade `month`); comparação faz N chamadas a `/api/consumption` (uma por propriedade — não existe endpoint agregado multi-propriedade) e funciona corretamente com 1 propriedade só (sem quebrar quando não há o que comparar).
- **Depende de:** Seletor de propriedade; reaproveita o mesmo padrão de gráfico dos 2 itens anteriores de Painel.
- **Risco/observações:** médio — N chamadas client-side escalam mal com muitas propriedades por usuário; aceitável no MVP (escala real é pequena), mas registrar como possível gatilho de ADR futuro (endpoint agregado) se isso mudar.

### Perfil — Conta e Privacidade & dados

- **Comportamento:** usuário vê "Membro desde", contagem de propriedades e status de 2FA; exporta seus dados (LGPD Art. 18) e exclui a conta — ambos a partir da tela de Perfil.
- **Cobre:** RF17 (export, já implementado no módulo `export` — só nova entrada de UI); sem RF formal para exclusão de conta (já existe `DELETE /api/users/:id`).
- **Priority:** P2 · **Size:** S
- **Critérios de aceite:** card "Conta" com dado real (`createdAt` do usuário — confirmar disponibilidade do campo antes de implementar); botão "Exportar meus dados" reaproveita o fluxo já existente; "Excluir minha conta" com `ConfirmDialog` (já existe) chamando `DELETE /api/users/:id`.
- **Depende de:** Perfil — visualizar e editar dados pessoais (mesma página).
- **Risco/observações:** baixo — reaproveita 2 features de backend já prontas, só nova superfície de UI.

**Fechamento (2026-08-04):** entregue nas 6 sub-issues planejadas (#115–#120), branch `feat/114-painel-perfil`, épico #114 — nenhum achado fora do escopo original (diferente da Fase 3, que teve 2 achados extras). Um bug real foi encontrado e corrigido durante a execução do último item (#119): colisão de `queryKey` do TanStack Query entre `PropertyComparisonSection` e `DashboardKpiRow` (mesmos parâmetros `PROPERTY`/`month`/`page:1`/`pageSize:1` pra propriedade selecionada, `queryFn` de formatos incompatíveis — o cache compartilhado servia o formato errado pro outro consumidor e quebrava a página); corrigido alinhando o `pageSize` ao valor que `AreasSection` já usa (3, não 1) — registrado em detalhe no `CHANGELOG.md`. PR ainda não aberto no momento desta atualização do roadmap.

## Fase 5 — Landing pública + Simulador IoT

> Handoff de design: `LumiTrack Landing.dc.html` e `LumiTrack IoT Simulator.dc.html`, ambos em `.claude/design/2026-07-31-lumitrack-completo/design/` — nenhum dos dois "aguardando design". Última fase deste roadmap: RF01–RF19 já estão todos cobertos desde a Fase 3 (Fases 4 e 5 são só UI sobre RFs já implementados ou telas de marketing/apoio sem RF formal) — ver "RFs adiados do MVP" abaixo pro que fica de fora mesmo depois desta fase.

### Landing pública (tela nova)

- **Comportamento:** visitante não autenticado acessa `/` e vê a landing de marketing do produto (hoje a rota raiz só redireciona direto pra `/login`, sem nenhuma página própria), com CTAs para `/login` e `/registro`.
- **Cobre:** sem RF formal — página de marketing, sem lógica de negócio nova.
- **Priority:** P1 · **Size:** S/M
- **Critérios de aceite:** layout conforme `LumiTrack Landing.dc.html`; `AppRouter.tsx` troca `<Route path="/" element={<Navigate to="/login" replace />} />` por `<LandingPage />`; usuário já autenticado que acessa `/` é redirecionado pra `/dashboard` (mesma regra que `PublicRoute.tsx` já aplica a `/login`/`/registro` — decidir na execução se a landing entra dentro de `PublicRoute` ou replica a checagem, já que hoje ela é `PublicRoute`-only); teste E2E cobrindo navegação básica (CTA leva a `/login` e a `/registro`; usuário autenticado que acessa `/` cai em `/dashboard`).
- **Depende de:** Componentes base Industry (Fase 1).
- **Risco/observações:** baixo — sem estado, sem chamada de API, puramente apresentacional (mesma classe de risco da Fase 1 antes dos componentes existirem). Único ponto de atenção real é a regra de redirecionamento pra usuário já logado, pra não ficar inconsistente com `/login`/`/registro`.

### Simulador IoT restilizado

- **Comportamento:** operador do simulador (uso interno — dev/demo, não é tela do produto pro usuário final) gerencia redes MQTT simuladas e dispositivos dentro delas com a linguagem visual Industry, preservando o comportamento funcional de hoje.
- **Cobre:** sem RF formal — pacote de apoio (`iot-simulator/`), existe pra operar o produto ponta a ponta sem hardware físico (ver `01-descricao.md`), não é parte do produto principal.
- **Priority:** P2 · **Size:** M
- **Critérios de aceite:** layout conforme `LumiTrack IoT Simulator.dc.html`; telas/componentes migrados: `Dashboard.tsx` (única página hoje, 68 linhas — header com info do broker + status de conexão + form de criar rede), `NetworkCard.tsx`, `DeviceCard.tsx`, `DeviceControls.tsx`, `AnomalyButton.tsx`; testes existentes (`useNetworks.test.tsx`, `useLiveStatus.test.ts`, `services/api.test.ts`) continuam verdes sem alteração — é migração só visual, hooks/services não mudam.
- **Depende de:** nenhuma dependência de outra fase (pacote isolado, `iot-simulator/ui` tem seu próprio `package.json`/build, ver `03-arquitetura.md`) — mas se decidir compartilhar tokens com `frontend/`, reaproveita o aprendizado da Fundação de tokens (Fase 1).
- **Risco/observações:** médio — única decisão de arquitetura não trivial da fase: `iot-simulator/ui` hoje usa Tailwind cru (`rounded-lg`, `border-slate-200`, sem `industry.css`), sem nenhum precedente no projeto de um pacote do monorepo consumir os tokens Industry de outro (`frontend/src/styles/industry.css`) — decidir na execução se os tokens são compartilhados (ex.: pacote CSS próprio) ou duplicados localmente no `iot-simulator/ui`. Risco de produto é baixo (ferramenta de dev/demo, não afeta usuário final), o risco é só essa decisão estrutural.

## Fase 6 — Migração ethernet-ip v1→v2 no backend (dívida técnica)

> Origem: achado durante triagem dos PRs abertos do dependabot (2026-08-04). O PR #51 (bump `ethernet-ip` 1.2.5→2.0.0 em `backend/`) **não foi mesclado** — passa no CI, mas quebraria em runtime. Detalhe abaixo é a base para as issues da fase (via skill `criar-issues`).

### Migração da integração EtherNet/IP para a API v2

- **Comportamento:** nenhum RF novo — dívida técnica/manutenção. A ingestão de leituras via EtherNet/IP (RF09, RF10) continua funcionando de ponta a ponta, agora sobre a lib `ethernet-ip` atualizada (2.0.0), sem regressão observável pelo usuário final.
- **Cobre:** mantém RF09 (protocolo de conexão do Medidor) e RF10 (ingestão de amostras) funcionando para o protocolo EtherNet/IP especificamente.
- **Priority:** P1 · **Size:** M
- **Critérios de aceite:**
  - `backend/src/modules/iot/iot-worker/protocols/ModbusTcpConnection.ts` (linhas ~260–305) reescrito para a API v2 (`PLC` em vez de `Controller`; `plc.connect(host, { slot })`; `plc.read`/`plc.write` em vez de `readTag`/`writeTag`; `plc.destroy()` ou equivalente da v2).
  - `backend/src/types/ethernet-ip.d.ts` removido (a v2 tem tipos nativos, o pacote de declaração manual fica obsoleto) — build deve continuar sem erro usando os tipos publicados pela própria lib.
  - Teste novo que exercita o `import("ethernet-ip")` **real** (não mockado) o suficiente para pegar um `TypeError` de API incompatível — a lacuna que deixou o CI verde no PR #51 apesar da quebra em runtime; decidir no design da issue se isso é um teste de integração leve (ex.: instanciar `PLC`/chamar métodos contra um mock de socket) ou um smoke test dedicado.
  - `npm audit`/`backend-audit` sem a entrada de `ethernet-ip` desatualizado.
  - Só depois de tudo acima verde: mesclar o bump de versão (pode reabrir o #51 já resolvido, ou o dependabot reabre um PR novo apontando pra mesma versão).
- **Depende de:** —
- **Risco/observações:** médio-alto — reescrita de API completa (não é find-and-replace), em código que fala com hardware industrial real (PLC via EtherNet/IP); sem cobertura de teste de hardware real no CI hoje, o risco de regressão silenciosa é o mesmo padrão que permitiu o CI verde mentiroso no PR original — mitigar com o teste de import real acima antes de considerar a fase concluída.

## Fases seguintes (menos detalhadas — serão refinadas ao chegar)

Nenhuma Fase 7 definida ainda. Itens novos exigem novos requisitos ou achados equivalentes: retomar este documento (via skill `planejar-roadmap`) só quando surgirem — não antecipar fases especulativas.

## RFs/telas adiados do MVP (com justificativa)

- **Relatórios restilizado** — página funcional (`ReportsPage`), mas **sem handoff de design no bundle atual**. Entra no roadmap só quando um export dedicado existir em `.claude/design/`.
- **Simulações (UI)** — sem handoff **e** sem UI implementada (`SimulationPage` é placeholder hoje). Precisa de handoff + escopo de UX que ainda não foi definido — feature nova completa, não restyle.
- **IoT Login** — tem handoff no bundle, mas `iot-simulator/server` não tem autenticação nenhuma hoje. É decisão de segurança (viraria ADR própria) antes de ser decisão de design; fica fora deste roadmap de UI.
- **Mobile** — o bundle não especifica breakpoints; ver `07-decisoes-em-aberto.md` (app mobile em si nem existe ainda, item separado).

## Justificativas de sequenciamento

- **Fundação antes de tudo:** nenhuma tela fica fiel ao Industry sem os tokens/componentes existirem primeiro — é o único ponto do roadmap onde a regra de fatiamento vertical cede a uma dependência técnica inescapável (mesma lógica de "scaffold antes de feature" que o kit já trata como categoria própria).
- **Autenticação antes do resto:** é o primeiro contato de qualquer usuário com o produto — maior visibilidade de um restyle malfeito — e o menor conjunto de telas que valida o pipeline inteiro (tokens → componentes → E2E) antes de escalar para o app logado.
- **Hierarquia do consumidor (Fase 2) antes de Alertas/Distribuidoras/Segurança (Fase 3):** Propriedade→Área→Dispositivo é a espinha dorsal do resto do produto (medidores penduram nela), e a migração de rotas para modal é a mudança estrutural mais arriscada do roadmap — fazer cedo, enquanto ainda dá para o resto se adaptar ao padrão que ela estabelece.
- **Painel/Perfil (Fase 4) depois da hierarquia:** o Painel depende de Propriedades/Medidores existirem para ter dado real a mostrar, e do seletor de propriedade da topbar — que só faz sentido com Propriedades já restilizado.
- **Dentro da Fase 4, seletor de propriedade antes de Painel:** os 3 itens de Painel (tempo real, KPIs/bandeira, histórico/comparação) leem a propriedade ativa — sem o seletor, cada um teria que resolver essa dependência de forma isolada e inconsistente. Perfil é independente e pode avançar em paralelo. Tempo real vem antes de KPIs/bandeira por ser o item de maior incerteza técnica (agregação de SSE no cliente, sem precedente) — validar cedo enquanto ainda é barato ajustar; histórico/comparação fica por último por ser o de menor valor imediato (útil só com mais de um período/propriedade acumulado) e o único com um risco de escala conhecido (N chamadas client-side).
- **Landing/Simulador (Fase 5) por último:** menor risco técnico e menor dependência de qualquer fase anterior — entram por último por serem os mais paralelizáveis, não por serem menos importantes.
- **Dentro da Fase 5, Landing antes de Simulador:** Landing é rota raiz do produto (`/`) — maior visibilidade de qualquer inconsistência — e P1 por ser o primeiro contato de um visitante, mesma lógica já aplicada à Autenticação na Fase 1. Simulador fica por último (P2): é ferramenta de dev/demo (`iot-simulator/`), não uma tela do produto pro usuário final, e carrega a única decisão de arquitetura não trivial da fase (tokens Industry compartilhados entre pacotes do monorepo vs. duplicados) — vale isolar esse risco no fim, sem bloquear a Landing por causa dele.
- **Fase 6 depois da Fase 5, não em paralelo:** decisão explícita do usuário (2026-08-04) — a Fase 5 (UI) segue como prioridade corrente; a migração do ethernet-ip (backend, sem RF novo, puramente dívida técnica) só começa depois. Tecnicamente as duas fases são independentes (pacotes/áreas diferentes do monorepo, sem dependência real), mas manter o sequenciamento evita dividir o foco entre uma fase de produto quase fechando o roadmap original e uma migração de biblioteca que reescreve integração com hardware real — risco maior, exige atenção dedicada.
