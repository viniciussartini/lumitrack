# ⚡ LumiTrack

Plataforma web de monitoramento de consumo de energia elétrica. Coleta leituras de **medidores IoT** em tempo real (tensão, corrente, potência, fator de potência) e traduz em **consumo (kWh)** e **custo (R$)**, calculado com a tarifação real dos **Grupos tarifários da ANEEL**.

---

## Sobre

**O que o produto entrega hoje**, para consumidores do Grupo B (baixa tensão — residencial, rural, comércio e pequena indústria):

- **Ingestão IoT multiprotocolo** — MQTT, Modbus TCP/RTU, EtherNet/IP, Profibus, PROFINET, RS232 e RS485, agregadas em leituras por minuto.
- **Tarifação fiel** — decomposição TUSD + TE com tributos "por dentro", bandeira tarifária sincronizada da fonte oficial da ANEEL, CIP municipal e piso de disponibilidade.
- **Alertas por faixa de potência** com anti-flapping, entregues em tempo real via SSE.
- **Consumo e custo** agregados por hora, dia, mês ou ano, em qualquer nível da hierarquia Propriedade → Área → Dispositivo.
- **Exportação de dados pessoais em PDF** (portabilidade, Art. 18 LGPD) e um **simulador de dispositivos IoT** próprio, para operar o produto ponta a ponta sem hardware físico.

Stack: Node.js + Express + Prisma + PostgreSQL no backend; React + Vite + Tailwind no frontend; monólito modular por domínio, MFA opcional e criptografia própria para PII em repouso. A instância pública é uma **demonstração com dados fictícios e cadastro fechado** — ver "O ambiente publicado é uma demonstração", abaixo.

### Roadmap

- Simulador Modbus TCP/RTU.
- Hardware para ingestão de medição real de grandezas elétricas e qualidade de energia.
- Suporte a **Grupo A** (alta/média tensão), **Mercado Livre de Energia** e **Tarifa Branca**.
- Testes com medidores comerciais.

A história completa do projeto — motivação, contexto regulatório brasileiro e a origem acadêmica — está no **[wiki](https://github.com/viniciussartini/lumitrack/wiki)**.

---

## Sobre este repositório

Este repositório é um projeto de **portfólio pessoal** tratado como uma aplicação de nível de produção. O objetivo é manter uma estrutura sólida e pronta para evoluir para o mercado.

**Construído com ajuda de agentes de IA.** Boa parte da implementação, documentação e revisão deste projeto foi feita em colaboração com agentes de IA, guiado por um **kit de desenvolvimento** próprio, criado pelo autor, versionado na raiz do repositório — contexto de arquitetura, padrões de segurança e qualidade, convenções de git, e skills que automatizam o fluxo de trabalho (planejamento de roadmap, construção de features, correção de bugs, auditorias, preparação de PR). Esse kit é **livre e aberto** junto com o código: qualquer pessoa que desejar colaborar no projeto, pode usá-lo como está, propor melhorias a ele ou adaptá-lo para continuar o desenvolvimento do projeto pelo mesmo caminho. Guia completo de uso: [`README-DO-KIT.md`](README-DO-KIT.md).

### O ambiente publicado é uma demonstração

A instância pública do LumiTrack existe para **demonstrar o produto**, não para operar com usuários reais:

- **O cadastro de novos usuários está desabilitado.** As únicas contas são duas contas de demonstração, acessíveis por um botão na tela de login.
- **Todos os dados são fictícios** — CPF/CNPJ matematicamente válidos porém nunca emitidos, e-mails em domínio inexistente, consumo gerado por simulação. Nenhum dado pessoal de pessoa real é coletado ou armazenado.

**Compromisso:** se o projeto passar a operar com usuários reais — cadastro aberto, dado pessoal de verdade —, a hospedagem **já está em infraestrutura brasileira**, para atender à LGPD e à legislação brasileira.

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
- **LGPD (Lei nº 13.709/2018):** ao tratar dado pessoal de titular real, o fork se torna **controlador** e assume, entre outras: base legal definida por operação de tratamento, canal de comunicação com o titular, registro das operações de tratamento (ROPA), contrato de tratamento (DPA) com cada operador contratado (SMTP, hospedagem, APM), e Cláusulas-Padrão Contratuais (SCC) se algum operador estiver fora do Brasil.

---

## Licença

Este projeto está licenciado sob a [GNU General Public License v3.0](LICENSE).
