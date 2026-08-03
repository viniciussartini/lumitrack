# Roadmap de Implementação — LumiTrack (design system Industry)

> Documento vivo. Atualizado ao fim de cada fase. Fonte: `02-requisitos.md` + ADR-0005 + `.claude/design/2026-07-31-lumitrack-completo/`.
> Última atualização: 2026-08-02 · Fase atual: 3 (Fase 1 concluída — épico #94; Fase 2 concluída — épico #104)
>
> Escopo: migração do frontend para o design system Industry e construção das telas do handoff que ainda não existem. Não altera nenhum RF de backend — só adiciona telas/UI sobre a API já existente.

## Visão geral das fases

| Fase | Objetivo (comportamento entregue) | Status |
|---|---|---|
| 1 | Fundação Industry + Autenticação (login, registro, recuperar senha) restilizados | **Concluída** (#89–#93, épico #94) |
| 2 | Hierarquia do consumidor (Propriedade→Área→Dispositivo) via modal + LGPD | **Concluída** (#97–#103, épico #104) |
| 3 | Alertas, Distribuidoras, Segurança/MFA restilizados | Planejada — detalhe abaixo |
| 4 | Painel (feature nova) + Perfil (tela nova) | Não iniciada |
| 5 | Landing pública (tela nova) + Simulador IoT (restyle) | Não iniciada |

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

## Fases seguintes (menos detalhadas — serão refinadas ao chegar)

**Fase 4 — Painel (feature nova) + Perfil (tela nova)**
Painel: consumo ao vivo via SSE (RF11), consumo do dia/custo do mês/comparação por período (RF12, RF13), bandeira vigente (RF08) — `DashboardPage` hoje é um placeholder, isso é feature nova, não restyle. Perfil: leitura/edição via `GET/PUT` de usuário — sem RF hoje, cobertura nova. Requer dois hooks/services que não existem (`tariff-flag`, mutations de usuário).

**Fase 5 — Landing pública + Simulador IoT**
`LandingPage` nova (marketing, sem auth, sem RF — menor risco técnico do roadmap). Restyle do `iot-simulator/ui` (dashboard, redes, dispositivos) — pacote separado, dados já reais via `useNetworks`/`useLiveStatus`.

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
- **Landing/Simulador (Fase 5) por último:** menor risco técnico e menor dependência de qualquer fase anterior — entram por último por serem os mais paralelizáveis, não por serem menos importantes.
