# ADR-0015 — Monitor externo de disponibilidade para a produção (VPS)

- **Data:** 2026-08-23
- **Status:** aceita
- **Branch/Issue relacionada:** issue #265 (épico #259, Fase 14 do roadmap)
- **Resolve:** o item "monitor externo para a produção" da Fase 14; aplica à VPS o raciocínio jurídico já estabelecido pela ADR-0011 (substituída pela ADR-0013 no que toca ao keep-alive, mas preservada no que toca à análise de transferência internacional de um ping externo).

## Contexto

A ADR-0009 aceitou, como custo do monitoramento auto-hospedado (Uptime Kuma na própria VM), que uma queda da VM inteira não é detectada — o vigia cai junto com o que deveria vigiar. Hoje a produção (VPS Hostinger, `lumitrack.app.br`) não tem nenhum monitor externo.

O bloqueio nunca foi técnico — é a pergunta de conformidade que a ADR-0011 já respondeu para o Render: **um ping HTTP externo e não-autenticado em `/health` configura transferência internacional de dado pessoal?** A resposta da ADR-0011 foi não, porque o endpoint não tem autenticação, não expõe dado pessoal e não é registrado em log de acesso — o próprio raciocínio, não o mecanismo (UptimeRobot), é o que se aplica aqui.

**Diferença que exige verificação antes de reaproveitar a conclusão:** a ADR-0011 foi escrita para o `/health` do Render, exposto publicamente por padrão. Na VPS, `deploy/Caddyfile` hoje só expõe `handle /api/*` — uma requisição a `/health` cai no fallback do SPA (`try_files {path} /index.html`), não alcança o backend. Adotar um monitor aqui exige primeiro expor o endpoint.

**Verificação feita nesta ADR** (não presumida): `backend/src/app.ts:147-149` —

```ts
app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() })
})
```

Sem autenticação (roteado antes de qualquer middleware de auth); resposta é só `status`/`timestamp`, sem dado pessoal; e `pinoHttp` está configurado com `autoLogging: { ignore: (req) => req.url === "/health" }` (`app.ts:160`) — não gera log de acesso. As três premissas da ADR-0011 se confirmam para este endpoint.

## Decisão

1. **`deploy/Caddyfile` passa a expor `/health`**, roteado para o backend, com as mesmas premissas de segurança (sem autenticação, sem PII, sem log de acesso) — sem mudar o comportamento do endpoint em si, só o alcance de rede.
2. **Um ping HTTP não-autenticado em `/health` da VPS não configura transferência internacional de dado pessoal**, pela mesma razão da ADR-0011: não há dado pessoal no payload, nem log de acesso persistido do lado do provedor de monitoramento além do que ele mesmo decidir guardar sobre o próprio ping (fora do controle do LumiTrack, e sem conteúdo de titular para reter).
3. **Um monitor externo gratuito (ex.: UptimeRobot) pode ser configurado apontando para `https://lumitrack.app.br/health`** — ação do usuário fora deste repositório (criar o monitor na ferramenta escolhida), não implementada por esta ADR.
4. **Aplicar a mudança no `Caddyfile` a produção é ação manual do usuário** (deploy na VPS, mesmo procedimento das mudanças anteriores de `Caddyfile`) — esta ADR e o commit associado só alteram o arquivo versionado.

## Alternativas consideradas

- **Não expor `/health` e continuar sem monitor externo** — descartada: mantém a lacuna de observabilidade que a ADR-0009 já registrou como custo aceito, sem necessidade — a barreira era só a análise jurídica, já resolvida.
- **Expor um endpoint diferente, mais restrito** (ex.: só `200 OK` sem corpo) — descartada: o `/health` atual já não tem nada a esconder (sem PII, sem autenticação); criar um segundo endpoint só para o monitor duplicaria superfície sem ganho de conformidade.
- **Monitor pago com SLA/alertas mais avançados** — fora de escopo: o projeto é portfólio (mesma restrição de custo zero da ADR-0008); UptimeRobot free tier já resolve a detecção, que é o problema real.

## Consequências

**Positivas**
- Fecha a metade que faltava do buraco de observabilidade da ADR-0009 (detectar a VM inteira fora do ar) sem custo e sem reabrir a análise de transferência internacional além do que a ADR-0011 já concluiu.
- Nenhuma mudança de comportamento do `/health` em si — só o alcance de rede.

**Negativas/custos**
- A outra metade do buraco de observabilidade (Uptime Kuma sem canal de notificação configurado) continua fora do escopo desta ADR — é configuração de minutos no painel do Kuma, ação do usuário.
- Expor `/health` publicamente cria uma superfície mínima adicional (qualquer um pode confirmar que a aplicação está no ar) — aceito, é exatamente o propósito de um health check e não vaza nada além disso.
