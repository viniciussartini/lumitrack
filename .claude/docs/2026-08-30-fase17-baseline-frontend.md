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

**Método:** como a extensão React DevTools ("why did this render") exige uma sessão manual de navegador, a contagem foi automatizada via a API pública `React.Profiler` (não a extensão) — envolvendo temporariamente `Header`, `MeterSection` e `RealtimeChartCard` num `<Profiler onRender>` que conta commits, revertido logo em seguida (`git checkout`, nenhum vestígio no código). Um backend descartável (Node puro, fora do repositório) serviu os mesmos endpoints que os componentes chamam, incluindo 60 eventos `reading` reais via SSE — 1 por segundo, 60 segundos — para `frontend/src/pages/property/PropertyDetailsPage.tsx`, a única tela que monta os três componentes ao mesmo tempo. Um script Playwright abriu a página, esperou os 60s e leu a contagem.

| Componente | Renders em 60s (60 leituras SSE) |
|---|---|
| `Header.tsx` | **64** |
| `MeterSection.tsx` | 124 |
| `RealtimeChartCard.tsx` | 189 |

`Header` só lê `isConnected` do `RealtimeContext` — 64 renders em 60 leituras confirma o achado A-06 de forma direta: o `value` do contexto é recriado a cada leitura SSE, então **todo** consumidor re-renderiza, mesmo quem não lê `readingsByMeterId`. `MeterSection`/`RealtimeChartCard` renderizam bem mais que as 60 leituras porque somam A-06 (contexto) com o `setInterval` de 2s do `useLiveMeterReading` (achado B-02) e, no caso do `RealtimeChartCard`, o cascateamento de um pai não memoizado (achado B-07).

## Achado colateral (fora do escopo desta issue)

`frontend/.env` (não versionado, não lido/editado pelo agente) tem `VITE_SSE_URL` apontando para uma URL absoluta — em desenvolvimento local isso força o app pelo caminho *cross-origin* (`connectCrossOrigin`, ticket de uso único), em vez do caminho same-origin direto. Na primeira tentativa desta medição, isso causou um loop de erro 404 contra `/api/iot/stream-ticket` (não mockado) a cada 2s, mascarando os números reais. Contornado *apenas* para esta medição via `VITE_SSE_URL= npm run dev` (variável de ambiente do shell tem prioridade sobre `.env` no Vite) — nenhum arquivo `.env` foi tocado. Vale o usuário confirmar se esse valor em `frontend/.env` é intencional para o setup local atual.
