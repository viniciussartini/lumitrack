# Handoff: LumiTrack — plataforma de monitoramento de energia + simulador IoT

## Visão geral
LumiTrack é uma plataforma web (pt-BR) para monitoramento de consumo elétrico residencial/comercial:
landing pública, autenticação, painel de consumo em tempo real, hierarquia
Propriedade → Área → Dispositivo, alertas, distribuidoras, perfil, segurança (MFA), página LGPD,
e um **Simulador IoT** separado (ferramenta local que publica leituras via MQTT para a plataforma).

## Sobre os arquivos deste pacote
Os arquivos em `design/` são **referências de design feitas em HTML** — protótipos que mostram
aparência e comportamento pretendidos, **não código de produção para copiar direto**.
A tarefa é **recriar esses designs no ambiente do codebase alvo** (React, Vue, Next, etc.)
usando os padrões e bibliotecas já estabelecidos nele. Se ainda não existir um ambiente,
escolha o framework mais adequado e implemente os designs nele.

Os `.dc.html` são componentes de página autocontidos: cada um tem um bloco `<helmet>` com CSS
global e um `class Component` no fim do arquivo com todo o estado e os dados mock.
Leia-os como especificação: markup = layout, `renderVals()` = dados/estado, `<style>` = tokens locais.

## Fidelidade
**Alta fidelidade (hifi).** Cores, tipografia, espaçamentos, estados e microinterações são finais.
Recriar pixel-perfect, mapeando os tokens abaixo para os equivalentes do codebase.

## Design system
Base: **Industry** (wireframe técnico — Barlow Condensed sobre Barlow, cantos retos, hairlines,
cards como desenhos de linha com marcas de registro `+`, acento aço).
Fonte completa em `design-system/`:
- `styles.css` — a única folha de estilo; contém todos os tokens (`--color-*`, `--font-*`, `--space-*`, `--radius-*`, `--shadow-*`) e as classes de componente (`.btn`, `.card`, `.blueprint`, `.input`, `.tag`, `.table`, `.dialog`, `.nav`, `.duotone`).
- `industry-readme.md` — o guia de uso (o que pode e o que não pode).
- `_ds_manifest.json` — manifesto dos componentes.

Regras herdadas do sistema: sem cantos arredondados; cards transparentes com borda de 1px e as quatro
marcas `+`; botão primário é o único objeto sólido; foco de teclado `outline:2px solid var(--color-accent)`;
ícones **Lucide stroke-width 1.5**.

## Tokens efetivamente usados
Tema claro (do `styles.css`):
- `--color-bg` #f2f2f3 · `--color-text` #1d1f20 · `--color-accent` #5980a6 · ramps 100–900 por papel
- Tipografia: `--font-heading` Barlow Condensed, `--font-body` Barlow

Tema escuro (override local em `.lt-app[data-theme="dark"]`, definido nos protótipos):
```
--color-bg:#172230; --color-surface:#1e2c3b; --color-text:#e6ecf2;
--color-divider: color-mix(in srgb,#e6ecf2 15%, transparent);
--color-accent:#7ba6d0; --color-accent-700:#a8c6e2; --color-accent-100:#22344a;
```
Cores semânticas (bandeiras tarifárias e status):
verde #2f6f3f · amarela #9a5f14 · vermelha P1 #a53b2c · vermelha P2 #7d241a · destaque sidebar #d98a1e.

Classes utilitárias próprias dos protótipos (replicar como componentes):
`.lt-iconbtn` (40×40, borda 1px, hover = borda acento) · `.lt-navitem` (item de sidebar, barra
esquerda 2px #d98a1e quando ativo) · `.lt-selbtn` (toggle de segmento, uppercase 13px) ·
`.lt-overlay` + `.lt-modal` (max-width 520px, `animation: lt-rise .2s ease-out`) ·
`.lt-field` (label uppercase 11px) · `.lt-th/.lt-td/.lt-row` (tabela) · `.lt-dl/.lt-dt/.lt-dd`
(lista de definição em grid 180px 1fr) · `.lt-menu` (dropdown 344px, `top: calc(100% + 10px)`)
· `.lt-mono` (números tabulares, `font-feature-settings:'tnum'`).
Keyframes: `lt-pulse` (indicador ao vivo), `lt-fade`, `lt-rise`.

## Telas
Cada arquivo em `design/` é uma tela ou um app de várias views.

**LumiTrack Landing.dc.html** — página pública de marketing.
**LumiTrack Login.dc.html / Registro / Recuperar Senha** — fluxo de autenticação.
**LumiTrack LGPD.dc.html** — política de privacidade / direitos do titular.

**LumiTrack Home.dc.html** — o app logado. Shell: grid `248px minmax(0,1fr)`, sidebar sticky
`height:100vh` em `--color-accent-900`, topbar com busca, seletor de propriedade, sino de
notificações e badge de alertas (ambos abrem dropdowns `.lt-menu` com backdrop `.lt-menu-bd`).
Views controladas por `state.view`:
- `dashboard` — Painel: consumo ao vivo (kW e R$), consumo do dia com delta, custo do mês,
  bandeira tarifária vigente, gráfico em tempo real (toggle hora/dia), comparação por período
  (toggle kWh/R$, 6/12 meses).
- `prop` — Propriedades, com três níveis navegáveis por `detailId` → `areaId` → `deviceId`:
  lista → detalhe da propriedade → detalhe da área → detalhe do dispositivo. Cada nível repete
  o padrão KPIs + gráfico em tempo real + tabela de filhos.
- `alerts` — Alertas: KPIs (ativos, disparando, episódios) e tabela de regras com alvo e excesso.
- `dist` — Distribuidoras. `profile` — Perfil. `security` — Segurança/MFA com passos
  `idle → setup → backup → disable` (QR, códigos de backup copiáveis, sessões ativas).
- Modais: `property`, `meter`, `area`, `device` (`state.modal`), fecham por Cancelar, X ou backdrop.
- Tema: `state.theme` alterna claro/escuro.

**LumiTrack IoT Login.dc.html** — login do simulador, com narrativa Dispositivos → Broker MQTT → LumiTrack.

**LumiTrack IoT Simulator.dc.html** — dashboard do simulador: criação de redes (modal "Criar rede"),
adição de dispositivos (modal com nome, tópico MQTT e parâmetros iniciais), liga/desliga por
dispositivo com status "publicando — há X segundos", injeção de parâmetros (tensão, potência,
fator de potência, ruído, perfil) e disparo de anomalias.

## Interações e comportamento
- Valores "ao vivo" atualizam por timer (`state.tick` em `componentDidMount`); no app real vêm de
  SSE/WebSocket do backend.
- Dropdowns fecham por clique no backdrop; "Marcar todas como lidas" esvazia a lista
  (notificações são efêmeras, sem histórico) e mostra "Nenhuma notificação nova".
- Toggles de série (hora/dia, kWh/R$, 6/12 meses) trocam só os dados do gráfico.
- Hover de linha de tabela: `color-mix(in srgb, var(--color-accent) 6%, transparent)`.
- Foco de teclado sempre visível (2px acento, offset 2px).

## Estado necessário (mínimo)
`view`, `theme`, `prop` (propriedade selecionada), `detailId`/`areaId`/`deviceId`, `range`,
`rtRange`/`areaUnit`/`compUnit` (unidades e janelas dos gráficos), `modal`, `menu`,
`notifAllRead`, `secStep`/`secCopied`, `tick`.
No simulador: lista de redes, lista de dispositivos com `enabled`, `lastPublishedAt`, parâmetros.

## Dados
Todos os números nos protótipos são **mock** definidos dentro de `renderVals()` / getters da classe.
Substituir pelas APIs reais; manter os formatos pt-BR (vírgula decimal, R$, kWh).

## Assets
- `design/uploads/lumitrack-logo-2.svg` — marca LumiTrack (na sidebar em 26×29 com `filter:brightness(1.25)`).
- Ícones: Lucide, stroke 1.5 (desenhados inline como `<svg><path d="…">` nos protótipos).
- Sem fotografias; se adicionar, usar o wrapper `.duotone` do Industry.

## Como abrir os protótipos
Servir `design/` por HTTP (ex.: `npx serve design`) e abrir cada `.dc.html` no navegador —
os caminhos de `_ds/`, `uploads/` e `support.js` são relativos à pasta `design/`.

## Arquivos
```
design/                       protótipos (.dc.html) + support.js + _ds/ + uploads/
design-system/                Industry: styles.css, guia, manifesto
```
