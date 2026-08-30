# Baseline de frontend — Fase 17 (tempo real e bundle)

> Medido antes de qualquer mudança da Fase 17, para comparação no fechamento da fase. Ver `.claude/docs/roadmap.md`, seção "Fase 17 — Frontend: tempo real e bundle".

## Bundle inicial

`ANALYZE=true npm run build` (frontend), sem nenhuma mudança de code-splitting ainda:

| Arquivo | Tamanho | Gzip |
|---|---|---|
| `dist/index.html` | 3.03 kB | 1.61 kB |
| `dist/assets/index-*.css` | 73.86 kB | 13.65 kB |
| `dist/assets/index-*.js` | 1.305,88 kB | **382,84 kB** |

Um único chunk JS de ~383 kB gzip — confirma numericamente o achado M-04 (nenhuma rota lazy-loaded, `recharts`/`react-markdown` inteiros no bundle de `/login`). `dist/stats.html` (treemap do `rollup-plugin-visualizer`) não é commitado (artefato de build, `dist/` está no `.gitignore`) — para regenerar: `ANALYZE=true npm run build` dentro de `frontend/`.

## Contagem de renders (60s no equivalente ao Painel)

**Método:** como a extensão React DevTools ("why did this render") exige uma sessão manual de navegador, a contagem foi automatizada via a API pública `React.Profiler` (não a extensão) — envolvendo temporariamente `Header`, `MeterSection` e `RealtimeChartCard` num `<Profiler onRender>` que conta commits, revertido logo em seguida (`git checkout`, nenhum vestígio no código). Um backend descartável (Node puro, fora do repositório) serviu os mesmos endpoints que os componentes chamam, incluindo 60 eventos `reading` reais via SSE — 1 por segundo, 60 segundos — para `frontend/src/pages/property/PropertyDetailsPage.tsx`, a única tela que monta os três componentes ao mesmo tempo. Um script Playwright abriu a página, esperou os 60s e leu a contagem. A mesma metodologia foi reaplicada depois de habilitar o React Compiler, para medir o efeito direto (mesmo cenário, mesmas 60 leituras).

| Componente | Antes (sem compiler) | Depois (com React Compiler) | Variação |
|---|---|---|---|
| `Header.tsx` | 64 | **4** | −94% |
| `MeterSection.tsx` | 124 | 94 | −24% |
| `RealtimeChartCard.tsx` | 189 | **10** | −95% |

`Header` só lê `isConnected` do `RealtimeContext` — 64 renders em 60 leituras confirmava o achado A-06 de forma direta: o `value` do contexto é recriado a cada leitura SSE, então **todo** consumidor re-renderizava, mesmo quem não lê `readingsByMeterId`. O React Compiler (issue #324) resolveu isso quase por completo para `Header` e `RealtimeChartCard` — a memoização automática evita que um componente re-renderize quando os valores que ele efetivamente lê não mudaram, mesmo com o objeto do contexto sendo recriado. `MeterSection` caiu bem menos (124→94): ele lê `reading`/`isStale` diretamente de `useLiveMeterReading`, valores que **de fato mudam** a cada leitura e a cada 2s (achado B-02) — o compiler não elimina re-render de dado que genuinamente mudou; só a separação do contexto (item 3/#319) e o fim do `setInterval` incondicional (item 4/#325) resolvem o restante.

## Efeito do React Compiler no bundle

O mesmo build (`ANALYZE=true npm run build`) depois de habilitar o compiler (issue #324): `dist/assets/index-*.js` foi de 1.305,88 kB (382,84 kB gzip) para **1.398,71 kB (418,77 kB gzip)** — o código de memoização automática que o compiler injeta pesa ~36 kB gzip a mais. Trade-off esperado e aceito: menos trabalho de render em troca de mais código estático: o ganho de renders eliminados (tabela abaixo) supera o custo do bundle, e o code-splitting do item 7 ainda reduz o chunk inicial de qualquer forma.

## Achado colateral (fora do escopo desta issue)

`frontend/.env` (não versionado, não lido/editado pelo agente) tem `VITE_SSE_URL` apontando para uma URL absoluta — em desenvolvimento local isso força o app pelo caminho *cross-origin* (`connectCrossOrigin`, ticket de uso único), em vez do caminho same-origin direto. Na primeira tentativa desta medição, isso causou um loop de erro 404 contra `/api/iot/stream-ticket` (não mockado) a cada 2s, mascarando os números reais. Contornado *apenas* para esta medição via `VITE_SSE_URL= npm run dev` (variável de ambiente do shell tem prioridade sobre `.env` no Vite) — nenhum arquivo `.env` foi tocado. Vale o usuário confirmar se esse valor em `frontend/.env` é intencional para o setup local atual.
