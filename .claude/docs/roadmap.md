# Roadmap de Implementação — LumiTrack

> Documento vivo. Atualizado ao fim de cada fase. Fonte: `02-requisitos.md` + ADR-0005 + `.claude/design/2026-07-31-lumitrack-completo/`.
> Última atualização: 2026-08-09 · Fase atual: 13.5 (Fases 1–13 concluídas — épicos #94, #104, #110, #114, #128, #132, #133, #134, #148, #154, #159, #185 e issue #127)
>
> Escopo: guia geral de implementação do projeto, não mais restrito a uma área. Fases 1–5 cobrem a migração do frontend para o design system Industry e a construção das telas do handoff que ainda não existem (nenhuma delas altera RF de backend). Fases 6–9 ampliam para fidelidade do chrome, consistência das telas públicas, integração externa e dívida técnica de backend. **Fases 10–18 são a remediação das quatro auditorias de 2026-08-05** (segurança, conformidade, qualidade, desempenho) — nenhum RF novo; o produto passa a ser endurecido em vez de ampliado. **Fases 19–22 abrem a maior expansão de domínio desde o MVP:** Grupo A (alta/média tensão, tarifa binômia), Mercado Livre (ACL) e Tarifa Branca — RFs novos, ADR estrutural e mudança no modelo de dados tarifário.

## Visão geral das fases

| Fase | Objetivo (comportamento entregue) | Status |
|---|---|---|
| 1 | Fundação Industry + Autenticação (login, registro, recuperar senha) restilizados | **Concluída** (#89–#93, épico #94) |
| 2 | Hierarquia do consumidor (Propriedade→Área→Dispositivo) via modal + LGPD | **Concluída** (#97–#103, épico #104) |
| 3 | Alertas, Distribuidoras, Segurança/MFA restilizados | **Concluída** (#107–#109, #111, #113, épico #110, PR #112) |
| 4 | Painel (feature nova) + Perfil (tela nova) | **Concluída** (#115–#120, épico #114, PR #124) |
| 5 | Landing pública (tela nova) + Simulador IoT (restyle) | **Concluída** (#129–#130, épico #128, PR #131) |
| 6 | Shell do app autenticado (Sidebar + Header conforme handoff) + "Sobre o projeto" | **Concluída** (#135–#137, épico #132, PR ainda não aberto) |
| 7 | Consistência das telas públicas (autenticação, Landing, LGPD) | **Concluída** (#138–#141, épico #133, PR ainda não aberto) |
| 8 | Bandeira tarifária a partir da fonte oficial (spike → ADR → integração condicional) | **Concluída** (#142–#143, épico #134, PR #146) |
| 9 | Migração ethernet-ip v1→v2 no backend (dívida técnica) | **Concluída** (#127, PR ainda não aberto) |
| 10 | Bloqueadores de segurança — log, SSRF, ciclo de vida de sessão, MFA | **Concluída** (#149–#153, épico #148) |
| 11 | Bloqueadores de conformidade LGPD — canal do titular, ROPA, RIPD, transferência internacional | **Concluída** (#155–#158, épico #154) |
| 12 | Travas mecânicas de qualidade + correções sem trade-off | **Concluída** (#160–#165, épico #159) |
| 13 | Endurecimento de segurança (P1) — cadastro público, credenciais, perímetro, CSP, lacunas de teste | **Concluída** (#177–#184, épico #185) |
| 13.5 | Primeiro deploy — infraestrutura de go-live + documentação pública | **Atual** — detalhe abaixo |
| 14 | Conformidade P1 — retenção, DSAR, consentimento e documentos legais | Planejada — objetivo abaixo |
| 15 | Desempenho — instrumentação, índices e eliminação dos multiplicadores | Planejada — objetivo abaixo |
| 16 | Worker IoT — robustez, estrutura e cobertura | Planejada — objetivo abaixo |
| 17 | Frontend — tempo real e bundle | Planejada — objetivo abaixo |
| 18 | Design system, cobertura de testes e polimento | Planejada — objetivo abaixo |
| 19 | Grupo A — fundação tarifária (subgrupos, modalidades, postos, demanda) + Horária Verde | Planejada — detalhe abaixo |
| 20 | Grupo A — Horária Azul, ultrapassagem de demanda e energia reativa excedente | Planejada — objetivo abaixo |
| 21 | Mercado Livre de Energia (ACL) | Planejada — objetivo abaixo |
| 22 | Tarifa Branca (Grupo B) — reaproveita a fundação de postos tarifários | Planejada — objetivo abaixo |

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

**Fechamento (2026-08-04):** entregue nas 2 sub-issues planejadas (#129 Landing, #130 Simulador IoT), épico #128, PR #131. A decisão de tokens sinalizada como "decidir na execução" foi resolvida em #130 — **duplicação local**, não compartilhamento: `iot-simulator/ui/src/styles/industry.css` é uma cópia adaptada do `design-system/styles.css` canônico, contendo só as classes efetivamente usadas na única tela do simulador. Compartilhar de verdade exigiria infra nova (pacote CSS publicado ou symlink cross-workspace) — over-engineering para uma ferramenta interna. Além do planejado, a fase absorveu 2 rodadas de correção de fidelidade visual da Landing, reportadas pelo usuário após revisão do resultado:

- **Achado de escopo maior que a Landing:** `body { @apply bg-white text-slate-900 }` em `index.css` **não estava dentro de nenhum `@layer`** — e, pela regra de CSS Cascade Layers (estilo sem layer sempre vence estilo com layer), sobrescrevia o `body { background: var(--color-bg) }` de `industry.css`. Efeito: **toda** página fora do `AppShell` (Login, Registro, Landing, LGPD) renderizava branco/preto puro em vez do cinza do Industry, desde a Fase 1 — passou despercebido por 5 fases porque nenhuma tela era comparada lado a lado com o protótipo em ambos os temas.
- **`.nav a` vencendo `.btn-primary`:** seletor descendente (0,1,1) é mais específico que classe única (0,1,0) na mesma layer — o botão "Criar conta" da nav herdava a cor do `<nav>`. Só a Landing sofre disso por ser a primeira tela a usar a classe `.nav`.
- **Dívida deixada explicitamente:** `AppShell.tsx` usa `bg-slate-50 dark:bg-slate-950` hardcodado (mesma classe de erro, mascarada hoje porque cobre o body inteiro) — **não corrigido na Fase 5** para não abrir frente de risco fora da sub-issue. Recolhido como critério de aceite da Fase 6, abaixo.

## Fase 6 — Shell do app autenticado + "Sobre o projeto"

> Handoff de design: `LumiTrack Home.dc.html` — sidebar nas linhas 61–81, topbar nas linhas 83–148, definição dos itens de nav na linha ~1356 e o mapa de kicker/título por view na linha ~1501.
>
> **Achado que dá origem à fase:** `Sidebar.tsx` e `Header.tsx` são o **único resíduo pré-Industry do app logado**. As Fases 1–5 migraram o conteúdo de todas as telas e deixaram o chrome em volta com os tokens antigos (`bg-white`, `border-slate-200`, `bg-brand-500`, `rounded-md`, `dark:` por classe) — hoje o app renderiza conteúdo Industry dentro de uma moldura do tema anterior, em toda tela autenticada. Junto entra o `bg-slate-50 dark:bg-slate-950` do `AppShell.tsx`, registrado no fechamento da Fase 5 como acompanhamento futuro.
>
> A fase **não é só restyle**: o handoff redistribui responsabilidades entre sidebar e header — `UserMenu` e `ThemeToggle` saem do header e passam para o rodapé da sidebar, e o header ganha título contextual da página. Por isso os dois primeiros itens são sequenciais, não paralelos.

### Sidebar conforme o handoff

- **Comportamento:** usuário navega pelo app com a sidebar na linguagem visual Industry — fundo escuro `--color-accent-900`, logo + wordmark do produto, os 7 itens de navegação do handoff, e um rodapé com a própria identidade (iniciais, nome, tipo de conta) que abre o menu de usuário e um botão de alternar tema ao lado.
- **Cobre:** nenhum RF isolado — chrome de todas as telas autenticadas (RF07, RF11–RF17 na UI).
- **Priority:** P0 · **Size:** M
- **Critérios de aceite:**
  - `Sidebar.tsx` sem nenhum token pré-Industry (`bg-white`, `border-slate-200`, `bg-brand-500`, `dark:bg-slate-900`, `rounded-md`) — fundo `--color-accent-900`, divisores em `color-mix` com branco, itens em `.lt-navitem` (classe já canônica no bundle), ícones com `strokeWidth={1.5}`, nenhum canto arredondado.
  - Cabeçalho da sidebar com o logo real (`/lumitrack-logo.svg`) + wordmark "Lumi/Track" com gradiente — mesmo tratamento que `BrandPanel.tsx` já aplica, reaproveitado em vez de reescrito (hoje a sidebar usa um ícone `Zap` genérico em quadro `bg-brand-500`, que é placeholder, não o logo).
  - `config/navigation.ts` alinhado ao handoff: passa a ter **7 itens** na ordem Painel · Propriedades · Relatórios · Simulações · Alertas · Distribuidoras · Segurança. Entram os labels do handoff ("Painel" no lugar de "Dashboard", "Simulações" no lugar de "Simulação") e o item **Segurança** (`/seguranca`, rota que já existe e hoje só é alcançável pelo dropdown do `UserMenu`).
  - Rodapé da sidebar com avatar de iniciais + nome + tipo de conta, reaproveitando `getDisplayInfo` (já existe, usado pelo `UserMenu`), e o `ThemeToggle` ao lado.
  - **Logout preservado (decisão do usuário, 2026-08-04):** o protótipo não tem logout em lugar nenhum — o bloco de identidade do rodapé vira o *trigger* do `UserMenu` atual, mantendo Perfil / Segurança / Sair. Sem isso o logout desapareceria da interface.
  - `AppShell.tsx` sem `bg-slate-50 dark:bg-slate-950` hardcodado — o background vem de `--color-bg` via `industry.css` (dívida herdada da Fase 5, ver fechamento acima).
  - Drawer mobile preservado por completo (off-canvas, backdrop, fechar por X / backdrop / Escape / troca de rota); `Sidebar.test.tsx` e `AppShell.test.tsx` verdes.
- **Depende de:** Componentes base Industry (Fase 1).
- **Risco/observações:** médio — é o chrome de **toda** tela autenticada, então um erro aqui é visível em todo o produto de uma vez (mesma classe de risco dos Componentes base da Fase 1). O ponto de atenção real não é visual: é a migração do `UserMenu`/`ThemeToggle` para cá, que precisa acontecer no mesmo passe do item de Header para não deixar controles duplicados nem órfãos em nenhum commit intermediário.

### Header conforme o handoff

- **Comportamento:** usuário vê no topo de cada tela o contexto de onde está (kicker + título da página), o estado da conexão de dados ao vivo, e acesso rápido aos alertas disparando e às notificações — sem os controles de tema/usuário, que passaram para a sidebar.
- **Cobre:** nenhum RF isolado; a superfície de alertas disparando serve RF15/RF16 na UI.
- **Priority:** P0 · **Size:** M
- **Critérios de aceite:**
  - `Header.tsx` sem tokens pré-Industry; sticky no topo com o fundo translúcido + `backdrop-filter: blur(8px)` e borda `--color-divider` do handoff.
  - Kicker + título contextual por rota, com **fonte única de verdade** — o par (kicker, título) vive junto da definição de navegação (`config/navigation.ts` ou módulo irmão), nunca duplicado dentro de cada página. Pares do handoff: Painel geral/Olá {nome} · Suas unidades/Propriedades · Análises/Relatórios · Cenários/Simulações · Monitoramento/Alertas · Catálogo/Distribuidoras · Conta/Segurança · Conta/Perfil.
  - **Badge "Dados ao vivo" ligado ao estado real do SSE (decisão do usuário, 2026-08-04):** reflete a conexão de `RealtimeContext`, não é pintado fixo. Um badge afirmando "ao vivo" com o stream caído é pior que não ter badge — mente sobre a frescura do dado que o usuário está lendo.
  - `WarningBadge` e `NotificationDropdown` (já existem) restilizados para `.lt-iconbtn` / `.lt-menu`, com o contador de alertas disparando na posição do handoff.
  - `ThemeToggle` e `UserMenu` **removidos** do header — passaram para o rodapé da sidebar no item anterior; nenhum controle duplicado.
  - Hamburger mobile preservado (o protótipo é desktop-only e não especifica mobile — `10-design-system.md` § comportamento não especificado: mantém-se o que já funciona).
  - `Header.test.tsx` e `AppShell.test.tsx` verdes; nenhuma quebra de `testid` usado pelos E2E existentes.
- **Depende de:** Sidebar conforme o handoff (mesmo passe para a movimentação de `UserMenu`/`ThemeToggle`).
- **Risco/observações:** médio — o título contextual é a única peça de lógica nova do item (mapeamento rota → texto, com rotas de detalhe aninhadas em `/propriedades/:id/...` que o handoff resolve com títulos variáveis). Resolver isso com um mapa único evita a armadilha óbvia: cada página setando o próprio título e divergindo com o tempo.

### "Sobre o projeto"

- **Comportamento:** usuário abre "Sobre o projeto" pela sidebar e lê o que é o LumiTrack, as motivações e os objetivos do projeto, com acesso ao repositório no GitHub.
- **Cobre:** sem RF formal — página institucional/de contexto, sem lógica de negócio.
- **Priority:** P1 · **Size:** S
- **Critérios de aceite:**
  - Rota `/sobre` nova + item correspondente na sidebar.
  - **Sem handoff no bundle** — decisão do usuário (2026-08-04): implementar **versão provisória** (regra de ausência do `10-design-system.md`), marcada com `// TODO(design): aguardando handoff — Sobre o projeto`, reaproveitando o padrão visual já estabelecido da página LGPD (faixa de cabeçalho com kicker + título, conteúdo em coluna, `.blueprint` para destaques) — nada inventado fora do vocabulário Industry que já existe no código.
  - Conteúdo em markdown canônico, mesmo padrão de `src/legal/*.md` renderizado por `LegalDocumentPage` — prosa fora do JSX, editável sem tocar em componente. Texto derivado de `01-descricao.md` (problema, usuário-alvo, motivação, objetivos).
  - Link para `https://github.com/viniciussartini/lumitrack` com o logo do GitHub, `target="_blank"` + `rel="noopener noreferrer"` + `aria-label`.
  - **Ícone do GitHub:** `lucide-react` (1.28) **não tem** ícone de marca — foram removidos da biblioteca. O logo é um SVG inline local, mesmo padrão que `iot-simulator/ui/src/components/ui/icons.tsx` já adotou na Fase 5. O mesmo componente é reaproveitado pelos itens da Fase 7 (Landing e painéis de autenticação) — construir aqui como compartilhável, não local desta página.
- **Depende de:** Sidebar conforme o handoff (o item de nav vem de lá).
- **Risco/observações:** baixo tecnicamente (página estática, sem estado nem API), mas é o **único item do roadmap sem handoff de design** — a versão provisória fica devendo até um export do Claude Design cobrir a tela, e a `auditoria-qualidade` vai reportar o `TODO(design)` até lá. Isso é intencional, não esquecimento.

**Fechamento (2026-08-04):** entregue nas 3 sub-issues planejadas (#135 Sidebar, #136 Header, #137 Sobre o projeto), épico #132, branch `feat/132-shell-app-autenticado` (renomeada no meio do trabalho — a implementação de #135/#136 começou por engano em `feat/135-sidebar-industry`, nomeada pra uma sub-issue em vez do épico; a branch certa foi criada, os commits migrados, e a antiga apagada local e remotamente antes de #137). Um commit de correção adicional (`4a31945`) fecha a fase, fora das 3 sub-issues originais. Nenhuma redução de escopo — um achado durante #136 **expandiu** o escopo pontualmente, com aprovação do usuário:

- **Achado que expandiu o escopo (#136):** o handoff usa `<h1>` para o título do Header, mas 5 páginas (`DashboardPage`, `PropertiesPage`, `DistributorsPage`, `AlertsPage`, `SecurityPage`) já renderizavam seu próprio kicker+`<h1>` local com o **mesmo texto** — resíduo de antes do Header ganhar título contextual (`PropertiesPage.tsx` chegou a comentar isso no código: "AppShell ainda não tem um slot de título compartilhado"). Dois `<h1>` idênticos na mesma tela quebrava `getByRole("heading", {level:1})` em vários E2E (`distributors.spec.ts`, `properties.spec.ts`, `alerts.spec.ts`) e duplicava a heading landmark para leitor de tela. Perguntado ao usuário durante a execução: removidos os kicker+h1 redundantes das 5 páginas — o Header passou a ser a única fonte do título. `ReportsPage.tsx` e `PlaceholderPage.tsx` (usado só por `SimulationPage`) tinham o mesmo problema com h1 pré-Industry — removido também, resto das duas páginas **intocado** (nenhuma tem handoff Industry ainda, fora do escopo desta fase).
- **Adaptação registrada em #137 (não seguiu a issue ao pé da letra):** a issue sugeria reaproveitar "o padrão visual da página LGPD" (kicker+título local) para "Sobre o projeto". Como `/sobre` fica **dentro** do `AppShell` — o Header já mostra o título contextual dela —, reproduzir um kicker+h1 local reabriria o mesmo bug do achado acima. A página LGPD precisa do próprio cabeçalho porque fica **fora** do `AppShell` (sem chrome compartilhado); não é o caso aqui.
- **Reaproveitamento em vez de duplicação (#137):** `LegalDocumentPage.tsx` tinha ~40 linhas de mapeamento markdown→Industry e a função `slugify` só para si — promovidos para módulos compartilhados (`lib/markdown/industryMarkdownComponents.tsx`, `lib/slugify.ts`) quando `AboutPage` virou o 2º consumidor real, mesmo critério de promoção já usado em `getDisplayInfo`/`useLiveMeterReading`.
- **Bug achado pelo usuário testando manualmente, pós-#136:** o ícone de alertas do Header (`WarningBadge`) sumia inteiro quando não havia alerta disparando — o componente preservou por engano o `return null` da versão antiga (Fase 5) ao virar `.lt-iconbtn`; no handoff o ícone é chrome persistente (como o sino de notificações), só o contador é condicional. Corrigido em commit separado, incluindo o E2E que documentava o comportamento antigo como intencional.
- **Estado final:** nenhum token pré-Industry restante em `Sidebar.tsx`/`Header.tsx`/`AppShell.tsx`; `UserMenu`/`ThemeToggle` vivem só no rodapé da Sidebar; Sidebar com os 7 itens do handoff + Segurança, logout preservado; título contextual de fonte única (`config/pageTitles.ts`); drawer mobile intacto; `npm run build`/`lint`/`test` do frontend limpos (67/67 arquivos · 583/583 testes); `.claude/log/CHANGELOG.md` com uma entrada por sub-issue fechada mais o fix.

## Fase 7 — Consistência das telas públicas

> Escopo: quatro ajustes independentes e pequenos nas telas que um visitante não autenticado vê (autenticação, Landing, LGPD). Nenhum deles muda comportamento de negócio; são consistência visual, crédito de autoria e navegação.
>
> **Divergências do handoff assumidas nesta fase** (decisões do usuário, 2026-08-04 — o design não é "corrigido silenciosamente", a divergência fica registrada aqui e no changelog): (1) o logo do GitHub não existe em nenhum `.dc.html` do bundle; (2) o handoff LGPD tem um link "← Voltar ao site" que sai por decisão explícita. O botão "Entrar" da nav do handoff LGPD segue **fora de escopo** — nunca foi implementado e não foi pedido.

### Painel de marca com largura fixa nas telas de autenticação

- **Comportamento:** usuário navegando entre Login → Registro → Esqueci minha senha → Redefinir senha não vê o painel escuro da esquerda mudar de largura entre uma tela e outra.
- **Cobre:** RF01, RF02, RF05 (consistência visual do fluxo; nenhum comportamento novo).
- **Priority:** P1 · **Size:** XS
- **Critérios de aceite:** `LoginPage` usa hoje `lg:grid-cols-[1.05fr_1fr]` enquanto `RegisterPage`, `ForgotPasswordPage` e `ResetPasswordPage` usam `.95fr_1fr` — daí o "pulo" visual na troca de tela. A largura passa a ser **uma só**, definida em um lugar só (dentro do próprio `BrandPanel` ou numa constante de layout que as 4 páginas consomem), nunca repetida como classe em cada página; conferir antes nos 3 `.dc.html` de autenticação qual largura o handoff especifica e adotá-la se as três concordarem — se o próprio handoff divergir entre telas, vence a largura fixa (decisão do usuário) e a divergência é registrada.
- **Depende de:** —
- **Risco/observações:** baixo — mudança de uma medida em 4 arquivos. O valor real do item não é a largura em si, é eliminar a duplicação que permitiu a divergência aparecer.

### Bloco de potência ao vivo do Login com mock variável

- **Comportamento:** o card "potência agora" no painel de marca do Login anima os números como já acontece na Landing, em vez de exibir um valor congelado.
- **Cobre:** sem RF — elemento ilustrativo (não há sessão nem medidor nesta tela; o número é mock, não dado real).
- **Priority:** P2 · **Size:** XS
- **Critérios de aceite:** o `useLiveTicker` (hoje declarado dentro de `LandingPage.tsx`) é extraído para um módulo compartilhado e consumido pelas duas telas — o random-walk não pode ser duplicado; o `extra` do `BrandPanel` no `LoginPage` passa a consumi-lo; permanece explícito no código (comentário) que o número é ilustrativo e não vem de medidor, para ninguém confundir com dado real numa tela pré-autenticação.
- **Depende de:** —
- **Risco/observações:** baixo. Ponto de atenção de acessibilidade: número em movimento contínuo numa tela de formulário — avaliar na execução se vale respeitar `prefers-reduced-motion` (a Landing tem o mesmo efeito e hoje não respeita; se for adotado, adotar nas duas para não divergirem).

### Logo do GitHub na Landing e nos painéis de autenticação

- **Comportamento:** visitante chega ao repositório do projeto a partir da Landing e das telas de autenticação.
- **Cobre:** sem RF — atribuição/transparência do projeto.
- **Priority:** P1 · **Size:** S
- **Critérios de aceite:**
  - **Landing:** logo do GitHub logo abaixo da linha "Monitoramento de energia elétrica para pessoas físicas e jurídicas do Brasil." (rodapé, `LandingPage.tsx` ~linha 588).
  - **Login, Registro e Recuperação de senha:** o rodapé do `BrandPanel` passa a ter três posições — © à esquerda, o crédito "Logo desenhada por Magnific" **centralizado**, e o logo do GitHub à direita. Hoje são dois blocos com `justify-between`.
  - Todos os links: `target="_blank"`, `rel="noopener noreferrer"` e `aria-label` descritivo (ícone sem texto precisa de nome acessível).
  - Reaproveita o componente de ícone do GitHub criado na Fase 6 ("Sobre o projeto") — um SVG inline compartilhado, não três cópias.
- **Depende de:** o componente de ícone do GitHub da Fase 6 (se a Fase 7 começar antes, criá-lo aqui e reaproveitar lá — a dependência é do artefato, não da ordem).
- **Risco/observações:** baixo. Único cuidado é o rodapé de 3 colunas do `BrandPanel` não quebrar em larguras intermediárias — o painel já é `hidden lg:flex`, então o intervalo a verificar é estreito.

### Páginas LGPD — logo no cabeçalho e remoção do "Voltar ao cadastro"

- **Comportamento:** usuário que abre a Política de Privacidade ou os Termos de Uso (sempre em aba nova) vê o logo real do LumiTrack no topo e não encontra mais um link de voltar que não leva a lugar nenhum.
- **Cobre:** RF01 (consentimento no cadastro), `09-conformidade-legal.md`.
- **Priority:** P1 · **Size:** XS
- **Critérios de aceite:**
  - `LegalDocumentPage.tsx` troca o ícone genérico `Zap` em quadro pelo logo real (`/lumitrack-logo.svg`) + wordmark "Lumi/Track" com gradiente — exatamente o que o handoff `LumiTrack LGPD.dc.html` especifica na nav (linhas 36–40) e o que `BrandPanel.tsx` já implementa.
  - Link "← Voltar ao cadastro" **removido**: as páginas já abrem em aba nova a partir do Registro (`target="_blank"`, confirmado em `RegisterPage.tsx`), então o botão de volta não tem para onde voltar — fechar a aba é a ação natural.
  - Os links para `/privacidade` e `/termos` no rodapé da **Landing** passam a abrir em aba nova também, para o comportamento não depender da origem (hoje só o Registro abre em aba nova).
  - As abas Política de Privacidade / Termos de Uso continuam navegando entre si; `PrivacyPolicyPage.test.tsx` e `TermsOfUsePage.test.tsx` verdes — ajustar qualquer asserção que dependa do link removido.
- **Depende de:** —
- **Risco/observações:** baixo — telas estáticas, sem estado. Verificar se algum E2E navega para as páginas legais pelo link de volta antes de removê-lo.

**Fechamento (2026-08-04):** entregue nos 4 itens planejados (#138 largura fixa do painel, #139 potência ao vivo do Login, #140 logo do GitHub, #141 páginas LGPD), épico #133, branch `feat/133-consistencia-telas-publicas`. Nenhuma redução de escopo; um achado durante #141 ajustou a implementação sugerida pela issue sem mudar o comportamento entregue:

- **Handoff também diverge em #138:** conferido nos 3 `.dc.html` de autenticação — `LumiTrack Login.dc.html` usa `minmax(0,1.05fr)`, enquanto `LumiTrack Registro.dc.html` e `LumiTrack Recuperar Senha.dc.html` usam `minmax(0,.95fr)`. Como o próprio handoff não concorda entre as 3 telas, aplicada a decisão do usuário: padronizar em `.95fr` (maioria do handoff — 2 de 3 — e do código já existente — 3 de 4 arquivos). `AUTH_LAYOUT_GRID_CLASS` exportado de `BrandPanel.tsx` e consumido pelas 4 páginas, eliminando a duplicação que permitiu a divergência aparecer.
- **Reaproveitamento em vez de duplicação em #139:** `useLiveTicker` — antes só dentro de `LandingPage.tsx` — extraído para `hooks/useLiveTicker.ts` (mesmo padrão de `useLiveMeterReading.ts`/`usePowerHistory.ts`) quando o Login virou o 2º consumidor real. `prefers-reduced-motion` avaliado e **não adotado** nesta fase — a Landing já tem o mesmo efeito hoje sem respeitar a preferência, e mudar isso é uma melhoria de acessibilidade maior que o escopo do item; registrado para não se perder, sem virar item de `07-decisoes-em-aberto.md` por ser de baixo risco/escopo pontual.
- **Reaproveitamento em vez de duplicação em #140:** `GITHUB_REPO_URL` — antes uma constante local em `AboutPage.tsx` — promovido para `GitHubIcon.tsx` (mesmo módulo do ícone, já que os dois sempre andam juntos) quando a Landing e o `BrandPanel` viraram o 2º e 3º consumidores reais. Rodapé do `BrandPanel` migrado de `flex justify-between` (2 blocos) para `grid grid-cols-[1fr_auto_1fr]` para centralização real do crédito Magnific — um `justify-between` de 3 itens centraliza por espaçamento, não por posição.
- **Achado que ajustou a implementação sugerida em #141, sem mudar o comportamento entregue:** a issue sugeria reaproveitar `LumiTrackWordmark` "tal como está" no cabeçalho das páginas legais. O componente é estilizado só para fundo escuro (`--color-accent-900` do `BrandPanel`/Sidebar — texto claro, `brightness-125` na imagem); aplicado sem alteração numa página de fundo claro, o texto "Lumi" ficaria quase invisível. Adicionado `variant?: "dark" | "light"` ao `LumiTrackWordmark` (mesmo padrão de extensão já usado em `UserMenu`, `variant="header"|"sidebar"`, Fase 6) — o `"light"` replica o gradiente que a nav do handoff LGPD especifica, já usado em `LandingNav`.
- **Estado final:** painel de marca com largura única nas 4 telas de autenticação; card "Ao vivo" do Login animado como a Landing; logo do GitHub acessível na Landing e nos 3 painéis de autenticação; páginas LGPD com logo real e sem link de volta órfão; `npm run build`/`lint`/`test` do frontend limpos (70/70 arquivos · 599/599 testes); `.claude/log/CHANGELOG.md` com uma entrada por sub-issue fechada.

## Fase 8 — Bandeira tarifária a partir da fonte oficial

> **Situação atual:** a bandeira vigente é um registro singleton no banco (`TariffFlagConfig`, id fixo = 1) com `currentFlag` e os quatro acréscimos em R$/100 kWh (`greenPer100Kwh`, `yellowPer100Kwh`, `redP1Per100Kwh`, `redP2Per100Kwh`), lido por `GET /api/tariff-flag` (autenticado) e atualizado **manualmente** por `PUT /api/tariff-flag` (`requireRole("ADMIN")`). Como a bandeira muda mensalmente por decisão da ANEEL, isso é um dado externo mantido à mão — o valor de negócio do item é remover essa intervenção manual, e o risco é passar a depender de um terceiro no caminho do cálculo de custo (RF13).

### Spike — viabilidade da fonte oficial (investigação + ADR)

- **Comportamento:** nenhum comportamento de usuário — investigação. A entrega é uma decisão registrada: se e como o LumiTrack passa a obter a bandeira vigente de uma fonte oficial.
- **Cobre:** RF08 (bandeira tarifária vigente — hoje atendido por atualização manual).
- **Priority:** P1 · **Size:** S
- **Critérios de aceite:**
  - Levantar os candidatos reais de fonte (Portal Brasileiro de Dados Abertos / dados abertos da ANEEL, publicação institucional da ANEEL, dados publicados pelas distribuidoras) e avaliar cada um contra: existência de endpoint estável e documentado; formato e cadência de atualização (a bandeira é mensal — a fonte precisa refletir a mudança em tempo útil); licença e termos de uso dos dados; necessidade de credencial/cadastro; e se a fonte entrega **as 4 modalidades com o valor por 100 kWh**, que é exatamente a forma como o `TariffFlagConfig` já modela o dado (se entregar só a bandeira vigente sem os valores, a integração cobre metade do problema — isso muda o escopo do item seguinte).
  - ADR em `.claude/docs/adr/` registrando a decisão, **inclusive se for negativa** — "não viável, permanece o `PUT` manual do ADMIN" é uma decisão válida e vale ser registrada com o porquê, para não ser reinvestigada daqui a seis meses.
  - **Nenhum código de produção alterado neste item.**
- **Depende de:** —
- **Risco/observações:** médio — o resultado pode ser "não viável", e é justamente por isso que a investigação vem separada e antes da integração (regra de risco/incerteza primeiro do kit). Cuidado explícito: não confundir a bandeira tarifária (ANEEL, nacional, mensal) com as tarifas TUSD/TE por distribuidora, que já são tratadas em outro lugar do domínio.

### Sincronização automática da bandeira vigente (condicional ao spike)

- **Comportamento:** a bandeira exibida no Painel e usada no cálculo de custo reflete a fonte oficial sem ninguém precisar atualizar manualmente.
- **Cobre:** RF08, e protege a precisão de RF13 (custo).
- **Priority:** P2 · **Size:** M
- **Critérios de aceite:**
  - **Só é executado se o spike concluir pela viabilidade** — se o ADR for negativo, este item é cancelado com a justificativa registrada, não fica pendurado no roadmap.
  - Cliente HTTP da fonte oficial isolado num adapter de infraestrutura; o domínio não importa detalhe de integração (`06-code-quality-standards.md`, direção de dependência).
  - Sincronização com timeout e retry, e **falha fechada**: indisponibilidade ou resposta inesperada da fonte **mantém o último valor conhecido** e registra o erro — nunca zera, nunca adivinha, nunca deixa o cálculo de custo do usuário sem bandeira. Resposta da fonte validada com Zod na borda, como todo input externo.
  - Registro de auditoria de cada troca de bandeira (valor anterior, novo, origem manual ou automática, quando) — hoje só existe o caminho manual, protegido por `requireRole("ADMIN")`.
  - `PUT /api/tariff-flag` preservado como override manual/fallback — a automação não pode ser o único caminho para corrigir um valor errado.
  - Testes com a resposta da fonte mockada, cobrindo explicitamente o caminho de indisponibilidade e o de payload inválido (não só o happy path).
- **Depende de:** Spike — viabilidade da fonte oficial.
- **Risco/observações:** médio-alto — seria a **primeira dependência externa de terceiro em runtime no backend**. Entra na superfície de risco de integração externa do `05-security-standards.md` (validar tudo que vem de fora, falhar fechado) e cria um ponto de falha novo num caminho que hoje é 100% interno e determinístico. O modo de falha a evitar é o silencioso: bandeira desatualizada sem ninguém perceber é pior que sincronização quebrada com erro visível.

**Fechamento (2026-08-05):** entregue nas 2 sub-issues planejadas (#142 spike + ADR, #143 sincronização automática), épico #134, branch `docs/134-bandeira-tarifaria-oficial`. O spike concluiu por **viabilidade** (`ADR-0007`), então #143 seguiu como planejado — não foi cancelada. Nenhuma redução de escopo; a fase absorveu descobertas que refinaram a implementação e uma expansão de escopo pedida pelo usuário depois de #143 fechada:

- **Fonte real identificada e verificada ponta a ponta:** Portal de Dados Abertos da própria ANEEL (`dadosabertos.aneel.gov.br`, dataset "Bandeiras Tarifárias", API DataStore CKAN pública, sem credencial) — não o portal genérico `dados.gov.br`, que não tem esse dataset. O adapter foi testado contra a API real (não só mockada) durante a implementação e bateu exatamente com os valores já semeados em `seed.ts`.
- **Achado que refinou #143 em relação ao spike:** nenhum dos 2 recursos do dataset sozinho cobre "as 4 modalidades com valor por 100 kWh" — precisou combinar "Acionamento" (mensal, dá a bandeira ativa) com "Adicional" (por Resolução Homologatória, dá os 3 valores não-verde); Verde é sempre 0. Unidade da fonte é R$/MWh, não R$/100kWh (conversão ÷10).
- **Decisão de design registrada em #143:** o histórico de troca de bandeira (`TariffFlagHistory`, tabela nova) não reaproveita o `AuditLog` de segurança/LGPD existente — aquela tabela tem uma regra documentada explícita de nunca guardar o valor de um campo alterado (pensada para PII), e o critério de aceite de #143 pedia exatamente "valor anterior, novo". Achado durante a implementação: o `PUT` manual nunca tinha rastro nenhum até então — corrigido junto, não só a sincronização automática.
- **Expansão de escopo pedida pelo usuário, fora das 2 sub-issues originais:** depois de #143 fechada, a bandeira vigente real passou a ser exibida também na Landing e no Login (antes um mock fixo "Verde"). Isso exigiu tornar `GET /api/tariff-flag` público — decisão perguntada ao usuário antes de implementar (nenhuma rota do backend era pública até então) — e uma variante de cores para o fundo escuro do painel de marca do Login (mesmo tipo de achado do `LumiTrackWordmark` na Fase 7: tokens de cor do Painel não serviam para fundo escuro).
- **Estado final:** `TariffFlagConfig` sincronizado automaticamente a cada 24h a partir da ANEEL, com falha fechada (mantém último valor conhecido) e `PUT` manual preservado como override; histórico de toda troca (manual ou automática) registrado; bandeira real visível também em Landing/Login; `npm run build`/`lint`/`test` limpos nos dois pacotes (frontend 70/70 arquivos · 605/605 testes; backend 123/123 arquivos · 1453/1453 testes); `.claude/log/CHANGELOG.md` com uma entrada por sub-issue/expansão.

## Fase 9 — Migração ethernet-ip v1→v2 no backend (dívida técnica)

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

**Fechamento (2026-08-05):** entregue na única issue planejada (#127), sem épico (item isolado, um épico contendo uma única sub-issue não agregaria nada — decisão já registrada no replanejamento de 2026-08-04), branch `chore/127-migracao-ethernet-ip-v2`. Todos os critérios de aceite atendidos sem redução de escopo:

- **API real verificada, não migrada às cegas pelo changelog do PR:** o pacote `ethernet-ip@2.0.0` foi instalado num diretório à parte e os `.d.ts` nativos publicados foram lidos diretamente — a v2 ganhou tipos TypeScript nativos, então a superfície documentada abaixo é a real, não inferida.
- **Causa raiz do CI verde mentiroso do PR #51 corrigida na origem:** `EthernetIpConnection` usava `import()` dinâmico, então o TypeScript nunca via a divergência entre a declaração de módulo manual (`ethernet-ip.d.ts`, ainda descrevendo a API v1 — `Controller`/`readTag`) e o pacote real. A declaração manual foi removida (a v2 tem tipos nativos) e a classe reescrita para `PLC`/`connect(host, {slot})`/`read`/`disconnect` assíncrono, agora tipada de verdade em vez de `unknown` + cast.
- **Lacuna de teste fechada:** não havia nenhum teste em `protocols/` até então. O teste novo (`ModbusTcpConnection.test.ts`) exercita o `import("ethernet-ip")` **real**, não mockado — conecta contra a porta fixa da lib (`44818`) sem nada escutando e afirma que o erro recebido é uma recusa de conexão, não um `TypeError` de API incompatível. É exatamente a classe de regressão que passou pelo CI no PR #51 apesar de quebrar em runtime.
- **Decisão de escopo registrada:** avaliado usar `MockTransport` (disponível na v2 para injeção de dependência) em vez de conectar contra uma porta fechada; descartado por exigir reconstruir bytes de protocolo CIP reais sem ganho de cobertura adicional para o que a issue pedia.
- **PR #51 (dependabot) superado, não mesclado diretamente:** o bump de versão que ele propunha já está incluído nesta branch (junto com a migração de código); a descrição do PR desta issue usa `closes #51` para fechá-lo automaticamente no merge, em vez de mesclá-lo à parte.
- **Estado final:** `EthernetIpConnection` sobre `ethernet-ip` 2.0.0, sem regressão observável na ingestão via EtherNet/IP (RF09, RF10); `npm run build`/`lint`/`test` do backend limpos (125/125 arquivos · 1457/1457 testes, suíte completa); `npm audit --omit=dev` sem vulnerabilidades. `npx dependency-cruiser src` não pôde rodar — sem config no repo, gap pré-existente, não introduzido por esta fase.

Com a Fase 9 concluída, o escopo original do roadmap (migração Industry + telas do handoff + dívida técnica pontual) fechou. As Fases 10–18 vêm das quatro auditorias de 2026-08-05.

---

## Remediação das auditorias (Fases 10–18)

> **Origem:** os quatro laudos de 2026-08-05 em `.claude/docs/` — `2026-08-05-seguranca-audit.md` (22 achados), `2026-08-05-conformidade-audit.md` (19), `2026-08-05-qualidade-audit.md` (38) e `2026-08-05-desempenho-audit.md` (26). **105 achados brutos, ~95 distintos** após deduplicação: as auditorias se sobrepõem em 10 pontos, sempre pelo mesmo código visto de ângulos diferentes.
>
> **Nenhuma destas fases entrega RF novo.** É endurecimento do que já existe. Por isso a regra de fatiamento vertical do kit cede aqui — como já cedeu na Fundação da Fase 1: um achado de segurança não tem "comportamento de usuário" para atravessar banco→API→UI. O critério de agrupamento passa a ser **o gate que o item destrava** (deploy público, operar com titular real, impedir regressão) em vez da fatia de produto.
>
> **Verificação por amostragem antes de planejar** (laudo de subagente não vira fase sem conferência): `split("")` confirmado em `ModbusTcpConnection.ts:626` contra `split("\n")` na `:525`; zero ocorrências de `redact` em `backend/src`; e nenhum `@@index` para `Property.userId`, `Area.propertyId`, `Device.areaId` ou `Alert.userId` no `schema.prisma`. Os três conferem.

## Sobreposição entre as auditorias (deduplicação aplicada)

Cada linha abaixo é **um item de trabalho**, não quatro — auditorias diferentes chegaram ao mesmo código:

| Item | Segurança | Conformidade | Qualidade | Desempenho |
|---|---|---|---|---|
| pino sem `redact` + PII no log | CRÍTICA + MÉDIA | ALTO | — | — |
| `Rs485Connection` com `split("")` | — | — | Q-01 (Alto) | A-05 (Alto) |
| `Meter.extra.password` em claro | MÉDIA | MÉDIO | — | — |
| `iot-simulator` fora do CI/Dependabot | MÉDIA | — | Q-03 (Alto) | — |
| `dependency-cruiser` ausente | BAIXA | — | Q-02 (Alto) | — |
| Dependência morta `profibus` | — | — | Q-24 (Médio) | B-05 (Baixo) |
| Retenção de `MeterReading` | — | ALTO | — | M-03 (Médio) |
| Credenciais demo no bundle | MÉDIA | BAIXO | — | — |
| Export DSAR incompleto / sem limite | — | ALTO | — | M-12 (Médio) |
| Drift de documentação viva | — | BAIXO | Q-21/22/23/35 | — |

## Fase 10 — Bloqueadores de segurança

> **Gate que esta fase destrava:** deploy público. Os cinco itens são o bloco "P0 — bloqueio antes de qualquer deploy público" do laudo de segurança, na íntegra. Todos são backend, todos exigem teste que **falhe se o controle for removido** (DoD do `05-security-standards.md`).
>
> Postura geral registrada pelo laudo, para calibrar: o backend está **acima da média** — autorização por posse consistente e testada (62 asserções de 403 em 12 suítes), Prisma 100% parametrizado, AES-256-GCM com três chaves compartimentadas, CSRF double-submit, rotação de refresh com detecção de reuso. Os achados se concentram em observabilidade e no ciclo de vida da sessão, não na base.

### Redação de dado sensível no log estruturado

- **Comportamento:** nenhuma linha de log da aplicação contém token de sessão, refresh token, Bearer, senha ou e-mail em texto claro — em nenhum ambiente.
- **Cobre:** OWASP A09; LGPD Art. 6º III/VII e Art. 46; princípio inegociável "PII nunca em log" do `CLAUDE.md`.
- **Priority:** P0 · **Size:** S
- **Critérios de aceite:**
  - `redact` configurado no pino (`shared/logger/logger.ts`) e/ou serializers no `pino-http` (`app.ts:109-117`) cobrindo no mínimo: `req.headers.cookie`, `req.headers.authorization`, `res.headers["set-cookie"]`, `req.headers["x-csrf-token"]`, `req.headers["x-refresh-csrf-token"]`, `audit.metadata.attemptedEmail`, `*.password`, `*.newPassword`, `*.token`, `*.mfaToken`, `*.secret`, `*.cpf`, `*.cnpj` — com `censor: "[REDACTED]"`.
  - `AuditService.record` (`shared/audit/audit.service.ts:14`) deixa de espelhar a entrada inteira no log de aplicação — loga só resumo não-identificante (`action`, `outcome`, `resourceType`, `userId`); `metadata`/`ipAddress`/`userAgent` continuam **só** na tabela `audit_logs`, onde são legítimos.
  - `attemptedEmail` deixa de ser gravado em claro: substituído pelo blind index HMAC que já existe (`shared/crypto/blindIndex.ts`), preservando a correlação de tentativas contra o mesmo alvo sem reter e-mail de quem **não é titular** (hoje retido por 730 dias sem base legal).
  - **Teste que falha se o controle for removido:** requisição autenticada com o stream do pino capturado, assertando que o valor do cookie de sessão **não** aparece na saída.
- **Depende de:** —
- **Risco/observações:** baixo tecnicamente, mas é o único achado **Crítico** de segurança e simultaneamente **Alto** de conformidade — a única aparição dupla nesse nível. A gravidade não está na dificuldade: está em que hoje qualquer pessoa com acesso ao log assume qualquer sessão, e o plano do `RUNBOOK_INCIDENTES.md` § 1.1 é justamente exportar esse log para um agregador de terceiro. Fazer **antes** de decidir observabilidade, não depois.

### Allowlist de destino nas conexões de saída do medidor (SSRF)

- **Comportamento:** um medidor só pode ser criado ou atualizado apontando para um destino permitido; endereços internos são recusados na validação, antes de qualquer socket abrir.
- **Cobre:** OWASP A01 (SSRF). Protege RF09/RF10 sem alterar o comportamento legítimo.
- **Priority:** P0 · **Size:** M
- **Critérios de aceite:**
  - Validador compartilhado (ex.: `shared/security/outboundHost.ts`) aplicado no `meter.service` **antes de persistir** — não no adaptador, para que a recusa seja um 422 explicável e não uma conexão que falha em silêncio.
  - **Negar por padrão:** loopback, link-local (`169.254.0.0/16` — metadata de cloud — e `fe80::/10`), RFC1918/ULA e multicast, com resolução do hostname (não só checagem textual, senão um DNS que resolve para `127.0.0.1` passa).
  - Allowlist configurável por env (`IOT_ALLOWED_HOSTS`, hosts e/ou CIDRs) para o caso legítimo de medidor em rede local — que é o caso de uso normal do produto e **não pode ser quebrado** por esta correção.
  - Faixa de portas restrita.
  - Teste que falhe se a allowlist for removida, cobrindo `POST /api/meters` **e** `PUT /api/meters/:id` (o `restart` em `meter.controller.ts:94` é o segundo caminho, hoje igualmente aberto).
- **Depende de:** —
- **Risco/observações:** médio — é o item de maior risco de **regressão funcional** da fase: apertar demais quebra o uso legítimo (medidor em `192.168.x.x` na casa do usuário é o caso normal, não a exceção). A allowlist por env existe exatamente para isso. Decidir o default com cuidado e documentar no `.env.example`.

### Hash do token de redefinição de senha

- **Comportamento:** nenhuma mudança observável pelo usuário — o link de reset continua funcionando; o que muda é que um dump do banco deixa de entregar tomada de conta.
- **Cobre:** OWASP A04.
- **Priority:** P0 · **Size:** XS
- **Critérios de aceite:** `hashToken(resetToken)` aplicado na escrita (`createPasswordReset`) e na leitura (`findPasswordReset`), com o valor puro saindo **apenas** no e-mail — exatamente o padrão que `AuthToken` e `RefreshToken` já usam (`auth.service.ts:386-391`, `:406-413`); migração invalida os resets pendentes; teste cobrindo o fluxo completo (pedir reset → usar o token do e-mail → senha trocada) e verificando que a coluna do banco **não** contém o valor enviado.
- **Depende de:** —
- **Risco/observações:** baixo — o padrão já existe no mesmo arquivo, é aplicá-lo à terceira tabela que ficou de fora. A inconsistência interna é o que torna o achado indefensável: o código já documenta *"em caso de vazamento do dump do banco, o hash não permite reconstruir um token de sessão válido"* — e não fez isso justamente no token de recuperação de conta.

### Revogação de sessões e refresh tokens na redefinição de senha

- **Comportamento:** ao concluir "esqueci minha senha", todas as sessões anteriores do usuário deixam de funcionar — em todos os canais e dispositivos.
- **Cobre:** OWASP A07.
- **Priority:** P0 · **Size:** XS
- **Critérios de aceite:** `resetPassword` (`auth.service.ts:250-282`) revoga todos os `AuthToken` e `RefreshToken` do usuário na **mesma transação** da troca de senha (`revokeAllRefreshTokensForUser` já existe em `auth.repository.ts:258-263`); teste de integração: logar no canal MOBILE, fazer o reset, assertar **401** no Bearer antigo.
- **Depende de:** —
- **Risco/observações:** baixo em esforço, alto em consequência. O cenário-alvo do "esqueci minha senha" é recuperar uma conta comprometida — e hoje o atacante sobrevive ao reset com Bearer válido por até **90 dias** (`MOBILE_TOKEN_EXPIRES_IN`). A correção é de poucas linhas; o valor é desproporcional ao tamanho.

### Step-up na re-inscrição de MFA e purga dos backup codes antigos

- **Comportamento:** trocar o segundo fator de uma conta que já tem MFA passa a exigir prova do fator vigente — uma sessão sozinha não basta.
- **Cobre:** OWASP A07.
- **Priority:** P0 · **Size:** S
- **Critérios de aceite:**
  - Em `verifyMfaSetup` (`auth.service.ts:152-177`): se `user.mfaEnabled === true`, exigir senha atual **e** código válido do fator vigente (reaproveitar `verifyMfaCode`), ou recusar e obrigar o caminho `disable` → `setup`.
  - `createBackupCodes` apaga os `MfaBackupCode` anteriores antes de criar o novo lote — hoje usa `createMany` sem limpeza (`auth.repository.ts:177-181`), então os códigos da configuração antiga **continuam válidos** depois da reinscrição.
  - Teste que falhe se o step-up for removido.
- **Depende de:** —
- **Risco/observações:** baixo. O que torna o achado forte é a assimetria documentada no próprio código: `disableMfa` já exige senha + código, com o comentário *"uma sessão sozinha (ex.: roubada via XSS) não deve ser suficiente para desligar o segundo fator"* — mas **reinscrever** dá o mesmo resultado prático, com o bônus de expulsar o dono legítimo, e não exige nada.

**Fechamento (2026-08-06):** entregue nas 5 sub-issues planejadas (#149–#153), épico #148, branch `fix/148-bloqueadores-seguranca`. Nenhuma redução de escopo — as 5 issues fecharam exatamente como descritas no laudo de segurança, sem achado extra fora do previsto (diferente de fases anteriores como a 3 e a 6). Ordem de execução seguiu a prioridade do próprio laudo (#149 Crítico primeiro) e a recomendação de agrupar #151/#152 na mesma branch por mexerem no mesmo arquivo/fluxo (`resetPassword`), como o roadmap já sinalizava.

- **#149 — Redação de log:** `redact` no pino cobrindo cookie/authorization/CSRF/campos sensíveis; `AuditService.record` parou de espelhar a entrada inteira no log de aplicação; `attemptedEmail` virou blind index HMAC (reaproveitado de `blindIndex.ts`, sem chave nova).
- **#150 — SSRF:** validador `shared/security/outboundHost.ts` (novo) aplicado no `MeterService` antes de persistir — nega por padrão qualquer endereço não-unicast público, com resolução real de DNS (não checagem textual) e `IOT_ALLOWED_HOSTS` como escape hatch para rede local. `ipaddr.js` promovida de dependência transitiva para direta.
- **#151 — Hash do token de reset:** `hashToken()` (já usado por `AuthToken`/`RefreshToken`) aplicado a `PasswordReset.token`; migração de dados invalidou os resets pendentes gerados em claro.
- **#152 — Revogação de sessão no reset:** novo `resetPasswordAndRevokeSessions` — troca de senha, marca reset usado e revoga todo `AuthToken`/`RefreshToken` do usuário numa única transação Prisma.
- **#153 — Step-up de MFA:** `verifyMfaSetup` recusa reinscrição enquanto `mfaEnabled === true` (obriga `disable` → `setup`, reaproveitando o fluxo já hardened); `createBackupCodes` passou a purgar o lote anterior antes de criar o novo, na mesma transação.

**Estado final:** todo controle tem teste que falha se for removido (DoD do `05-security-standards.md` cumprido nas 5 issues); `npm run build`/`lint`/`test -- --run` do backend limpos (129/129 arquivos · 1547/1547 testes) e `npm audit --omit=dev` sem vulnerabilidade a cada sub-issue fechada; `.claude/log/CHANGELOG.md` com uma entrada por sub-issue. PR ainda não aberto no momento desta atualização do roadmap.

## Fase 11 — Bloqueadores de conformidade LGPD

> **Gate que esta fase destrava:** operar com titulares reais. O veredito do laudo é explícito: *"o sistema não está apto a operar com titulares reais enquanto os dois achados Críticos existirem"*.
>
> **Natureza diferente das outras fases:** três dos quatro itens são **documentais/contratuais**, não código. Isso é uma característica do achado, não uma fraqueza do plano — o laudo observa que a base técnica de proteção de dados está acima da média para o porte (cifra por categoria com chaves segregadas, trilha de auditoria desenhada com a LGPD em mente, expurgo agendado, consentimento versionado); o que falta é a camada de governança, que é a primeira que a ANPD pede em fiscalização.
>
> **Ressalva do laudo, repassada aqui:** não é parecer jurídico. Os dois Críticos e a atribuição de base legal (Fase 14) devem passar por advogado ou encarregado antes de serem considerados fechados — a escolha de base legal é decisão jurídica, não de engenharia.

### Canal de comunicação com o titular

- **Comportamento:** o titular encontra, no rodapé público e dentro do app, um endereço real para exercer os direitos do Art. 18 — inclusive os cinco que não são autoatendidos hoje.
- **Cobre:** Res. CD/ANPD 2/2022 Art. 11; LGPD Art. 18 §1º, Art. 41 §4º; Art. 6º VI (transparência).
- **Priority:** P0 · **Size:** S
- **Critérios de aceite:**
  - Endereço de privacidade definido (um alias basta, ex.: `privacidade@<domínio>`) e publicado no rodapé da Landing **e** no shell autenticado.
  - As **três** referências vagas em `privacy-policy.md` (§ 1, § 6, § 9) a um "e-mail do encarregado informado no rodapé da plataforma" substituídas pelo endereço literal — hoje o documento afirma que o canal existe e ele não existe, o que soma falha de transparência à falha de disponibilização.
  - Bloco "Exercer meus direitos" no card "Privacidade & dados" do Perfil (`ProfilePage.tsx`, `PrivacyDataCard`), com o canal e a lista dos direitos do Art. 18, marcando quais são autoatendidos e quais passam pelo canal.
  - Procedimento interno de atendimento documentado com o **prazo em dobro do pequeno porte** (30 dias).
- **Depende de:** você definir o endereço — é a única entrada externa, e sem ela o item não fecha.
- **Risco/observações:** baixo em esforço, e é o item de **melhor relação custo/risco removido de todo o roadmap**: o regime de pequeno porte dispensa o encarregado, mas não o canal. Hoje os direitos não automatizados são, na prática, inexercíveis.

### ROPA — registro das operações de tratamento

- **Comportamento:** nenhum — artefato de governança. Entrega `.claude/docs/ROPA.md`.
- **Cobre:** LGPD Art. 37 (exigível **mesmo** do agente de pequeno porte, em forma simplificada).
- **Priority:** P0 · **Size:** M
- **Critérios de aceite:** uma linha por operação já identificável no código — cadastro/autenticação (`users`), propriedades e endereço (`properties`), medição e consumo (`meters`, `meter_readings`), alertas (`alerts`, `alert_trigger_events`), trilha de auditoria (`audit_logs`), recuperação de senha (SMTP), MFA (`mfa_backup_codes`) — e, para cada uma: finalidade, categorias de dados e de titulares, **base legal do Art. 7º**, prazo de retenção, operadores, transferência internacional e medidas de segurança. Inclui a tabela de operadores (nome, serviço, dado tratado, país, DPA S/N, SCC S/N, data) que fecha o Art. 39. Acrescentar a manutenção do ROPA ao Definition of Done da skill `nova-feature`, para o documento não nascer desatualizado.
- **Depende de:** —
- **Risco/observações:** baixo em risco, alto em alavancagem — é **pré-requisito de outros 4 achados** (transferência internacional, DPA, retenção, base legal). É o primeiro documento pedido em fiscalização.

### RIPD — relatório de impacto do tratamento de medição contínua

- **Comportamento:** nenhum — artefato de governança. Entrega `.claude/docs/RIPD.md`.
- **Cobre:** LGPD Art. 38, Art. 10 §3º.
- **Priority:** P0 · **Size:** M
- **Critérios de aceite:** cobre descrição do tratamento; **necessidade e proporcionalidade da granularidade por minuto** (por que não 15 min? — a pergunta central, e a resposta condiciona a política de retenção da Fase 14); riscos aos titulares; salvaguardas já existentes; riscos residuais com plano de tratamento. Reavaliado a cada mudança material do modelo de dados.
- **Depende de:** ROPA (o RIPD referencia as operações registradas lá).
- **Risco/observações:** o achado é mais forte do que parece à primeira vista, e vale entender por quê antes de tratá-lo como burocracia: a cadeia `MeterReading → Meter → Device → Area → Property → User` liga **uma leitura por minuto a um CPF e a um endereço**. Medição elétrica nessa granularidade dentro de uma residência permite inferir presença/ausência, rotina de sono, horário de trabalho e número de ocupantes. Isso é monitoramento sistemático de comportamento — a hipótese clássica em que a ANPD espera RIPD, e que o regime de pequeno porte não dispensa.

### Transferência internacional e DPAs — decisão de hospedagem sob a lente da LGPD

- **Comportamento:** nenhum — decisão + contrato + correção do aviso de privacidade.
- **Cobre:** LGPD Art. 33-36 e Art. 39; Res. CD/ANPD 19/2024; Art. 6º VI.
- **Priority:** P0 · **Size:** M
- **Critérios de aceite:**
  - Decisão de hospedagem do `07-decisoes-em-aberto.md` tomada **como decisão de conformidade**, não só técnica: avaliar região Brasil (Neon `sa-east-1`, RDS São Paulo, provedores nacionais) ou UE antes de aceitar o default EUA — é a mitigação mais barata, porque elimina o problema em vez de contratá-lo.
  - Para cada provedor que permaneça nos EUA (hospedagem, banco, APM, agregador de log, SMTP): **SCCs da ANPD incorporadas ao contrato antes do primeiro byte de dado pessoal**; via assinada guardada fora do repositório e referenciada no ROPA.
  - § 4 do `privacy-policy.md` reescrito com a lista nominal de operadores, país de processamento e mecanismo de transferência; `CURRENT_CONSENT_VERSION` incrementada ao publicar.
  - ADR registrando a decisão (vincula arquitetura e conformidade ao mesmo tempo).
- **Depende de:** a decisão de hospedagem — **hoje em aberto no `07`**. Nasce `status: aguardando-decisão` + `status: precisa-adr`.
- **Risco/observações:** o timing é o ponto. Hoje o aviso de privacidade declara que não há transferência internacional, e isso é verdade — o app não está hospedado. **A declaração vira factualmente falsa no dia do deploy**, se ele for para Vercel/Railway/Neon/Sentry ou qualquer SMTP norte-americano. O período de graça da Res. 19/2024 encerrou em agosto/2025. Por isso o item entra numa fase P0 mesmo bloqueado: o custo de decidir errado é contratual e público, e a hora de decidir é antes, não depois.

**Fechamento (2026-08-06):** entregue nas 4 sub-issues planejadas (#155 canal do titular, #156 ROPA, #157 RIPD, #158 transferência internacional), épico #154, branch `feat/154-bloqueadores-conformidade-lgpd`. Nenhuma sub-issue ficou bloqueada — inclusive a #158, que nasceu `status: aguardando-decisão` e teve a decisão tomada dentro da própria fase.

- **#155 — canal do titular:** endereço de privacidade configurável por deploy (`VITE_PRIVACY_CONTACT_EMAIL`, placeholder documentado), publicado no rodapé da Landing, em "Sobre o projeto" e no Perfil, que ganhou o bloco "Exercer meus direitos" mapeando os 9 incisos do Art. 18 entre autoatendidos e "pelo canal". As três referências vagas do `privacy-policy.md` viraram o endereço literal. Procedimento interno em `.claude/docs/PROCEDIMENTO_DIREITOS_TITULAR.md` (prazo de 30 dias, dobro do pequeno porte).
- **#156 — ROPA:** `.claude/docs/ROPA.md` com 7 operações levantadas do schema real, não genéricas. Manutenção acrescentada ao Definition of Done da skill `nova-feature`, para o documento não nascer desatualizado.
- **#157 — RIPD:** `.claude/docs/RIPD.md`. A pergunta central ("por que minuto, e não 15 min?") foi respondida por requisito, não por conveniência: RF10/RF11 justificam a **coleta** por minuto, mas RF12 — a única leitura de histórico — nunca consulta granularidade mais fina que hora (`granularitySchema = z.enum(["hour","day","month","year"])`). Logo, a **retenção** indefinida por minuto não tem lastro em nenhum RF. Recomendação concreta (60–90 dias + compactação horária) entregue como insumo obrigatório da política de retenção da Fase 14.
- **#158 — hospedagem e transferência internacional:** **ADR-0008** — tudo numa VM Oracle Cloud Always Free em **São Paulo** (backend, frontend estático, PostgreSQL e o iot-simulator co-locados, broker MQTT em `127.0.0.1`), **sem nenhum operador estrangeiro**. Resultado: as SCCs da Res. 19/2024 não se aplicam por inexistência do fato gerador, e não há DPA a assinar (Art. 39) — exatamente a mitigação que esta fase recomendava ("elimina o problema em vez de contratá-lo"). O item "Hospedagem e infra de produção" saiu do `07`. `privacy-policy.md` § 4 reescrito com a tabela de processamento nominal e `CURRENT_CONSENT_VERSION` incrementada para 1.1. *(Registro histórico — em 2026-08-09 a **ADR-0010** trocou o provedor da demo pública para free tier fora do Brasil, com escopo restrito a demonstração; a conclusão de "nenhuma transferência internacional" registrada aqui **deixou de valer** para o ambiente publicado. O stack brasileiro continua implementado no repositório como o Caminho B do `DEPLOY.md`, e é o destino da migração antes de qualquer usuário real.)*

**Dívida deixada explicitamente — a premissa da ADR-0008 ainda não tem controle.** A conclusão de conformidade de #158 vale **enquanto o ambiente público não tratar dado pessoal real**, o que exige o cadastro público fechado (só contas de demonstração sobre o seed sintético). Esse controle é item da **Fase 13** e ainda não existe: até lá, a ADR-0008 não autoriza o deploy público. Os demais gates de go-live (credenciais demo fora do bundle, perímetro do simulador, CSP, redirect HTTPS, `pg_dump` agendado, rotação de chaves) estão listados na própria ADR e majoritariamente já alocados na Fase 13.

**Estado final:** backend `lint`/`build`/`test` limpos (129/129 arquivos · 1547/1547 testes); frontend idem (70/70 · 610/610); `.claude/log/CHANGELOG.md` com uma entrada por sub-issue. Um erro factual do ROPA (#156) foi encontrado e corrigido durante a #157 — o endereço de `properties` **é** cifrado em repouso, ao contrário do que o documento afirmava; registrado no changelog por ser exatamente o risco que a #156 advertia.

## Fase 12 — Travas mecânicas de qualidade + correções sem trade-off

> **Gate que esta fase destrava:** impedir regressão. O diagnóstico central da auditoria de qualidade é que o problema **não é o código escrito** — a arquitetura de módulos é consistente, `any` é praticamente inexistente, os comentários explicam o porquê, e a direção de dependência está substancialmente correta hoje. O problema é que **4 das 5 travas obrigatórias do `06-code-quality-standards.md` não existem**, e as violações que elas pegariam mecanicamente já estão acumulando: uma função de 188 linhas, um arquivo de 662 linhas com 7 classes, 31 repetições do mesmo bloco, 143 valores arbitrários de Tailwind.
>
> **Por que antes das fases de refatoração (16–18):** as regras vão apontar exatamente o que refatorar, **com número em vez de opinião**. Instalar a trava depois de refatorar é pagar o trabalho duas vezes. E, como a direção de dependência já está correta, o `dependency-cruiser` entra **verde** — congelando um estado bom em vez de gerar uma lista de dívida.
>
> Junto vão as correções que o laudo de desempenho classifica como "sem trade-off, custo baixo" — erros objetivos, não decisões de engenharia, que não precisam de medição prévia.

### Enforcement automatizado — ESLint, dependency-cruiser, husky, Prettier

- **Comportamento:** nenhum — infraestrutura de qualidade. Uma violação de complexidade, formatação ou direção de dependência passa a quebrar o CI em vez de depender de revisão manual.
- **Cobre:** `06-code-quality-standards.md:40-46` (as 4 travas ausentes); OWASP indiretamente (a direção de dependência é o que impede o domínio contornar `shared/crypto`).
- **Priority:** P0 · **Size:** M
- **Critérios de aceite:**
  - ESLint dos 4 pacotes com `complexity: ["error", 12]`, `max-depth: ["error", 4]`, `max-lines-per-function: ["error", {max: 60, skipBlankLines: true, skipComments: true}]`. As violações existentes são **catalogadas e endereçadas nas Fases 16–18, não silenciadas com `eslint-disable`** — se for preciso um alívio temporário, que seja um override explícito por arquivo, com prazo e link para a issue da fase que o remove.
  - `dependency-cruiser` com a regra que o `03-arquitetura.md` mais valoriza: proibir `^backend/src/modules/.*\.(service|repository)\.ts$` → `express|helmet|cors|cookie-parser`. **Uma regra que se paga vale mais que dez especulativas** (YAGNI). Step `npx depcruise src` no job `backend-lint` — fechando o gate que o `PULL_REQUEST_TEMPLATE.md:19` declara obrigatório e que hoje é assinado sem verificação.
  - `husky` + `lint-staged` rodando `eslint --fix` e `prettier --write` no que está staged.
  - Prettier no `backend/` e nos dois pacotes do `iot-simulator/` (hoje só o `frontend/` tem) + job `format:check` no CI.
- **Depende de:** —
- **Risco/observações:** médio — o risco não é técnico, é de escopo: ligar as regras vai acender violações reais em código que funciona. A disciplina que decide o sucesso da fase é **não silenciar**; catalogar e mandar para a fase certa.

### `iot-simulator` nos gates de CI e Dependabot

- **Comportamento:** nenhum — um PR que quebre o simulador passa a falhar o CI.
- **Cobre:** OWASP A03; `03-arquitetura.md:35-39` (o simulador é um dos três pacotes do monorepo).
- **Priority:** P0 · **Size:** S
- **Critérios de aceite:** jobs `lint`/`build`/`test`/`audit` para `iot-simulator/server` e `iot-simulator/ui` no `ci.yml` (a raiz é workspace npm — `npm ci && npm run lint -w server -w ui` cobre os dois); entrada `directory: "/iot-simulator"` no `dependabot.yml`; os **14 arquivos de teste** que já existem no pacote passam a rodar.
- **Depende de:** —
- **Risco/observações:** baixo. O que dá peso ao item: é o único pacote do monorepo sem `npm audit`, **apesar de subir um broker MQTT (`aedes`) e um servidor Express**. As dependências já divergiram em silêncio (`@types/node` em `^25.3.0` no server contra `^26.1.1` na ui).

### Flags de tipagem e lint com informação de tipo

- **Comportamento:** nenhum — o compilador e o lint passam a pegar classes de erro que hoje passam.
- **Cobre:** `06:42`.
- **Priority:** P1 · **Size:** M
- **Critérios de aceite:** `noImplicitReturns` ligado nos 4 pacotes (custo praticamente zero); `noUncheckedIndexedAccess` ligado no `frontend/` e no `iot-simulator/ui` — **em branch dedicada**, porque vai gerar erros reais e cada um é um bug latente de `undefined` em runtime (ex.: `res.items[0]` em `PropertyComparisonSection.tsx:50`); ESLint migrado para `tseslint.configs.recommendedTypeChecked`, ou no mínimo com `no-floating-promises` e `no-misused-promises` ativas — as duas regras de maior valor num codebase com handlers Express assíncronos, listeners de worker, schedulers e o padrão `void alertEvaluator.evaluate(...)` que hoje depende de disciplina manual.
- **Depende de:** —
- **Risco/observações:** médio — `noUncheckedIndexedAccess` no frontend é o item com maior chance de gerar trabalho não previsto. Por isso branch dedicada e fora do mesmo commit das outras travas.

### Secret scanning no CI

- **Comportamento:** nenhum — um segredo commitado passa a quebrar o CI.
- **Cobre:** OWASP A03.
- **Priority:** P1 · **Size:** XS
- **Critérios de aceite:** job `secret-scan` (gitleaks) bloqueante; se o repositório for público, Secret Scanning + Push Protection do GitHub habilitados.
- **Depende de:** —
- **Risco/observações:** baixo. O hook do `.claude/settings.json` bloqueia o **agente** de ler `.env*`, mas não impede um commit humano de vazar chave — e o repositório **já contém credenciais hardcoded** (as contas demo, tratadas na Fase 13), então o risco não é teórico.

### Bug do `Rs485Connection` — quebra de frame por caractere

- **Comportamento:** leituras RS-485 passam a ser decodificadas corretamente. Hoje **nenhuma** é.
- **Cobre:** RF09, RF10 no protocolo RS-485.
- **Priority:** P0 · **Size:** XS
- **Critérios de aceite:** `split("")` → `split("\n")` em `ModbusTcpConnection.ts:626`, alinhando com o `Rs232Connection` (`:525`) que o próprio comentário do RS-485 diz replicar; **teste de regressão escrito primeiro** (skill `correcao-bugs`) alimentando o handler `"data"` com dois chunks parciais que formam uma linha JSON e assertando **uma** chamada de `dataHandler` com o objeto parseado; teto nomeado de crescimento do buffer nos **dois** adaptadores (ex.: 64 KB) — um dispositivo que nunca envie `\n` hoje faz o buffer crescer sem limite, que é vetor de exaustão de memória.
- **Depende de:** —
- **Risco/observações:** o achado tem duas faces e as duas importam. É **bug funcional** (nenhuma linha JSON é jamais montada) e **amplificação de carga**: a 9600 baud são ~960 invocações do pipeline por segundo por medidor, cada uma com `JSON.parse` que falha e um `log.warn` com payload serializado — ~1000× o esperado. A extração do parser para uma função pura compartilhada (Fase 16) é o que fecha isso estruturalmente; aqui vai a correção pontual com teste, porque não deve esperar uma refatoração.

### Correções sem trade-off e limpeza de código morto

- **Comportamento:** nenhum — remoção de erro objetivo e de peso morto.
- **Cobre:** vários achados Baixos/Médios de qualidade e desempenho, agrupados por serem todos XS e sem decisão envolvida.
- **Priority:** P1 · **Size:** S
- **Critérios de aceite:**
  - **`QueryClientProvider` duplicado** (M-11): `main.tsx` monta um provider cuja configuração inteira é código morto (o de `App.tsx`, aninhado, vence por contexto) — e o comportamento efetivo é o **oposto** do que o comentário de `main.tsx:10-14` documenta quanto a `refetchOnWindowFocus`. Manter só o de `App.tsx` e decidir conscientemente se `refetchOnWindowFocus: true` compensa, dado o fan-out do Painel.
  - **Índices redundantes** (B-01): remover `@@index([token])` de `auth_tokens`, `refresh_tokens` e `password_resets` — as três colunas já têm `@unique`, que cria o índice B-tree; o segundo é puro custo de escrita.
  - **Dependência morta `profibus@0.0.0`** (Q-24 + B-05): remover de `dependencies` (zero imports em todo o código) e corrigir `04-tech-stack.md:12`, registrando PROFIBUS como stub deliberado.
  - **Decorators especulativos** (Q-38): remover `experimentalDecorators`/`emitDecoratorMetadata` do `backend/tsconfig.json` — zero decorators no código, com o comentário "(futuro uso...)" que é exatamente a abstração especulativa que o `06:5` proíbe.
  - **Regras mortas de `.gitignore`**: `prisma/migrations/` na raiz e `/generated/prisma` em `backend/` estão ancoradas errado e por isso são inócuas hoje — mas expressam intenção **oposta** ao estado real. Remover ou reescrever com intenção explícita (as migrações **devem** ser versionadas).
  - **`DATABASE_TEST_URL`/`DATABASE_HTTP_TEST_URL` no `envSchema`**, com `refine` impedindo que apontem para a mesma URL de `DATABASE_URL` — o `.env.example` avisa que a suíte **apaga os dados** desses bancos, e hoje isso está fora do fail-fast de config.
  - **`PlaceHolderPage.tsx`** renomeado para bater com o export (`PlaceholderPage`).
- **Depende de:** —
- **Risco/observações:** baixo por construção — o critério de entrada neste lote foi "é erro, não trade-off". Qualquer item que exija decisão saiu daqui e foi para a fase temática correspondente.

**Fechamento (2026-08-07):** entregue nas 6 sub-issues planejadas (#160–#165), épico #159, branch `chore/159-travas-qualidade-correcoes-sem-trade-off`. **Fecha a Fase 12.** Nenhuma redução de escopo — as 6 issues fecharam exatamente como descritas nos laudos, com achados adicionais tratados dentro do próprio critério "sem trade-off" da fase (não geraram desvio):

- **#160** — as 4 travas ausentes instaladas (ESLint com complexidade, `dependency-cruiser`, `husky`+`lint-staged`, Prettier em `backend/iot-simulator/`); violações pré-existentes catalogadas em overrides nomeados, não silenciadas — as sem fase prevista viraram a issue **#168**.
- **#161** — `iot-simulator` ganhou os 4 jobs de CI que faltavam; uma vulnerabilidade alta real (`brace-expansion`) e a divergência de `@types/node` corrigidas no caminho.
- **#162** — `noImplicitReturns`/`noUncheckedIndexedAccess` + lint tipado (`no-floating-promises`/`no-misused-promises`) nos 4 pacotes; 73 achados reais corrigidos, incluindo um risco de `unhandledRejection` silencioso no boot do servidor (`server.ts`).
- **#163** — `secret-scan` (gitleaks) bloqueante no CI; 13 falsos positivos triados e allowlistados especificamente, e uma regra própria criada só para o achado real conhecido (credenciais de demo) aparecer na varredura em vez de ficar invisível.
- **#164** — bug funcional confirmado: `Rs485Connection` nunca decodificava uma leitura sequer (`split("")` em vez de `split("\n")`); teste de regressão escrito primeiro, confirmado falhando contra o código original antes da correção.
- **#165** — os 7 itens "sem trade-off": provider duplicado do TanStack Query removido (com decisão consciente e documentada sobre `refetchOnWindowFocus`), 3 índices redundantes removidos via migração reversível, dependência morta `profibus` removida, decorators especulativos removidos, `.gitignore` corrigido (e 24 arquivos do client Prisma gerado destrackeados — nunca deveriam ter sido versionados), `DATABASE_TEST_URL`/`DATABASE_HTTP_TEST_URL` entraram no fail-fast do `envSchema`, `PlaceHolderPage.tsx` renomeado.

**Achado que expandiu o escopo, dentro do próprio critério da fase (#165):** o `.gitignore` de `backend/` nunca casava com o path real do client Prisma gerado (`src/generated/prisma`, não `backend/generated/prisma`) — por isso 24 arquivos de um build artifact estavam versionados por engano. Corrigir só o padrão do `.gitignore` teria sido cosmético sem também destrackear os arquivos já commitados; confirmado antes que `npm run db:migrate` (passo já documentado no README de setup) regenera o client via `prisma generate` como efeito colateral, então nenhuma instrução de onboarding precisou mudar.

## Fases 13–18 (objetivo — serão detalhadas ao chegar)

> Planejamento just-in-time, mesmo YAGNI do `06`: fase futura detalhada agora é reescrita antes de ser executada. Cada fase abaixo lista os achados que cobre, para rastreabilidade — **nenhum achado dos quatro laudos ficou fora do roadmap**.

## Fase 13 — Endurecimento de segurança (P1)

> **Gate que esta fase destrava:** expor a demo pública. A **ADR-0008** (hospedagem, Fase 11) condicionou explicitamente a autorização do deploy público a este conjunto — a conclusão de "sem transferência internacional" só vale enquanto o ambiente público não tratar dado pessoal real, e o controle que garante isso ainda não existe.
>
> **Origem:** bloco "Antes de expor a demo pública (P1)" + parte de "Endurecimento contínuo (P2)" do laudo `2026-08-05-seguranca-audit.md` (itens 6–10, 12–14 da lista de próximos passos), mais o gate de go-live #1 (fechamento do cadastro público) e #5 (host canônico/CSP) da ADR-0008 — que a ADR liga explicitamente a esta fase.
>
> **Achado que a ADR-0008 torna P0 e o laudo de segurança sozinho não deixava explícito:** fechar o cadastro público (`POST /api/users`) é premissa distinta de deixar as 2 contas demo somente-leitura — sem isso, um visitante pode criar conta com dado pessoal real e a conclusão de conformidade da ADR-0008 cai no primeiro cadastro.

### Fechamento do cadastro público + contas demo somente-leitura

- **Comportamento:** com o ambiente de demo configurado, `POST /api/users` recusa criação de conta nova; as 2 contas de demonstração (`DEMO_ACCOUNT_EMAILS`, já existente em `shared/config/demoAccounts.ts`) ficam protegidas contra troca de e-mail, troca de senha e configuração/desativação de MFA.
- **Cobre:** ADR-0008 (premissa de validade + gate de go-live #1); achado [MÉDIA] "Credenciais de demonstração hardcoded" (agravante de tomada de conta permanente da conta pública).
- **Priority:** P0 · **Size:** M
- **Critérios de aceite:**
  - Env `REGISTRATION_ENABLED` (default `true`; `false` no deploy da demo pública) no `envSchema`, com `POST /api/users` respondendo 403 quando desligado.
  - `UserService.update`, troca de senha autenticada (quando existir) e `verifyMfaSetup`/`disableMfa` recusam a operação com 403 quando `user.email` está em `DEMO_ACCOUNT_EMAILS` — reaproveitando o guard que `forgotPassword` já aplica (`auth.service.ts:229`), não duplicando a lista.
  - Teste que falha se qualquer um dos guards for removido (registro real, troca de e-mail/senha/MFA numa conta demo).
- **Depende de:** —
- **Risco/observações:** baixo tecnicamente — é composição de guards sobre serviços já existentes. O risco é de esquecimento de superfície: qualquer novo endpoint mutável em `user`/`auth` precisa lembrar do guard de conta demo; vale um teste de integração que cubra os 3 fluxos juntos, não 3 arquivos isolados.

### Reautenticação, verificação e revogação de sessão na troca de e-mail

- **Comportamento:** trocar o e-mail da conta exige a senha atual, o novo endereço só passa a valer após confirmação por link, o endereço anterior recebe um aviso, e as sessões existentes são revogadas após a troca.
- **Cobre:** [MÉDIA] "Troca de e-mail sem reautenticação, sem verificação, sem revogação de sessão" (`user.schema.ts:101-107`, `user.service.ts:89-97`) — hoje encadeia com o forgot-password numa tomada de conta completa a partir de sessão sequestrada.
- **Priority:** P0 · **Size:** M
- **Critérios de aceite:**
  - `updateUserSchema`/`UserService.update` exigem `currentPassword` quando `email` muda.
  - Novo endereço só é gravado após confirmação (token de confirmação, mesmo padrão de `PasswordReset` — token hasheado, TTL curto); até lá o e-mail antigo continua ativo.
  - E-mail de aviso disparado ao endereço **anterior** no início do fluxo (mesmo `MailerService` do forgot-password, mockável no teste como já é lá).
  - Sessões (`AuthToken`/`RefreshToken`) revogadas quando a troca é efetivada.
  - Teste de integração cobrindo o fluxo completo e o cenário de ataque (troca de e-mail → forgot-password no e-mail antigo continua funcionando; no novo, só após confirmação).
- **Depende de:** —
- **Risco/observações:** médio — é o item de maior superfície funcional nova da fase (fluxo de confirmação por e-mail não existe hoje para troca de e-mail, só para reset de senha). Reaproveitar ao máximo a infraestrutura de `PasswordReset`/`MailerService` em vez de criar um segundo mecanismo paralelo.

### Credenciais demo fora do bundle do frontend

- **Comportamento:** o bundle de produção do frontend não contém e-mail/senha das contas demo em texto claro, mesmo com `VITE_DEMO_MODE` desligado.
- **Cobre:** [MÉDIA] "Credenciais de demonstração hardcoded no código-fonte e embarcadas no bundle" (`frontend/src/config/demoUsers.ts:5-16`, `LoginPage.tsx:10`); ADR-0008 gate de go-live #2.
- **Priority:** P0 · **Size:** S
- **Critérios de aceite:**
  - `DEMO_USERS` deixa de ser importado estaticamente com a senha em claro em `LoginPage.tsx`.
  - Substituído por um destes (decidir na execução, registrar a escolha): (a) endpoint `POST /api/auth/demo-login` gated por `REGISTRATION_ENABLED === false`/env de demo, sem senha no cliente; ou (b) variáveis `VITE_DEMO_EMAIL_*` injetadas só no build específico do ambiente de demo, nunca no build padrão.
  - Build de produção padrão (sem env de demo) sem nenhuma credencial válida no bundle — conferir com `grep`/`strings` no artefato final, não só no código-fonte.
- **Depende de:** Fechamento do cadastro público (mesmo `REGISTRATION_ENABLED`, se a opção (a) for escolhida).
- **Risco/observações:** baixo — muda o transporte da credencial, não a existência das contas demo. Cuidado para não quebrar o botão "Entrar como demo" da Landing/Login, que é parte do valor de portfólio do produto.

### Perímetro mínimo do `iot-simulator`

- **Comportamento:** a API de controle do simulador e o broker MQTT deixam de aceitar qualquer cliente sem credencial, e passam a escutar por padrão só em localhost.
- **Cobre:** [MÉDIA] "`iot-simulator` exposto sem autenticação, sem helmet e sem rate limit; broker MQTT anônimo em `0.0.0.0`" (`iot-simulator/server/src/api/app.ts:18-33`, `broker.ts:16-38`, `index.ts:11,21`); ADR-0008 gates de go-live #3/#4.
- **Priority:** P0 · **Size:** M
- **Critérios de aceite:**
  - `helmet` + rate limiter na API do simulador (`iot-simulator/server/src/api/app.ts`).
  - Token estático obrigatório via header (`SIMULATOR_API_TOKEN` no env schema do simulador), validado em todas as rotas de `/api/networks` e `/api/devices`.
  - Hook `authenticate`/`authorizePublish` no `Aedes` (usuário/senha via env).
  - Bind default em `127.0.0.1` para a API e para o broker, host configurável por env para quem precisar expor deliberadamente.
  - `IOT_ALLOWED_HOSTS=localhost` (ou `127.0.0.1/32`) documentado no `.env.example` do backend como o valor de produção — fecha o gate #4 da ADR-0008 sem afrouxar a allowlist SSRF da issue #150.
  - README do `iot-simulator` atualizado: nunca expor fora de localhost.
- **Depende de:** —
- **Risco/observações:** médio — é o item com mais chance de quebrar o fluxo de demo se o token/porta não forem propagados corretamente para o backend que se conecta ao broker; testar a integração ponta a ponta (simulador → broker → backend → SSE) depois da mudança, não só os testes unitários do simulador.

### Rate limiter dedicado em `POST /api/users` + mensagens de conflito genéricas

- **Comportamento:** tentativas repetidas de cadastro público passam a ser limitadas por IP, e a resposta de conflito não revela se o e-mail, CPF ou CNPJ enviados já existem na base.
- **Cobre:** [MÉDIA] "Cadastro público sem rate limit dedicado e com enumeração de contas por 409" (`user.routes.ts:22`, `user.service.ts:29-49`, `app.ts:134-136`).
- **Priority:** P1 · **Size:** XS
- **Critérios de aceite:**
  - `authRateLimiter` (ou instância dedicada, mesma chave IP) aplicado a `POST /api/users`.
  - Mensagens de conflito de CPF/CNPJ unificadas numa resposta genérica (sem distinguir qual documento colidiu) — mesmo padrão de minimização já aplicado ao `forgot-password`.
  - Teste cobrindo 429 no limite e a mensagem genérica no conflito.
- **Depende de:** —
- **Risco/observações:** baixo — mesmo padrão de rate limiter já usado em `/login`/`/forgot-password`, só uma nova montagem de rota.

### Cifra de `Meter.extra.password` + omissão do `MeterResponse`

- **Comportamento:** a senha de credencial MQTT/protocolo informada no cadastro do medidor deixa de ser devolvida em texto claro pela API e passa a ser cifrada em repouso.
- **Cobre:** [MÉDIA] "Credenciais MQTT do usuário armazenadas em texto claro no `extra` do medidor e devolvidas pela API" (`meter.schema.ts:26`, `meter.repository.ts:37,123,139`, `IoTConnectionManager.ts:76-86`).
- **Priority:** P1 · **Size:** S
- **Critérios de aceite:**
  - `extra` tipado explicitamente por protocolo (substituindo `z.record(z.string(), z.unknown())`).
  - `extra.password` cifrado em repouso com uma chave dedicada (mesmo padrão AES-256-GCM já usado para CPF/CNPJ/endereço/TOTP — chave própria, não reaproveitada).
  - `toMeterResponse` nunca devolve o valor decifrado — expõe `passwordSet: boolean` no lugar.
  - Teste que lê a coluna do banco e assere ciphertext (mesmo padrão dos testes de cripto existentes) + teste de rota assertando ausência do campo na resposta.
- **Depende de:** —
- **Risco/observações:** baixo-médio — mudar o schema de `extra` é o ponto de atenção: qualquer medidor MQTT existente no seed/demo com `extra.password` em claro precisa de migração de dados, não só de schema.

### CSP do SPA + redirect HTTPS com host canônico

- **Comportamento:** o navegador aplica a Content-Security-Policy do LumiTrack ao abrir o app, e um `Host` forjado numa requisição HTTP não gera mais um redirect 301 para um domínio arbitrário.
- **Cobre:** [MÉDIA] "SPA sem Content-Security-Policy" (`frontend/index.html:1-35`) e [MÉDIA] "Redirect HTTP→HTTPS usa `Host` do cliente sem validação" (`backend/src/app.ts:66-72`); ADR-0008 gate de go-live #5 (explicitamente ligado à decisão de hospedagem da Fase 11, já tomada).
- **Priority:** P0 · **Size:** S
- **Critérios de aceite:**
  - Redirect HTTP→HTTPS usa um host canônico de uma env fixa (ex.: `PUBLIC_API_ORIGIN`) em vez de `req.headers.host`; requisição com `Host` fora da allowlist responde 400.
  - CSP definida em `frontend/index.html` via `<meta http-equiv="Content-Security-Policy">`: `default-src 'self'; script-src 'self' 'sha256-<hash do script anti-FOUC>'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'` (ajustar o hash ao script real de `index.html:8-29`).
  - Decisão registrada junto da ADR-0008 (aditivo ou nota, não nova ADR — a decisão de hospedagem já está tomada, isto é a implementação dela).
- **Depende de:** decisão de hospedagem — **já resolvida** (ADR-0008, Fase 11).
- **Risco/observações:** baixo-médio — CSP quebrando silenciosamente uma dependência de runtime (ex. um script/estilo inline não previsto) é o modo de falha típico; testar build de produção completo no navegador antes de fechar o item, não só revisão de código.

### Revalidação de sessão no SSE + lacunas de teste do laudo

- **Comportamento:** um stream SSE aberto para de entregar dados assim que a sessão que o abriu é revogada (logout, reset de senha); os controles de segurança que hoje só existem "de fato" passam a ter teste que falha se forem removidos.
- **Cobre:** [BAIXA] "Stream SSE não revalida a sessão" (`iot-stream.routes.ts:72-121` — implementação, não só teste); [BAIXA] "Nenhum teste cobre os controles de A02" (`app.ts:75-96`); [BAIXA] "Nenhum teste garante que CPF/CNPJ e endereço estão cifrados na coluna do banco" (`encryption.test.ts`, `addressEncryption.test.ts`, `user.repository.ts:96-112`).
- **Priority:** P1 · **Size:** S
- **Critérios de aceite:**
  - `iot-stream.routes.ts` revalida o token no mesmo intervalo do `membershipRefresh` (linha 103-107) — consulta `findActiveToken`/`revokedAt`/`expiresAt` e encerra a resposta quando a sessão deixou de ser válida.
  - `app.security-headers.test.ts` novo: supertest assertando `content-security-policy`, `strict-transport-security`, `x-frame-options`/`frame-ancestors`, ausência de `x-powered-by`, e `Access-Control-Allow-Origin` para origem permitida vs. não permitida.
  - Teste espelhando `user.service.test.ts:87-101` (que já valida o hash de senha lendo a coluna): criar usuário/propriedade via service, ler pelo `prismaTest`, assertar que `users.cpf`/`users.cnpj`/`properties.address` não contêm o valor em claro e decifram corretamente.
- **Depende de:** —
- **Risco/observações:** baixo — os dois achados de teste são cobertura pura (o controle já existe); a revalidação do SSE é o único código novo do item, pequeno e isolado.

**Fechamento (2026-08-08):** entregue nas 8 sub-issues planejadas (#177–#184), épico #185, branch `fix/185-endurecimento-seguranca-p1`. **Fecha a Fase 13.** Nenhuma redução de escopo — as 8 issues fecharam exatamente como descritas no roadmap; dois itens tiveram escopo **ampliado** por decisão do usuário durante a execução, registrado em detalhe em cada entrada do `CHANGELOG.md`:

- **#177** — cadastro público fechado (`REGISTRATION_ENABLED`) + contas demo somente-leitura, incluindo `deleteUser` (achado que expandiu o escopo original da issue, dentro do próprio critério "somente-leitura").
- **#178** — reautenticação + verificação por e-mail + revogação de sessão na troca de e-mail; escopo ampliado para o frontend (campo de senha + página de confirmação) porque a issue original era só backend, mas `ProfilePage` já tinha um fluxo de troca de e-mail funcional sem senha nenhuma — sem o frontend, a tela quebraria no dia do deploy.
- **#179** — credenciais demo fora do bundle: endpoint `POST /api/auth/demo-login` sem senha no cliente, opção mais forte que as duas listadas na issue original.
- **#180** — perímetro mínimo do `iot-simulator`: token de API + credenciais MQTT + bind em `127.0.0.1`, com verificação ponta a ponta manual real (simulador → broker autenticado → consumidor).
- **#181** — rate limiter dedicado em `POST /api/users` + mensagem de conflito genérica (CPF/CNPJ/e-mail).
- **#182** — cifra de `Meter.extra.password` com chave própria + omissão do `MeterResponse`; achado que mudou o desenho do plano original: leitura pública (redigida) precisou ser separada de leitura de conexão (decifrada, uso interno do worker IoT), mesmo princípio já usado em `UserRepository` para senha de usuário.
- **#183** — host canônico no redirect HTTPS (fecha um open redirect via Host forjado) + CSP do SPA, com verificação num browser real (Playwright headless) contra o build de produção.
- **#184** — revalidação de sessão no SSE (sessão revogada por logout/reset de senha agora encerra o stream) + as 2 lacunas de cobertura de teste do laudo (cabeçalhos de segurança A02, cifra de CPF/CNPJ/endereço em repouso).

Com a Fase 13 fechada, os gates de go-live #1–#5 da ADR-0008 estão implementados (fecho do cadastro público, credenciais fora do bundle, perímetro do simulador, `IOT_ALLOWED_HOSTS`, host canônico + CSP) — restam #6 (`pg_dump` agendado) e #7 (rotação de chaves), fora do escopo desta fase (operacionais, não código). São eles que abrem a **Fase 13.5**, abaixo.

---

## Fase 13.5 — Primeiro deploy (go-live)

> **Por que 13.5 e não 14:** inserir como Fase 14 obrigaria a renumerar 14→15 até 22→23, invalidando as referências a "Fase 14" e "Fases 19–22" que já existem nos milestones do GitHub, nos quatro laudos de auditoria e no `CHANGELOG.md`. O número fracionário custa uma linha de estranheza e preserva todas as referências externas.
>
> **Trade-off declarado — esta fase não é fatiada verticalmente.** Ela não atravessa banco → API → UI porque não entrega comportamento novo nenhum: o que ela entrega é **o produto que já existe, acessível**. É o segundo ponto do roadmap onde a regra cede a uma dependência inescapável (o primeiro foi "Fundação de tokens", na Fase 1, já registrado nas justificativas de sequenciamento). Nenhum RF novo.
>
> **Gate que esta fase fecha:** go-live #6 e #7 da ADR-0008 — os únicos que a Fase 13 não podia fechar, porque são operacionais e não de código.
>
> **Dois blocos independentes.** O Bloco A (infraestrutura) e o Bloco B (documentação pública) não dependem um do outro e podem avançar em paralelo — B não espera a VM existir. Mas os dois pertencem ao mesmo marco: publicar o sistema com um wiki que descreve um projeto acadêmico em ASP.NET seria pior do que não ter wiki.

### Bloco A — Infraestrutura de go-live

#### Provisionamento da VM e do runtime

- **Comportamento:** existe um ambiente de produção capaz de rodar o sistema.
- **Cobre:** ADR-0010 (provedor vigente) e ADR-0008 (topologia lógica).
- **Priority:** P0 · **Size:** M
- **Critérios de aceite (Caminho A — vigente):** os dois serviços do `render.yaml` sobem a partir do repositório; o banco Neon responde com `sslmode=require`; `POST /api/users` responde 403 (cadastro fechado); o simulador publica no mesmo container e o painel mostra dado ao vivo depois de um despertar.
- **Critérios de aceite (Caminho B — migração futura):** SSH aceita apenas chave, nunca senha; firewall expõe somente 80 e 443; `psql` a partir de fora da VM é recusado; o broker MQTT do simulador escuta em `127.0.0.1` e não responde do exterior.
- **Depende de:** —
- **Risco/observações:** **replanejado em 2026-08-09 (ADR-0010).** O risco de capacidade ARM (Ampere A1) da Oracle, que era o maior risco externo desta fase, **deixou de existir** — a demo saiu para free tier gerenciado. Em troca entraram riscos de plataforma: cota de 750 horas-instância/mês no Render, hibernação com cold start de ~60–90s, e o limite de 0,5 GB do Neon, que **exige reduzir a janela do seed de demonstração** (o seed atual geraria ~650 MB). O Fly.io citado como fallback na ADR-0008 não tem mais free tier.

#### Publicação com processo supervisionado

- **Comportamento:** o backend roda como serviço gerenciado, reinicia sozinho após falha ou reboot, e as migrações são aplicadas por um caminho próprio de produção.
- **Cobre:** ADR-0008 (backend always-on é premissa: sem isso os três schedulers param e o `MinuteBuffer` se perde).
- **Priority:** P0 · **Size:** M
- **Critérios de aceite:** unidade `systemd` com `enable` — reboot da VM traz backend, banco e simulador de volta sem intervenção; **SIGTERM é respeitado e o graceful shutdown roda o flush do `MinuteBuffer`**, de modo que `systemctl restart` não perde leitura já ingerida; script novo `db:migrate:deploy` (`prisma migrate deploy`) no `backend/package.json`, já que hoje só existe `migrate dev`; `/health` responde 200.
- **Depende de:** Provisionamento da VM.
- **Risco/observações:** matar o processo abruptamente perde as leituras do minuto corrente ainda não persistidas — o flush no shutdown não é refinamento, é requisito.

#### Reverse proxy, TLS e host canônico

- **Comportamento:** o sistema responde por HTTPS num domínio real, com o SPA e a API atrás do mesmo proxy.
- **Cobre:** gate de go-live #5 da ADR-0008 (a metade de configuração; a de código saiu na #183).
- **Priority:** P0 · **Size:** S
- **Critérios de aceite:** certificado Let's Encrypt válido e renovação automática verificada; `http://` responde 301 para o host canônico; requisição com `Host` forjado recebe 400; `curl -I` mostra HSTS e um header `Content-Security-Policy` **do proxy** contendo `frame-ancestors`, `base-uri` e `object-src` — as três diretivas que a CSP via `<meta>` do `frontend/index.html` não consegue entregar, conforme a nota técnica da própria ADR-0008.
- **Depende de:** Publicação com processo supervisionado.
- **Risco/observações:** a CSP passa a existir em dois lugares (meta e header). O header do proxy precisa ser superconjunto coerente do `<meta>`, senão o SPA quebra por diretiva mais restritiva.

#### Checklist de `.env` de produção e rotação de chaves

- **Comportamento:** o ambiente sobe com configuração de produção deliberada, não com defaults de desenvolvimento.
- **Cobre:** gate de go-live #7 da ADR-0008; premissa de validade da ADR (cadastro fechado).
- **Priority:** P0 · **Size:** S
- **Critérios de aceite:** `REGISTRATION_ENABLED=false`, `DEMO_LOGIN_ENABLED=true`, `IOT_ALLOWED_HOSTS=127.0.0.1/32`, `CORS_ORIGIN` e `PUBLIC_API_ORIGIN` com o domínio real; `JWT_SECRET` e as **cinco** chaves de cifra geradas novas, nenhuma delas vinda do `.env.example`; `POST /api/users` responde 403 em produção; `POST /api/auth/demo-login` funciona; o checklist fica versionado no `DEPLOY.md`.
- **Depende de:** Provisionamento da VM.
- **Risco/observações:** `REGISTRATION_ENABLED` tem default `true` — subir sem trocá-lo derruba a conclusão de conformidade inteira da ADR-0008 no primeiro cadastro de uma pessoa real. É o item da fase com maior consequência e menor esforço.

#### Backup do PostgreSQL com restauração testada

- **Comportamento:** existe um backup automático do banco e uma restauração que já foi provada funcionar.
- **Cobre:** gate de go-live #6 da ADR-0008.
- **Priority:** P0 · **Size:** S
- **Critérios de aceite:** `pg_dump` agendado (timer do `systemd` ou cron) com política de retenção definida; **restauração executada ao menos uma vez num banco descartável, reproduzindo os dados** — a ADR exige o teste, não só o dump; procedimento no `DEPLOY.md`.
- **Depende de:** Provisionamento da VM.
- **Risco/observações:** a VM não tem backup gerenciado. Backup não testado é backup que não existe.

#### Seed de demonstração e verificação ponta a ponta em produção

- **Comportamento:** a demo pública funciona de verdade — alguém entra pela conta de demonstração e vê dado vivo.
- **Cobre:** RF02, RF09–RF16 (verificação, não implementação).
- **Priority:** P0 · **Size:** S
- **Critérios de aceite:** `db:seed:demo` executado; simulador co-locado publicando; login demo entra; o painel mostra potência ao vivo via SSE; um alerta dispara e gera notificação; nenhuma conexão de saída bloqueada pelo guard de SSRF.
- **Depende de:** Checklist de `.env`; Reverse proxy.
- **Risco/observações:** é a verificação que fecha a fase — se algo do endurecimento da Fase 13 quebrou o caminho feliz, aparece aqui.

#### Observabilidade mínima de produção

- **Comportamento:** a queda do sistema gera alerta em algum canal que o mantenedor de fato lê.
- **Cobre:** item "Observabilidade de produção" de `07-decisoes-em-aberto.md`.
- **Priority:** P1 · **Size:** S
- **Critérios de aceite:** monitor de uptime externo apontando para `/health`; alerta chegando; a escolha da ferramenta registrada em **ADR-0009**.
- **Depende de:** Reverse proxy.
- **Risco/observações:** decisão restrita antes de ser técnica — a ADR-0008 barra APM/agregador estrangeiro, que reintroduziria a transferência internacional. A ferramenta precisa ser região Brasil/UE ou auto-hospedada. **Item cortável:** subir sem observabilidade é aceitável para portfólio, desde que seja risco assumido explicitamente e não esquecimento.

#### Documentação de operação (`DEPLOY.md`)

- **Comportamento:** o deploy é reproduzível por escrito, não por memória.
- **Cobre:** custo "ops manual" aceito na ADR-0008.
- **Priority:** P1 · **Size:** S
- **Critérios de aceite:** `.claude/docs/DEPLOY.md` com topologia real, comandos de deploy e rollback, o checklist de `.env` e o procedimento de restauração de backup; `04-tech-stack.md` deixa de afirmar que nenhum artefato de deploy existe.
- **Depende de:** todos os itens anteriores do Bloco A.
- **Risco/observações:** —

### Bloco B — Documentação pública

> Independe do Bloco A. Pode avançar enquanto a VM é provisionada.

#### `README.md` da raiz

- **Comportamento:** quem chega ao repositório entende o que é o projeto, o que ele faz, para onde vai e como participar — sem precisar abrir o wiki.
- **Cobre:** —
- **Priority:** P0 · **Size:** S
- **Critérios de aceite:** seção **Sobre** com resumo, funcionalidades e roadmap resumido, terminando com o link do wiki; subseção **Como participar** cobrindo as duas vias (contribuir aqui ou criar fork) com a atribuição exigida ao repositório e ao autor; bloco de conformidade para fork comercial com as duas obrigações reais — **GPL-3.0** (copyleft forte: o fork permanece aberto sob GPL-3.0, com código modificado publicado e atribuição preservada) e **LGPD** (o fork que abrir cadastro real vira controlador e assume base legal por operação, canal do titular, ROPA, DPA com cada operador e SCC se hospedar fora do Brasil — apontando para a ADR-0008, que já mapeia esse limite, em vez de inventar orientação jurídica); seção **Documentação** logo após, com backend, frontend, mobile e `iot-simulator`; **nenhum link quebrado** — hoje `mobile/README.md` é link morto.
- **Depende de:** —
- **Risco/observações:** o bloco de conformidade descreve obrigações legais, não dá parecer — mesma ressalva que o `09` já carrega.

#### `README.md` do backend

- **Comportamento:** o pacote é compreensível ponta a ponta por quem nunca o viu.
- **Cobre:** —
- **Priority:** P0 · **Size:** L
- **Critérios de aceite:** cobre os 16 módulos, a cadeia `routes → controller → service → repository`, todos os endpoints (incluindo `demo-login` e a confirmação de troca de e-mail, da Fase 13), as cinco chaves de cifra e as variáveis novas (`REGISTRATION_ENABLED`, `DEMO_LOGIN_ENABLED`, `IOT_ALLOWED_HOSTS`, `PUBLIC_API_ORIGIN`), setup local e de produção. **Diagramas em mermaid:** arquitetura em camadas, ERD do schema Prisma, sequência da ingestão IoT (FNC001), ciclo de vida de um alerta (FNC002), fluxo de autenticação com refresh rotacionado e MFA, e o pipeline de CI. Nenhuma afirmação contradiz o código.
- **Depende de:** —
- **Risco/observações:** são 1.767 linhas existentes — o risco é drift silencioso, não falta de conteúdo. Reconciliar contra o código, não reescrever por cima.

#### `README.md` do frontend

- **Comportamento:** idem, para o SPA.
- **Cobre:** —
- **Priority:** P0 · **Size:** M
- **Critérios de aceite:** migração Industry registrada como concluída (Fases 1–7), páginas novas (`ConfirmEmailChangePage`, "Sobre o projeto"), CSP do `index.html`, variáveis `VITE_*` reais, estratégia de testes. **Diagramas em mermaid:** árvore de rotas com guardas de autenticação, fluxo de dados TanStack Query ↔ API, ciclo do SSE no cliente (conexão, reconexão, consumo) e hierarquia de contextos.
- **Depende de:** —
- **Risco/observações:** —

#### `README.md` do `iot-simulator` (novo)

- **Comportamento:** o simulador deixa de ser a única parte do monorepo sem porta de entrada documentada.
- **Cobre:** —
- **Priority:** P0 · **Size:** M
- **Critérios de aceite:** arquivo criado na raiz do pacote (hoje só existe `server/README.md`, com 44 linhas); cobre o workspace `server` + `ui`, o token de API e as credenciais MQTT introduzidos pela #180, o bind em `127.0.0.1`, como rodar e como plugar no backend. **Diagramas em mermaid:** topologia simulador → broker `aedes` → backend, e sequência de uma publicação até a leitura aparecer no painel.
- **Depende de:** —
- **Risco/observações:** é o pacote que um avaliador de portfólio mais provavelmente tenta rodar primeiro, e hoje é o menos documentado.

#### Verificação do `O-Sistema-Eletrico-Brasileiro.md`

- **Comportamento:** o documento de referência do domínio deixa de carregar valores regulatórios não verificados.
- **Cobre:** insumo das Fases 19–22 (é o oráculo dos cálculos de Grupo A, ACL e Branca).
- **Priority:** P1 · **Size:** M
- **Critérios de aceite:** valores conferidos contra fonte oficial (ANEEL, Planalto) — bandeiras vigentes, ICMS por estado, Lei 15.235/2025 e REN 1.147/2025, transição PIS/COFINS→CBS, e se a proposta ANEEL de nov/2025 sobre Tarifa Branca automática virou norma; cruzamento com a bandeira que a aplicação já sincroniza da fonte oficial (ADR-0007); correção de `Parceça`→`Parcela` (2 ocorrências) e `anúncia`→`anuncia`; **valor não confirmável vira "aproximado, referência {data}", nunca fato**. A aritmética dos 7 exemplos práticos já foi conferida e fecha.
- **Depende de:** —
- **Risco/observações:** o documento existe em dois lugares (`.claude/docs/` e o wiki). A partir daqui, **a cópia em `.claude/docs/` é a fonte de verdade** e a do wiki é cópia sincronizada — registrado no `CLAUDE.md`.

#### Wiki completo

- **Comportamento:** o wiki descreve o produto que existe hoje.
- **Cobre:** —
- **Priority:** P0 · **Size:** M
- **Critérios de aceite:** editado direto no clone em `~/Development/lumitrack.wiki/` (repositório git separado; commit e push são do usuário). `Home.md` reescrita a partir do produto atual; **`História-do-projeto.md` nova**, recebendo íntegra a origem acadêmica (PUC-MG, equipe de seis, orientação, stack ASP.NET original e a virada para desenvolvimento solo) — preserva o crédito sem que a primeira tela descreva um projeto que não existe mais; `Contextualização.md` revisada; `O-Sistema-Elétrico-Brasileiro.md` sincronizado com a fonte de verdade; `_Sidebar.md` novo. Remoção do arquivo duplicado `O Sistema Elétrico Brasileiro` (sem extensão, 34.944 bytes, idêntico ao `.md`). **Nenhuma afirmação do wiki contradiz o código** — hoje contradiz em cinco pontos: histórico de consumo inserido manualmente, distribuidora com `kwhPrice` único (é TUSD+TE decomposto), alerta por threshold de kWh (é faixa de potência kW ± tolerância%), rollup horário (é por minuto) e token mobile sem expiração (são 90 dias).
- **Depende de:** Verificação do `O-Sistema-Eletrico-Brasileiro.md` (para sincronizar já corrigido).
- **Risco/observações:** o drift do wiki é anterior à reformulação IoT inteira — é reescrita, não revisão.

#### Metadados do repositório no GitHub

- **Comportamento:** quem encontra o repositório pela busca vê a descrição certa e o link da demo.
- **Cobre:** —
- **Priority:** P1 · **Size:** XS
- **Critérios de aceite:** descrição atualizada (hoje: *"Projeto do 2º período do curso de Análise e Desenvolvimento de Sistemas - PUC-MG"*) e campo *homepage* preenchido com a URL da demo.
- **Depende de:** Reverse proxy (para existir URL).
- **Risco/observações:** —

### Fase 14 — Conformidade P1: retenção, DSAR, consentimento e documentos (P1)

Cobre: retenção de `MeterReading`/`AlertTriggerEvent`/`MfaBackupCode`/`TariffFlagHistory` + política de conta inativa (hoje o `RetentionService` cobre só 4 entidades de credencial — **o dado de maior risco do produto é o único sem prazo**); export DSAR completo (consumo agregado, medidores, disparos) + PDF na UI + limite de janela do audit log; base legal por operação, aceites separados (Termos ≠ Política) e reaceite via `consentVersion` (o campo existe e nunca foi comparado); aviso de privacidade complementado (cookies, prazos reais, decisões automatizadas do Art. 20, idade mínima do Art. 14) e revisão jurídica; `RUNBOOK_INCIDENTES.md` corrigido (3 dias úteis dobrados, canal correto da ANPD, registro de 5 anos incluindo incidentes **não** comunicados); guarda de registros de acesso (Marco Civil Art. 15); TLS obrigatório no SMTP em produção.

### Fase 15 — Desempenho: instrumentação, índices e multiplicadores (P1)

**Instrumentação primeiro** — o `06:36` exige medir antes de otimizar, e hoje não há APM nem tracing (`07`). `pg_stat_statements` + `EXPLAIN (ANALYZE, BUFFERS)`, `prisma.$on('query')` contando queries por requisição, React DevTools Profiler, `rollup-plugin-visualizer` para baseline. Só então: índices de FK (`Property.userId`, `Area.propertyId`, `Device.areaId`, `Alert.userId`, `Property.distributorId` — o Prisma **não** cria índice de FK no PostgreSQL); cache in-process de bandeira e distribuidoras + `staleTime` no frontend; N+1 do `AlertService.findAll` (até 124 queries numa página de 31 alertas, reinvalidado a cada evento SSE de alerta) + endpoint de stats; endpoint batch de consumo (o Painel com 20 propriedades custa ~160 queries, 40 delas `GROUP BY` sobre a maior tabela); teto de `pageSize` maior para `/api/consumption`; `countBuckets` com `COUNT(*) OVER ()`.

### Fase 16 — Worker IoT: robustez, estrutura e cobertura (P2)

Cobre: quebrar `ModbusTcpConnection.ts` (662 linhas, 7 classes de protocolos distintos, com o stub de PROFIBUS instruindo a consultar documentação no próprio arquivo) em um arquivo por adaptador + `serialLineParser.ts` compartilhado; schema Zod por protocolo em `createConnection`, eliminando os **22 non-null assertions** sobre dados do banco e os ~120 linhas de boilerplate de uma vez; polling com guarda de reentrância, timeout, backoff e reconexão nos 4 adaptadores (`setInterval` hoje não espera a promise anterior); mapeamento de payload dos adaptadores não-MQTT (**hoje 100% das leituras Modbus/EtherNet-IP/PROFINET são descartadas** — só MQTT funciona ponta a ponta); tetos plausíveis no payload IoT via Zod; SSE com serialização única e backpressure; `upsertMinute` em `INSERT ... ON CONFLICT`; cobertura dos 6 adaptadores sem teste + da fábrica.

### Fase 17 — Frontend: tempo real e bundle (P2)

Cobre: React Compiler habilitado (o código já é compiler-clean por lint e vários comentários citam o compilador — **colhe zero benefício dele hoje**) + separação do `RealtimeContext` em conexão/leituras; buffer de potência circular com downsampling (hoje O(n) por amostra sobre até 86.400 pontos, com o `useMemo` do gráfico nunca acertando); `useLiveMeterReading` sem render a cada 2 s; code-splitting por rota + `manualChunks` isolando `recharts` e a stack markdown (hoje `/login` baixa as duas dependências mais pesadas do projeto).

### Fase 18 — Design system, cobertura e polimento (P2)

Cobre: **decisão de token primeiro** — mapear no `@theme` a escala tipográfica e de espaçamento que o protótipo de fato usa (os 143 valores arbitrários não são descuido: o tema mapeia cor/fonte/raio/sombra mas não a escala, então cada tela recorre ao colchete) e promover o verde `#3f8f52` a token, com `/design-sync` de volta; depois a limpeza mecânica — tokens pré-Industry em ~16 arquivos, `.lt-live-dot` no lugar da animação inline replicada 10×, ramo morto do `UserMenu` (cuja **suíte de testes valida exclusivamente o ramo morto**), `LiveKpiCard` adotado nas 3 páginas que o copiaram, decisão única sobre `Blueprint` vs. cantos manuais, e lint anti-regressão. Mais: namespace próprio de `queryKey` para "último bucket" (elimina o `pageSize: 3` mágico que hoje evita uma colisão que **já causou bug real**); cobertura de Alertas (RF14–RF16, hoje sem nenhum teste, único mecanismo que avisa o usuário sobre consumo anômalo), do SSE client e do CRUD de Medidor; `parseOrThrow` eliminando as 31 repetições; drift de documentação viva (`10`, `03`, `04`, `README`); e o restante do polimento (Q-25 a Q-37, B-04, B-07, B-08).

---

## Grupo A, Mercado Livre e Tarifa Branca (Fases 19–22)

> **Origem:** `.claude/docs/O-Sistema-Eletrico-Brasileiro.md` (documento de referência do domínio) + pedido do usuário em 2026-08-05.
>
> **O tamanho real do gap.** Hoje o domínio é **exclusivamente Grupo B monômio**, e o próprio schema registra isso (`schema.prisma:86-93`: *"Grupo A (alta/média tensão, tarifa binômia) fica para uma fase futura"*). O `TariffService` calcula `kwhBilled × (tusd + te)` com **uma tarifa única, sem posto tarifário e sem demanda**; o `EnergyDistributor` guarda a tarifa como **duas colunas planas** (`tusdPerKwh`, `tePerKwh`).
>
> O que o Grupo A exige e **não existe em nenhuma camada**: subgrupos A1–AS · modalidade tarifária · demanda contratada (1 valor na Verde, 2 na Azul) · postos tarifários com calendário de feriados · demanda medida (máximo das médias de 15 min) · ultrapassagem · energia reativa excedente. E o catálogo de tarifas precisa deixar de ser duas colunas na distribuidora para virar uma tabela por (subgrupo × modalidade × posto).
>
> **Esta é a maior expansão de domínio desde o MVP** — a primeira que muda a fórmula central do produto (FNC003) em vez de acrescentar tela ou integração.

### Ponto de validação obrigatório antes de escrever cálculo

O documento de referência afirma, na linha 316, que no Mercado Livre *"a bandeira não se aplica à TE (que é negociada bilateralmente), mas se aplica à TUSD"*.

**Isso destoa do mecanismo** e não deve ser implementado sem confirmação: a bandeira tarifária existe para recompor o custo de **compra de energia** da distribuidora — custo que o consumidor ACL não tem, porque compra bilateralmente — e a TUSD é encargo de **fio**, não de energia. As duas leituras possíveis (bandeira sobre a TUSD × bandeira não aplicável ao ACL) produzem contas diferentes.

Tratado como item de spike na Fase 21, validado contra a REN vigente e registrado em ADR **antes** de qualquer linha de cálculo. Uma tarifa errada é pior que uma tarifa tardia — o produto inteiro se apoia na credibilidade desse número.

### Pré-requisito comum: requisitos e design

- **`02-requisitos.md` precisa de RFs novos.** O RF13 atual descreve **só** o Grupo B ("TUSD + TE decompostos, tributos por dentro, bandeira, CIP, piso de disponibilidade") e a FNC003 idem. Grupo A binômio, ACL e Branca são comportamento novo, não refinamento — cada fase abre com a atualização do `02`, senão o roadmap passa a referenciar requisitos que não existem.
- **Nenhuma tela destas fases tem handoff de design.** O bundle `2026-07-31-lumitrack-completo` não cobre cadastro de Grupo A, detalhamento de conta binômia, gestão de contrato ACL nem comparação ACR × ACL. Aplica-se a **regra de ausência** do `10-design-system.md` — decidir na chegada de cada fase entre aguardar handoff ou versão provisória com `TODO(design)`. Precedente do projeto: a página "Sobre o projeto" (Fase 6) foi versão provisória por decisão explícita do usuário.

## Fase 19 — Grupo A: fundação tarifária + Horária Verde (A4)

> **Estratégia de fatiamento (decisão do usuário, 2026-08-05):** a fundação é construída **validada por uma modalidade só** — Verde no A4, o subgrupo mais comum do Grupo A, com 1 demanda contratada. Azul (2 demandas), ultrapassagem e ERE ficam para a Fase 20, reaproveitando uma fundação já exercitada por dado real em vez de projetada no vazio.
>
> É o mesmo raciocínio que a Fase 1 aplicou aos componentes Industry, e que a correção registrada lá ensinou: **cria-se a abstração quando um segundo consumidor real pede a mesma API**, não especulativamente. Aqui a fundação nasce com um consumidor real (Verde) e ganha o segundo (Azul) na fase seguinte.

### Modelo de dados: grupo, subgrupo, classe e catálogo de tarifas

- **Comportamento:** nenhum diretamente — é a mudança estrutural que habilita todo o resto. Ao final, uma propriedade pode ser cadastrada como Grupo A com subgrupo e modalidade, e o catálogo de tarifas comporta valores por posto e por demanda.
- **Cobre:** RF08 (catálogo de distribuidoras, ampliado) e habilita os RFs novos de tarifação binômia.
- **Priority:** P0 · **Size:** L
- **Critérios de aceite:**
  - **ADR registrando a decisão de modelagem** — é mudança estrutural de domínio, exigida pelo `03-arquitetura.md`. Ponto central: hoje `BillingClass` **conflita dois conceitos ortogonais** (subgrupo B1/B2/B3 **e** classe de uso). O documento de referência os separa explicitamente: subgrupo é definido por **tensão de fornecimento**, classe de uso é transversal aos grupos (residencial, industrial, comercial, rural, poder público...). A ADR decide se viram `TariffGroup` + `TariffSubgroup` + `ConsumerClass` ou outra forma.
  - Catálogo de tarifas migra de **duas colunas planas** em `EnergyDistributor` (`tusdPerKwh`/`tePerKwh`) para tabela própria por (distribuidora × subgrupo × modalidade × posto), com tarifa de **energia** (TUSD + TE) e de **demanda** (TUSD demanda). Migração preserva os dados de Grupo B existentes sem perda.
  - `02-requisitos.md` atualizado com os RFs novos antes da implementação começar.
  - Seed do catálogo cobre pelo menos uma distribuidora real de Grupo A com valores de fonte citada.
  - Testes do `TariffService` para Grupo B **continuam verdes sem alteração** — a refatoração do catálogo não pode mudar o resultado de nenhuma conta existente. Este é o critério que protege o que já funciona.
- **Depende de:** —
- **Risco/observações:** **alto — é o item de maior risco estrutural do roadmap inteiro.** Mexe no modelo de dados que sustenta o cálculo de custo (RF13) de todos os usuários atuais. A mitigação é o critério acima: os testes de Grupo B são o contrato de regressão, e a migração deve ser reversível. Fazer **depois** da Fase 12 não é acaso — as travas de complexidade e o `dependency-cruiser` instalados lá passam a valer justamente para o código mais complexo do projeto.

### Postos tarifários: janelas horárias e calendário de feriados

- **Comportamento:** o consumo passa a ser classificado em ponta, intermediário e fora de ponta conforme o horário e o dia — com fins de semana e **feriados** contando integralmente como fora de ponta.
- **Cobre:** RF12 (agregação de consumo, ampliada por posto).
- **Priority:** P0 · **Size:** M
- **Critérios de aceite:**
  - Janela de ponta configurável **por distribuidora** — o documento registra que é tipicamente 18h–21h "mas varia em alguns locais e estado"; hardcodar 18h–21h seria errado para parte do catálogo.
  - **Calendário de feriados nacionais**, incluindo os **móveis** (Carnaval, Sexta-Feira Santa e Corpus Christi derivam da Páscoa) — não é uma lista fixa de datas, é cálculo. Feriado é fora de ponta o dia inteiro.
  - Agregação por posto no `consumption.repository.ts`, que hoje faz só `date_trunc` — o bucketing passa a considerar a janela horária, mantendo a agregação em SQL (não em JS), como o laudo de desempenho registra ser o padrão correto já estabelecido.
  - Testes cobrindo as bordas que quebram implementações ingênuas: virada de dia dentro da ponta, feriado móvel, fim de semana, e o dia de mudança de horário caso o horário de verão volte (hoje descontinuado desde 2019 — registrar a premissa no código).
- **Depende de:** modelo de dados (item anterior).
- **Risco/observações:** médio. O feriado móvel é a armadilha clássica: uma lista fixa de datas funciona por um ano e silenciosamente erra no seguinte, cobrando ponta num feriado. Como o erro é de **cobrança**, ele mina a confiança no produto inteiro.

### Demanda medida a partir das leituras IoT

- **Comportamento:** o usuário vê a demanda medida do mês (kW) derivada das próprias leituras do medidor, por posto tarifário — sem precisar informar nada.
- **Cobre:** RF10/RF11 (ingestão e tempo real, ampliados) e habilita a tarifação binômia.
- **Priority:** P0 · **Size:** M
- **Critérios de aceite:**
  - Demanda = **maior potência média medida em intervalos de 15 min** (definição do glossário do documento de referência). Derivável do que já existe: `MeterReading` guarda `avgPowerW` por minuto, então a janela de 15 min é a média de 15 registros e a demanda do período é o máximo dessas janelas.
  - Demanda apurada **por posto** (na Verde há 1 demanda contratada, mas a medição por posto já é necessária para a Azul da Fase 20 e para a análise de ultrapassagem).
  - Rollup incremental no mesmo padrão do `MinuteRollupScheduler` já existente — **não** recalcular varrendo `meter_readings` a cada consulta (o laudo de desempenho já registra essa tabela como a maior do sistema, com agregações que a varrem inteira).
  - Teste cobrindo janelas incompletas (medidor que ficou offline parte do intervalo) — o modo de falha a evitar é uma janela de 3 minutos virar "demanda" e inflar a conta.
- **Depende de:** postos tarifários.
- **Risco/observações:** médio-alto — é o **diferencial do produto** (medição própria em vez de dado informado), e é onde a precisão importa mais: a demanda define a maior parcela da conta de um consumidor A4 e, na Fase 20, a multa de ultrapassagem de 3×. Uma janela mal apurada vira erro de centenas de reais.

### Tarifação binômia Horária Verde (A4)

- **Comportamento:** um consumidor A4 na modalidade Verde vê a conta calculada corretamente: demanda contratada + consumo por posto + bandeira + tributos por dentro + CIP, com a decomposição completa.
- **Cobre:** RF13 (ampliado para binômio) — **RF novo** a registrar no `02`.
- **Priority:** P0 · **Size:** M
- **Critérios de aceite:**
  - `Property` ganha demanda contratada (kW) para Grupo A, validada como obrigatória por modalidade.
  - `TariffService` ganha o caminho binômio, seguindo a fórmula do documento de referência: `[demanda contratada × TUSD demanda] + [consumo por posto × (TUSD energia + TE energia) do posto] + [bandeira × consumo total] + tributos por dentro + CIP`.
  - **Bandeira incide sobre o consumo medido, nunca sobre a demanda** — regra explícita do documento (linha 313).
  - **Piso de disponibilidade não se aplica ao Grupo A** — é regra de Grupo B (REN 1.000/2021 art. 291); no Grupo A o papel equivalente é da demanda contratada. O `calculateForProperty` atual aplica o piso incondicionalmente e passa a ramificar por grupo.
  - Decomposição completa no retorno, nunca só o total — mesma regra que a FNC003 já impõe hoje, para a UI poder detalhar.
  - Teste reproduzindo o **Exemplo 6** do documento de referência (metalúrgica A4 Verde em Joinville, 200 kW contratados, 28.800 kWh, ICMS SC 17%, total R$ 22.464,75) — um caso end-to-end com número conferível de fonte externa vale mais que dez asserções sintéticas.
- **Depende de:** demanda medida; postos tarifários; modelo de dados.
- **Risco/observações:** médio — a fórmula é conhecida e o exemplo de referência dá um oráculo de teste. O risco é de **ramificação**: o `TariffService` passa a ter dois caminhos (monômio B, binômio A) e o pior resultado possível é um `if` espalhado que degrada o melhor arquivo do repositório — o laudo de qualidade registra o `TariffService` como *"o melhor arquivo do repositório"* (domínio puro, zero número mágico, regras nomeadas com a norma de origem). Preservar essa qualidade é critério, não bônus.

### UI: cadastro Grupo A e detalhamento da conta binômia

- **Comportamento:** o usuário cadastra uma propriedade de Grupo A (subgrupo, modalidade, demanda contratada) e vê a conta detalhada com a separação por posto tarifário e a parcela de demanda.
- **Cobre:** os RFs novos, na camada de apresentação.
- **Priority:** P1 · **Size:** L
- **Critérios de aceite:**
  - Formulário de propriedade ramifica por grupo: Grupo B mantém exatamente os campos de hoje; Grupo A acrescenta subgrupo, modalidade e demanda contratada, com validação por modalidade.
  - Detalhamento da conta mostra as parcelas do binômio separadas (demanda × consumo por posto), não um total agregado — a decomposição é o valor do produto para um consumidor A4, que precisa saber **onde** gastou.
  - Gráfico de consumo passa a distinguir os postos.
  - **Sem handoff de design** — decidir na execução entre aguardar export do Claude Design ou versão provisória com `TODO(design)`, seguindo a regra de ausência do `10`.
  - Nenhuma tela de Grupo B sofre regressão visual ou funcional.
- **Depende de:** tarifação binômia Verde.
- **Risco/observações:** médio-alto. É o item **mais afetado pela ausência de design** de todo o roadmap: não é uma tela institucional como "Sobre o projeto", é a superfície onde o usuário confere dinheiro. Uma versão provisória aqui carrega mais risco de retrabalho — vale considerar produzir o handoff antes desta fase chegar, e é o motivo de ela ser o último item da fase (o backend fecha e entrega valor mesmo se a UI esperar).

## Fases 20–22 (objetivo — serão detalhadas ao chegar)

### Fase 20 — Grupo A: Azul, ultrapassagem e energia reativa excedente

Completa o Grupo A sobre a fundação da Fase 19. Cobre: **modalidade Horária Azul** (2 demandas contratadas — ponta e fora de ponta — e 4 tarifas distintas; obrigatória para A1/A2/A3 e para demanda ≥ 300 kW); **ultrapassagem de demanda** (tolerância de 5%, acima disso `(medida − contratada) × 3 × tarifa`, aplicada **antes** dos tributos); **energia reativa excedente** (FP mínimo 0,92, indutivo medido entre 6h–24h e capacitivo entre 0h–6h, cobrado em R$/kVArh) — viável porque `MeterReading` já persiste `avgPowerFactor` por minuto. Oráculo de teste disponível: **Exemplo 7** do documento de referência (frigorífico A4 Azul em Cuiabá, FP 0,91, total R$ 101.496,36). A **Convencional Binômia** entra aqui como decisão de escopo: está em extinção gradual segundo o documento e restrita a A3a/A4/AS com demanda < 300 kW — avaliar na chegada se vale implementar ou registrar como adiada com justificativa.

### Fase 21 — Mercado Livre de Energia (ACL)

Abre com o **spike de validação da incidência de bandeira no ACL** (ver "Ponto de validação obrigatório" acima) e as regras de elegibilidade de migração, fechando em ADR antes de qualquer cálculo. Depois: `Property` passa a distinguir **ACR (cativo) × ACL (livre)**; contrato de energia com preço da TE negociado e vigência; cálculo ACL (TUSD da distribuidora + TE contratada, em vez da TE do catálogo); e a **comparação ACR × ACL** — "vale a pena migrar?" — que é o maior valor de produto da fase, porque responde com o consumo real do próprio usuário em vez de estimativa. Elegibilidade a registrar: A1/A2/A3 sempre; A3a/A4/AS desde jan/2024 sem restrição de demanda; pequenos consumidores e residências a partir de jan/2028 (proposta) — este último é premissa datada, revisar na chegada.

### Fase 22 — Tarifa Branca (Grupo B)

Reaproveita integralmente a fundação de postos tarifários da Fase 19 — é por isso que entra depois dela e não antes. Cobre: modalidade Branca para B1 e B3 voluntariamente (**vedada** a baixa renda, B4 e a quem recebe outros descontos); três postos nos dias úteis com fins de semana e feriados integralmente fora de ponta; e a particularidade que uma implementação ingênua erra — o **custo de disponibilidade na Branca é calculado com a tarifa Convencional**, não com as horárias (REN 1.098/2024). Oráculo de teste: **Exemplo 3** do documento de referência (casa trifásica em BH, 450 kWh distribuídos em três postos, total R$ 359,55), incluindo o contraexemplo documentado de quando a Branca fica **mais cara** que a Convencional — que é exatamente o alerta que o produto precisa dar ao usuário antes de ele aderir. Contexto de urgência: a ANEEL propôs em nov/2025 tornar a Branca automática para consumidores BT acima de 1 MWh/mês em 2026 e acima de 600 kWh/mês em 2027.

## Fases seguintes (menos detalhadas — serão refinadas ao chegar)

Nenhuma Fase 23 definida. Itens novos exigem novos requisitos ou achados equivalentes.

Candidatos conhecidos, ainda sem fase:

- **Handoff de design para "Sobre o projeto"** (Fase 6) — substituiria a versão provisória e fecharia o `TODO(design)`. Depende de um export novo do Claude Design, não de decisão de engenharia.
- **Handoff de design para as telas de Grupo A / ACL** (Fases 19 e 21) — mesma natureza, mas com impacto maior: é a superfície onde o usuário confere dinheiro.
- **Geração Distribuída (solar fotovoltaica)** — o documento de referência cobre o tema (REN 482/2012, REN 1.059/2023, Lei 14.300/2022, Fio B crescente até 2029, custo de disponibilidade não abatível por crédito). Não foi pedido e não entra especulativamente, mas é a expansão de domínio mais provável depois desta.
- **Tarifa Social e Desconto Social** (Lei 15.235/2025) — subclasses de baixa renda com gratuidade até 80 kWh e isenção de CDE até 120 kWh. Idem: coberto pelo documento, não pedido, não antecipado.

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
- **Fase 6 depois da Fase 5, não em paralelo:** decisão explícita do usuário (2026-08-04) — a Fase 5 (UI) segue como prioridade corrente; a migração do ethernet-ip (backend, sem RF novo, puramente dívida técnica) só começa depois. Tecnicamente as duas fases são independentes (pacotes/áreas diferentes do monorepo, sem dependência real), mas manter o sequenciamento evita dividir o foco entre uma fase de produto quase fechando o roadmap original e uma migração de biblioteca que reescreve integração com hardware real — risco maior, exige atenção dedicada. *(A migração passou a ser a Fase 9 no replanejamento de 2026-08-04 — ver abaixo; a justificativa de "não em paralelo com UI" continua valendo.)*

### Replanejamento de 2026-08-04 (Fases 6–9)

- **Shell do app (Fase 6) primeiro:** é o maior desvio de design vivo no produto hoje — moldura pré-Industry em volta de conteúdo Industry, visível em **toda** tela autenticada. Também é a única das frentes novas com acoplamento estrutural real (`UserMenu` e `ThemeToggle` mudando de componente-pai), o tipo de mudança que fica mais caro quanto mais código novo se acumula em volta. Mesma lógica que colocou a Fundação na Fase 1: o que todo o resto herda vem antes.
- **Telas públicas (Fase 7) depois do shell:** quatro itens pequenos (XS/XS/S/XS), independentes entre si e de baixo risco — poderiam rodar em qualquer ordem. Ficam depois porque afetam telas que o usuário recorrente vê uma vez (autenticação) ou não vê (LGPD, Landing), enquanto o shell da Fase 6 está na frente dele o tempo todo. A única dependência entre as duas fases é um artefato, não uma ordem: o componente de ícone do GitHub, criado onde a execução chegar primeiro.
- **Bandeira tarifária (Fase 8) antes do ethernet-ip:** toca RF08 e a precisão de RF13 — é produto, não manutenção. A migração do ethernet-ip não tem RF associado. Dentro da fase, o spike vem antes da integração pela regra de risco/incerteza primeiro: a integração inteira pode não existir, e descobrir isso custa uma investigação, não uma implementação jogada fora.
- **ethernet-ip renumerada de Fase 6 para Fase 9** (decisão do usuário, 2026-08-04): as três frentes novas passaram na frente. O conteúdo do item foi preservado sem alteração. A fase **já tem uma issue aberta — #127** (`[Chore] Migração da integração EtherNet/IP para ethernet-ip v2.0.0`), cujo corpo referenciava "Fase 6"; a referência foi atualizada para "Fase 9" junto com esta renumeração, para o ponteiro issue → roadmap não apontar para a fase errada. Nenhuma issue nova foi criada para esta fase: o item é único, e um épico contendo uma sub-issue só não agrega nada. Ela continua por último pelo mesmo motivo de sempre: reescreve integração com hardware industrial real, sem cobertura de teste de hardware no CI, e merece atenção dedicada em vez de dividir espaço com frentes de UI.

### Remediação das auditorias (Fases 10–18, planejadas em 2026-08-05)

- **Por que o fatiamento vertical cede aqui:** um achado de segurança ou um índice ausente não tem "comportamento de usuário" atravessando banco→API→UI. Forçar a regra produziria fases artificiais. O critério de agrupamento passa a ser **o gate que o conjunto destrava** — deploy público (Fase 10), operar com titular real (Fase 11), impedir regressão (Fase 12) — que é o mesmo raciocínio já aplicado à Fundação da Fase 1, onde a dependência técnica venceu a fatia de produto.
- **Segurança (10) antes de conformidade (11), embora ambas sejam P0:** as duas bloqueiam gates diferentes e nenhuma depende da outra, então a ordem é uma escolha. Segurança vem primeiro porque é **inteiramente executável agora**: os cinco itens são código, com critério objetivo de pronto. A Fase 11 tem três itens documentais e um preso à decisão de hospedagem — começar por ela seria começar por uma fase que não fecha. Ainda assim, o canal do titular (Fase 11) é o item de melhor custo/benefício de todo o roadmap e pode ser puxado para frente se você quiser um ganho rápido.
- **Travas mecânicas (12) antes das fases de refatoração (16–18):** as regras de complexidade e o `dependency-cruiser` apontam **com número** o que refatorar, em vez de opinião — e como a direção de dependência já está correta hoje, o `dependency-cruiser` entra verde, congelando um estado bom em vez de gerar backlog. Instalar a trava depois de refatorar paga o trabalho duas vezes.
- **O bug do RS-485 na Fase 12, não na 16:** ele é corrigido pontualmente com teste junto das travas, e só a **causa raiz estrutural** (duplicação entre RS-232 e RS-485, resolvida extraindo o parser) espera a Fase 16. Um bug funcional confirmado não fica parado esperando refatoração — mesmo padrão já aplicado a #111 e #113 na Fase 3.
- **Instrumentação antes de otimização (Fase 15):** o `06:36` é explícito ("meça antes de otimizar") e hoje não existe instrumental (`07` — observabilidade em aberto). Metade dos achados de desempenho está marcada **[MEDIR ANTES]** pelo próprio laudo: com poucas centenas de linhas o planner escolhe seq scan de qualquer jeito e o índice não muda nada. Os achados que **não** precisam de medição (são erros, não trade-offs) foram puxados para a Fase 12.
- **Design system e cobertura por último (18), apesar de serem 17 achados:** são os de menor risco operacional — nenhum deles quebra em produção nem viola obrigação legal. E o maior deles (143 valores arbitrários de Tailwind) é uma **decisão de token**, não implementação: o tema mapeia cor/fonte/raio/sombra mas não a escala tipográfica/espacial, então cada tela recorre ao colchete. Fazer a limpeza antes de mapear a escala geraria só `eslint-disable`.
- **Fases 13–18 propositalmente não detalhadas:** planejamento just-in-time. Cada uma lista os achados que cobre para rastreabilidade — **nenhum dos ~95 achados distintos ficou fora do roadmap** — mas o detalhamento em critérios de aceite só acontece quando a fase chegar, porque o que se aprende nas anteriores muda as seguintes (a Fase 6 é o precedente: o achado que a originou só apareceu depois de 5 fases executadas).

### Grupo A, Mercado Livre e Tarifa Branca (Fases 19–22, planejadas em 2026-08-05)

- **Depois de toda a remediação das auditorias** (decisão do usuário, 2026-08-05): as Fases 10–18 vêm antes. O argumento decisivo não é "arrumar a casa primeiro" em abstrato — é que a Fase 12 instala as travas mecânicas (complexidade, `dependency-cruiser`, tipagem) que passam a valer justamente para o **código mais complexo do projeto**, escrito nas Fases 19–22. Instalar a trava depois de escrever a tarifação binômia seria pagar a refatoração duas vezes, e o Crítico de log da Fase 10 vaza sessão em produção enquanto isso.
- **Fundação validada por uma modalidade só (Verde/A4) antes de Azul:** é a mesma lição que a Fase 1 registrou por escrito — *"cria-se o primitivo quando um segundo consumidor real pedir a mesma API, não especulativamente"*. Ali o plano previa 7 primitivos React e só 1 se justificou. Aqui, projetar a fundação para as três modalidades de uma vez repetiria o erro no lugar mais caro possível: o modelo de dados tarifário. Verde é o consumidor real que valida; Azul é o segundo, e é ele que prova se a abstração está certa.
- **Modelo de dados antes de tudo, com ADR:** é o único ponto do bloco onde a regra de fatiamento vertical cede — pela mesma razão da Fundação da Fase 1. O catálogo de tarifas precisa deixar de ser duas colunas planas antes que qualquer cálculo binômio exista, e isso toca o caminho de custo (RF13) de **todos os usuários atuais**. Os testes de Grupo B são o contrato de regressão que protege quem já usa o produto.
- **Demanda medida antes da tarifação binômia:** a conta de um A4 é dominada pela parcela de demanda; calcular a tarifa antes de saber apurar a demanda seria construir sobre um número que ainda não existe. E é o item de maior valor de produto do bloco — a demanda derivada das próprias leituras é o que diferencia o LumiTrack de uma planilha.
- **UI por último dentro da Fase 19:** o backend fecha e entrega valor mesmo se a UI esperar, e é o item mais afetado pela **ausência de handoff de design**. Diferente de "Sobre o projeto" (Fase 6), aqui não é tela institucional: é a superfície onde o usuário confere dinheiro, e uma versão provisória carrega risco real de retrabalho. Deixar por último preserva a opção de produzir o handoff antes de a fase chegar.
- **ACL (21) depois de completar o Grupo A (20), não antes:** tecnicamente o ACL depende só da fundação da Fase 19, e poderia ser puxado para frente se a prioridade for valor de produto — a comparação "vale a pena migrar?" é a funcionalidade mais vendável do bloco. Mantive depois porque um consumidor ACL **continua pagando** ultrapassagem e ERE no lado da TUSD: entregar ACL antes da Fase 20 produziria uma conta de mercado livre incompleta, que é pior que nenhuma.
- **Branca (22) depois da fundação, não junto:** ela reaproveita a infraestrutura de postos tarifários integralmente, e por isso não justifica antecipação — mas é a fase de maior alcance do bloco em número de usuários (Grupo B é a maioria absoluta do produto). Se a proposta da ANEEL de nov/2025 avançar (Branca automática acima de 1 MWh/mês em 2026), ela ganha urgência regulatória e deve ser repriorizada.
- **Validar a incidência de bandeira no ACL antes de calcular:** o documento de referência afirma que a bandeira se aplica à TUSD no mercado livre, o que destoa do mecanismo (bandeira recompõe custo de compra de energia; TUSD é encargo de fio). Spike + ADR antes de qualquer linha de cálculo — mesma disciplina de risco/incerteza primeiro que a Fase 8 aplicou à fonte oficial da bandeira, e pelo mesmo motivo: uma tarifa errada custa mais que uma tarifa tardia.

### Replanejamento de 2026-08-09 (inserção da Fase 13.5)

**O que mudou:** uma fase nova entre a 13 e a 14. Nenhuma fase existente foi alterada, removida ou renumerada.

- **Por que ela não existia antes:** o planejamento de 2026-08-05 tratou o deploy como consequência automática da Fase 13 — "fechados os gates, é só subir". A revisão de 2026-08-09 mostrou que não: os gates #1–#5 da ADR-0008 são de código e fecharam na Fase 13, mas **#6 (backup testado) e #7 (rotação de chaves) são operacionais e não tinham dono em fase nenhuma**. Some-se a isso que o repositório não tem um único artefato de deploy — nem Dockerfile, nem unidade `systemd`, nem config de proxy, nem `migrate deploy`. Trabalho real sem lugar no plano é trabalho que não acontece.
- **Por que 13.5 e não 14:** renumerar 14→15 … 22→23 quebraria as referências a "Fase 14" e "Fases 19–22" já gravadas nos milestones do GitHub, nos quatro laudos de auditoria e no `CHANGELOG.md`. O custo de um número fracionário é cosmético; o de referências apontando para a fase errada, não.
- **Por que a documentação pública entrou na mesma fase (Bloco B), e não numa fase própria:** os dois blocos fecham o mesmo marco e nenhum faz sentido publicado sem o outro. O wiki descreve hoje o projeto acadêmico original em ASP.NET, e cinco afirmações dele contradizem o código atual — publicar o sistema mantendo isso no ar seria pior do que não ter wiki. Os blocos são independentes entre si e podem correr em paralelo; o marco espera os dois.
- **Consequência para a Fase 15:** a instrumentação de desempenho passa a ter onde medir. Medir gargalo em ambiente local, com dado de seed, era o ponto fraco reconhecido daquela fase — com o sistema no ar e o simulador publicando de forma contínua, a medição passa a valer alguma coisa.
- **Decisão que a fase força:** observabilidade de produção sai de `07-decisoes-em-aberto.md` como item de médio prazo e vira escolha imediata — ou entra como ADR-0009 dentro da fase, ou subir sem monitoramento passa a ser risco assumido de forma explícita, não esquecimento.
