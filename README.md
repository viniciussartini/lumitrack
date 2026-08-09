# ⚡ LumiTrack

Plataforma web de monitoramento de consumo de energia elétrica. Coleta leituras de **medidores IoT** em tempo real (tensão, corrente, potência, fator de potência) e traduz em **consumo (kWh)** e **custo (R$)**, calculado com a tarifação real do **Grupo B da ANEEL** (REN 1.000/2021) — não com uma média estimada.

---

## Sobre

A conta de luz chega uma vez por mês, fechada, agregada e tarde demais. O LumiTrack ataca isso medindo na origem, tarifando com precisão e avisando em tempo real quando algo sai do padrão.

**O que o produto entrega hoje**, para consumidores do Grupo B (baixa tensão — residencial, rural, comércio e pequena indústria):

- **Ingestão IoT multiprotocolo** — MQTT, Modbus TCP/RTU, EtherNet/IP, Profibus, PROFINET, RS232 e RS485, agregadas em leituras por minuto.
- **Tarifação fiel** — decomposição TUSD + TE com tributos "por dentro", bandeira tarifária sincronizada da fonte oficial da ANEEL, CIP municipal e piso de disponibilidade.
- **Alertas por faixa de potência** com anti-flapping, entregues em tempo real via SSE.
- **Consumo e custo** agregados por hora, dia, mês ou ano, em qualquer nível da hierarquia Propriedade → Área → Aparelho.
- **Exportação de dados pessoais em PDF** (portabilidade, Art. 18 LGPD) e um **simulador de dispositivos IoT** próprio, para operar o produto ponta a ponta sem hardware físico.

Stack: Node.js 24 + Express 5 + Prisma 7 + PostgreSQL no backend; React 19 + Vite 8 + Tailwind 4 no frontend; monólito modular por domínio, MFA opcional e criptografia própria para PII em repouso. A instância pública é uma **demonstração com dados fictícios e cadastro fechado** — ver "O ambiente publicado é uma demonstração", abaixo.

**Roadmap:** as 13 primeiras fases (migração de UI, hierarquia do consumidor, painel em tempo real, quatro fases de endurecimento a partir de auditorias de segurança/conformidade/qualidade/desempenho) estão concluídas. A fase atual entrega a infraestrutura do primeiro deploy público e esta documentação. Planejadas: mais conformidade LGPD, desempenho, robustez do worker IoT — e a maior expansão de domínio desde o lançamento: suporte a **Grupo A** (alta/média tensão), **Mercado Livre de Energia** e **Tarifa Branca**. Roadmap completo, requisitos e ADRs: [`.claude/docs/roadmap.md`](.claude/docs/roadmap.md).

A história completa do projeto — motivação, contexto regulatório brasileiro e a origem acadêmica — está no **[wiki](https://github.com/viniciussartini/lumitrack/wiki)**.

---

## Sobre este repositório

Este é o **portfólio pessoal** do autor — não há empresa, cliente ou operação comercial por trás dele. Mas o repositório não é uma maquete: é tratado como se fosse para produção real desde a arquitetura até o deploy. Quatro auditorias completas (OWASP Top 10:2025, LGPD, qualidade de código, desempenho), quatro fases dedicadas a remediar os achados, decisões de hospedagem e conformidade registradas em ADR ([`0008`](.claude/docs/adr/0008-hospedagem-brasil-oracle-always-free.md) e [`0010`](.claude/docs/adr/0010-demo-publica-free-tier-render-neon.md)), CI com 15 jobs bloqueantes e uma fase própria de infraestrutura de deploy — nada disso é exigido de um portfólio comum, e está aqui porque o objetivo é demonstrar o padrão de um sistema que roda de verdade, não simulá-lo.

**Construído com ajuda de agentes de IA.** Boa parte da implementação, documentação e revisão deste projeto foi feita em colaboração com agentes de IA, guiado por um **kit de desenvolvimento** próprio, criado pelo autor, versionado na raiz do repositório (`CLAUDE.md` + `.claude/`) — contexto de arquitetura, padrões de segurança e qualidade, convenções de git, e skills que automatizam o fluxo de trabalho (planejamento de roadmap, construção de features, correção de bugs, auditorias, preparação de PR). Esse kit é **livre e aberto** junto com o código: qualquer colaborador pode usá-lo como está, propor melhorias a ele ou adaptá-lo para continuar o desenvolvimento do projeto pelo mesmo caminho. Guia completo de uso: [`README-DO-KIT.md`](README-DO-KIT.md).

### O ambiente publicado é uma demonstração

A instância pública do LumiTrack existe para **demonstrar o produto**, não para operar com usuários reais:

- **O cadastro de novos usuários está desabilitado.** As únicas contas são duas contas de demonstração, acessíveis por um botão na tela de login, sem senha trafegar.
- **Todos os dados são fictícios** — CPF/CNPJ matematicamente válidos porém nunca emitidos, e-mails em domínio inexistente, consumo gerado por simulação. Nenhum dado pessoal de pessoa real é coletado ou armazenado.
- **A infraestrutura fica fora do Brasil** (Render + Neon, free tier), o que é aceitável justamente porque não há dado pessoal de titular real na aplicação. A exposição se limita aos registros de acesso dos visitantes, e isso está declarado de forma transparente no aviso de privacidade em vez de omitido.

**Compromisso:** se o projeto passar a operar com usuários reais — cadastro aberto, dado pessoal de verdade —, a hospedagem **migra para infraestrutura brasileira antes disso**, para atender à LGPD e à legislação brasileira. Esse caminho não é uma intenção: já está implementado e versionado neste repositório (`docker-compose.yml`, `deploy/`), documentado como "Caminho B" em [`.claude/docs/DEPLOY.md`](.claude/docs/DEPLOY.md).

O raciocínio completo, incluindo o que se ganha e o que se perde em conformidade com essa escolha, está na [ADR-0010](.claude/docs/adr/0010-demo-publica-free-tier-render-neon.md).

---

## Documentação

- [**Backend**](backend/README.md)
- [**Frontend**](frontend/README.md)
- **Mobile** *(planejado — escopo e stack ainda não decididos)*
- [**Simulador IoT**](iot-simulator/README.md)

---

## Como participar

### Contribuindo neste repositório

Issues e Pull Requests são bem-vindos. Abra uma issue usando um dos [templates](.github/ISSUE_TEMPLATE/) (bug, feature ou achado de auditoria) antes de submeter um PR grande, para alinhar escopo — o projeto segue [Conventional Commits](https://www.conventionalcommits.org/) e o padrão de revisão descrito no [template de PR](.github/PULL_REQUEST_TEMPLATE.md).

### Fazendo fork

Você pode criar seu próprio fork livremente. Ao fazê-lo:

- **Preserve a atribuição** — referencie este repositório ([`viniciussartini/lumitrack`](https://github.com/viniciussartini/lumitrack)) e o autor original em qualquer distribuição, publicação ou README derivado.
- **A licença é copyleft forte** — ver "Conformidade para forks comerciais" abaixo antes de operar publicamente, principalmente se o fork tratar dado pessoal de titular real (cadastro aberto).

## Conformidade para forks comerciais

> Isto descreve obrigações legais aplicáveis; **não é parecer jurídico**. Consulte um advogado ou encarregado antes de operar um fork com dado pessoal real.

Um fork comercial — ou qualquer fork que abra cadastro público para titulares reais — assume duas obrigações que este repositório, na configuração de demonstração, hoje não precisa cumprir:

- **GPL-3.0 (copyleft forte):** o fork precisa **permanecer aberto** sob a mesma licença — publicar o código-fonte modificado e preservar a atribuição ao projeto original. Não é possível fechar o código de um derivado nem redistribuí-lo sob licença mais restritiva. Ver [`LICENSE`](LICENSE).
- **LGPD (Lei nº 13.709/2018):** ao tratar dado pessoal de titular real (não mais o seed sintético de demonstração), o fork se torna **controlador** e assume, entre outras: base legal definida por operação de tratamento, canal de comunicação com o titular, registro das operações de tratamento (ROPA), contrato de tratamento (DPA) com cada operador contratado (SMTP, hospedagem, APM), e Cláusulas-Padrão Contratuais (SCC) se algum operador estiver fora do Brasil. A [ADR-0008](.claude/docs/adr/0008-hospedagem-brasil-oracle-always-free.md) documenta a configuração que **elimina** boa parte dessas obrigações — hospedagem 100% no Brasil, sem operador estrangeiro, cadastro público fechado — e o stack que a implementa está pronto no repositório (Caminho B do [`DEPLOY.md`](.claude/docs/DEPLOY.md)). É o ponto de partida mais barato para um fork que precise tratar dado real. A demo pública deste repositório **não** usa essa configuração hoje: ela roda em free tier fora do Brasil porque não tem usuário real ([ADR-0010](.claude/docs/adr/0010-demo-publica-free-tier-render-neon.md)) — um fork com cadastro aberto **não pode** simplesmente copiar essa escolha, porque é exatamente ela que reabre as obrigações acima.

---

## Licença

Este projeto está licenciado sob a [GNU General Public License v3.0](LICENSE).
