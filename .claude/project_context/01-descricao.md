# 01 — Descrição do Projeto

## O que é

**LumiTrack** é uma plataforma web de monitoramento de consumo de energia elétrica. Ela coleta leituras de **medidores IoT** em tempo real (tensão, corrente, potência, fator de potência) e as traduz em duas grandezas que o usuário entende: **consumo em kWh** e **custo em reais**, calculado com a tarifação real do **Grupo B da ANEEL** (REN 1.000/2021) — não com uma média estimada.

## O problema

A conta de luz chega uma vez por mês, fechada, agregada e tarde demais. O consumidor brasileiro não consegue responder três perguntas básicas:

1. **Onde** a energia está indo — qual cômodo, qual aparelho.
2. **Quanto** cada um custa de fato, considerando TUSD, TE, ICMS/PIS/COFINS, bandeira tarifária vigente e CIP municipal.
3. **Quando** algo saiu do normal — um equipamento puxando fora da faixa esperada, uma anomalia que só apareceria na fatura 30 dias depois.

O LumiTrack ataca as três: mede na origem, tarifa com precisão e avisa em tempo real.

## Usuário-alvo

Consumidores do **Grupo B (baixa tensão)** no Brasil, pessoa física ou jurídica:

- **B1 — residencial:** quem quer entender e reduzir a própria conta.
- **B2 — rural.**
- **B3 — demais:** comércio, serviços e pequena indústria, onde energia é custo operacional e um equipamento defeituoso tem impacto direto no resultado.

Grupo A (alta/média tensão, tarifa binômia) está fora do escopo atual.

## Modelo de domínio

Uma hierarquia de três níveis, com medição opcional em qualquer um deles:

```text
Propriedade (unidade consumidora, com distribuidora e sistema elétrico)
  └─ Área (cômodo, setor, galpão)
       └─ Aparelho (equipamento individual)
```

Um **Medidor** se vincula a exatamente um alvo — Propriedade, Área **ou** Aparelho — e no máximo um medidor por alvo. Isso permite tanto medir a unidade inteira quanto instrumentar só a geladeira, sem mudar o modelo. A posse de qualquer recurso é resolvida pela cadeia `Medidor → alvo → Propriedade → Usuário`.

## O que o produto entrega hoje

- **Ingestão IoT multiprotocolo** — MQTT, Modbus TCP/RTU, EtherNet/IP, Profibus, PROFINET, RS232 e RS485; amostras (~1/s) agregadas em leituras por minuto com médias ponderadas por tempo.
- **Consumo e custo** agregados por hora, dia, mês ou ano, em qualquer nível da hierarquia.
- **Tarifação fiel** — decomposição TUSD + TE com tributos calculados "por dentro", bandeira tarifária vigente, CIP municipal e piso de disponibilidade (30/50/100 kWh conforme mono/bi/trifásico).
- **Alertas por faixa de potência** — dispara quando a potência ativa sai de `referência ± tolerância%`, com anti-flapping por amostras consecutivas; cada episódio vira um evento histórico com duração e estatísticas.
- **Tempo real** — leituras, disparos de alerta e notificações entregues ao navegador via SSE.
- **Relatórios** e exportação de dados pessoais em PDF (portabilidade, Art. 18 LGPD).
- **Segurança e conformidade** — MFA opcional (TOTP) com step-up na re-inscrição, RBAC mínimo, trilha de auditoria com redação de PII, criptografia de PII em repouso, guard de SSRF nas conexões de saída, consentimento versionado e expurgo automático por retenção. Quatro auditorias completas em 2026-08-05 (OWASP Top 10:2025, LGPD, qualidade e desempenho) e quatro fases dedicadas a remediá-las (10 a 13): os achados 🔴 Crítico e 🟠 Alto estão fechados, e nenhum achado acima de 🟢 Baixo permanece aberto. Laudos em `.claude/docs/2026-08-05-*-audit.md` (o `AUDITORIA_SEGURANCA.md` é o documento histórico anterior, preservado para rastreabilidade).
- **Simulador de dispositivos IoT** (`iot-simulator/`) e seed de demonstração, para operar o produto ponta a ponta sem hardware físico.

## Estágio

Projeto **solo, maduro e em evolução** — não é greenfield. O backend tem 16 módulos de domínio, a suíte de testes cobre unidade, integração HTTP e E2E (Playwright), e o CI roda 15 jobs com gates de lint, build, teste, `npm audit` e secret scanning (gitleaks) para os três pacotes. As decisões estruturais já estão tomadas e registradas em `.claude/docs/adr/` (8 ADRs); o que permanece em aberto está em `07-decisoes-em-aberto.md`.

As Fases 1–13 do `.claude/docs/roadmap.md` estão concluídas. O produto está **no gate de go-live**: o código exigido pela ADR-0008 para expor o ambiente publicamente está pronto (gates #1–#5), e o que falta é infraestrutura e operação — provisionamento, backup testado e rotação de chaves de produção (Fase 13.5). Nenhum artefato de deploy existe no repositório ainda.
