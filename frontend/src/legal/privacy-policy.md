# Política de Privacidade do LumiTrack

**Versão 1.0 — vigente desde 27/06/2026**

Esta Política de Privacidade descreve como o LumiTrack ("nós", "plataforma")
coleta, utiliza, armazena e protege os dados pessoais dos seus usuários
("você", "titular"), em conformidade com a Lei Geral de Proteção de Dados
Pessoais — LGPD (Lei nº 13.709/2018).

Ao marcar a caixa de aceite no cadastro, você declara ter lido e concordado
com os termos abaixo.

## 1. Quem trata os seus dados (controlador)

O LumiTrack é o controlador dos dados pessoais tratados na plataforma.
Dúvidas, solicitações ou exercício de direitos podem ser enviados para o
e-mail de contato do encarregado (DPO) informado no rodapé da plataforma.

> Aviso: este é um documento-modelo gerado como parte de uma auditoria de
> segurança e conformidade. Antes do uso em produção com usuários reais, os
> dados de identificação do controlador e do encarregado (DPO) devem ser
> completados e o texto revisado por um profissional jurídico.

## 2. Quais dados coletamos

| Categoria | Dados | Finalidade |
|---|---|---|
| Identificação | Nome, sobrenome ou razão social/nome fantasia, e-mail | Criar e gerenciar sua conta, autenticação |
| Documentos | CPF (pessoa física) ou CNPJ (pessoa jurídica) | Identificação única do titular, prevenção a fraude |
| Senha | Hash da senha (nunca em texto claro) | Autenticação segura |
| Localização | Endereço, cidade, estado e CEP das propriedades cadastradas | Vincular o consumo de energia ao imóvel monitorado |
| Consumo de energia | Histórico de consumo (kWh) e custo estimado (R$) por propriedade, área ou dispositivo | Geração de relatórios, simulações e alertas de consumo |
| Dispositivos e IoT | Nome, marca, modelo e potência de aparelhos; configuração técnica de conectividade (protocolo, host, porta, endereço) | Monitoramento de consumo em tempo real |
| Sessão | Tokens de autenticação, data de login/logout | Manter sua sessão segura e permitir revogação de acesso |
| Consentimento | Data do aceite e versão da Política aceita | Comprovar a base legal do tratamento (Art. 7º/8º da LGPD) |

Não coletamos dados sensíveis (saúde, biometria, origem racial, convicção
religiosa ou política, etc.).

## 3. Base legal do tratamento

- **Consentimento** (Art. 7º, I): obtido no momento do cadastro, mediante
  aceite explícito desta Política e dos Termos de Uso.
- **Execução de contrato** (Art. 7º, V): necessário para prestar o serviço de
  monitoramento de consumo de energia que você contratou.
- **Cumprimento de obrigação legal/regulatória** (Art. 7º, II): quando
  aplicável, para fins fiscais ou de auditoria.

## 4. Com quem compartilhamos seus dados

- **Provedor de e-mail (SMTP)**: utilizado exclusivamente para o envio de
  e-mails de recuperação de senha. O provedor atua como operador de dados
  nos termos do Art. 39 da LGPD.
- Não compartilhamos seus dados pessoais com terceiros para fins de
  publicidade, venda ou qualquer finalidade não descrita nesta Política.
- Não realizamos transferência internacional de dados além do necessário
  para o funcionamento do provedor de e-mail, quando aplicável.

## 5. Como protegemos seus dados

- Senhas armazenadas com hash criptográfico (bcrypt), nunca em texto claro.
- Conexões protegidas por cabeçalhos de segurança HTTP e TLS/HTTPS em produção.
- Controle de acesso: cada usuário só acessa os próprios dados — verificado
  em toda requisição.
- Limitação de tentativas (*rate limiting*) em endpoints de autenticação,
  para reduzir o risco de ataques de força bruta.
- Tokens de sessão podem ser revogados a qualquer momento (logout).

## 6. Seus direitos como titular (Art. 18 da LGPD)

Você pode, a qualquer momento:

- **Confirmar e acessar** os dados que mantemos sobre você;
- **Corrigir** dados incompletos, inexatos ou desatualizados;
- **Eliminar** sua conta e os dados associados (sujeito às hipóteses de
  retenção legal, quando aplicável);
- **Solicitar a portabilidade** dos seus dados a outro fornecedor de serviço;
- **Revogar o consentimento** e se opor a tratamentos realizados com base nele;
- **Solicitar informações** sobre o compartilhamento de seus dados.

Você pode exercer os direitos de acesso, retificação e eliminação
diretamente na plataforma, na área de configurações da sua conta. Para os
demais direitos, entre em contato pelo e-mail do encarregado (DPO).

## 7. Retenção e eliminação dos dados

Mantemos seus dados enquanto sua conta estiver ativa e pelo tempo necessário
para cumprir as finalidades descritas nesta Política. Ao excluir sua conta,
os dados pessoais e os dados de consumo associados são removidos da nossa
base de dados, exceto quando a retenção for exigida por obrigação legal.

## 8. Alterações nesta Política

Esta Política pode ser atualizada para refletir mudanças no serviço ou na
legislação aplicável. Alterações materiais terão uma nova versão registrada
nesta página, e poderemos solicitar um novo aceite quando isso ocorrer.

## 9. Contato

Em caso de dúvidas sobre esta Política ou sobre o tratamento dos seus dados
pessoais, entre em contato com o encarregado de proteção de dados (DPO) do
LumiTrack pelo e-mail informado na plataforma.
