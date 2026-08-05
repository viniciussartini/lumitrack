# Roadmap de Implementação — LumiTrack

> Documento vivo. Atualizado ao fim de cada fase. Fonte: `02-requisitos.md` + ADR-0005 + `.claude/design/2026-07-31-lumitrack-completo/`.
> Última atualização: 2026-08-05 · Fase atual: 9 (Fase 1 concluída — épico #94; Fase 2 concluída — épico #104; Fase 3 concluída — épico #110, PR #112; Fase 4 concluída — épico #114, PR #124; Fase 5 concluída — épico #128, PR #131; Fase 6 concluída — épico #132, PR ainda não aberto; Fase 7 concluída — épico #133, PR ainda não aberto; Fase 8 concluída — épico #134, PR ainda não aberto)
>
> Escopo: guia geral de implementação do projeto, não mais restrito a uma área. Fases 1–5 cobrem a migração do frontend para o design system Industry e a construção das telas do handoff que ainda não existem (nenhuma delas altera RF de backend). A partir da Fase 6 o escopo se amplia: fidelidade ao handoff no chrome do app, consistência entre telas públicas, integração externa e dívida técnica de backend.

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
| 8 | Bandeira tarifária a partir da fonte oficial (spike → ADR → integração condicional) | **Concluída** (#142–#143, épico #134, PR ainda não aberto) |
| 9 | Migração ethernet-ip v1→v2 no backend (dívida técnica) | Planejada — **fase atual**, detalhe abaixo (era Fase 6; renumerada em 2026-08-04, ver justificativas) |

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

## Fases seguintes (menos detalhadas — serão refinadas ao chegar)

Nenhuma Fase 10 definida ainda. Itens novos exigem novos requisitos ou achados equivalentes: retomar este documento (via skill `planejar-roadmap`) só quando surgirem — não antecipar fases especulativas.

Candidato conhecido, ainda sem fase: um handoff de design para "Sobre o projeto" (Fase 6), que substituiria a versão provisória e fecharia o `TODO(design)` — depende de um export novo do Claude Design, não de decisão de engenharia.

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
