# ADR-0016 — Service pode importar Repository de outro módulo

- **Data:** 2026-08-27
- **Status:** aceita
- **Branch/Issue relacionada:** issue #299 (Fase 15.5)

## Contexto

`03-arquitetura.md` documenta a cadeia de camadas de um módulo (`*.routes.ts → *.controller.ts → *.service.ts → *.repository.ts`) e diz que "módulos não leem tabelas uns dos outros diretamente", mas não esclarece se um `*.service.ts` pode importar o `*.repository.ts` de **outro** módulo. Na ausência dessa definição, o código já resolveu a questão sozinho: 9 arquivos de service importam repository de outro módulo — `consumption.service.ts` (meter/property/area/device/distributor/tariff-flag), `export.service.ts` (user/property/distributor/alert/area/device), `simulation.service.ts`, `meter-reading.service.ts`, `meter.service.ts`, `area.service.ts`, `property.service.ts`, `device.service.ts` e `alert-event.service.ts`. Os helpers compartilhados `resolveRootProperty`/`resolveMeterTarget` (`backend/src/shared/targetResolution.ts`, Fase 15) foram desenhados exatamente para operar sobre repositories de módulos diferentes — a resolução de posse bottom-up (`MeterReading/Alert → Meter → (Property | Area | Device) → Property → User`) não é possível de outra forma sem duplicar leitura de tabela entre módulos.

Sem essa regra registrada, o padrão fica em risco de ser "corrigido" por engano numa refatoração ou numa revisão de código futura, ou de nunca ser generalizado com confiança para módulos novos.

## Decisão

Um `*.service.ts` pode importar e chamar métodos do `*.repository.ts` de outro módulo diretamente, sem precisar passar pelo `*.service.ts` daquele módulo. Consultas agregadas ou de resolução de posse que precisam ler dados de mais de um domínio (ex.: `ConsumptionService` juntando leituras de `Meter` com metadados de `Property`/`Area`/`Device`) são o caso de uso legítimo — a alternativa de sempre atravessar o service do outro módulo geraria acoplamento a regra de negócio alheia e chamadas HTTP/domínio artificiais dentro do próprio backend.

## Alternativas consideradas

- **Sempre passar pelo `*.service.ts` do módulo dono** — descartada: para leituras puramente agregacionais (sem regra de negócio do módulo alheio envolvida), isso obrigaria a instanciar e acoplar services inteiros só para reexportar uma consulta de repository, sem ganho de encapsulamento real.
- **Extrair um módulo/camada de agregação própria para consultas cross-domínio** — descartada por over-engineering: os helpers de `shared/targetResolution.ts` já cumprem esse papel para o caso mais comum (resolução de posse); criar uma camada genérica adicional sem um segundo caso de uso motivador violaria YAGNI.

## Consequências

- Positivas: o padrão já em uso nos 9 services fica formalmente sancionado — revisão de código e auditorias de qualidade não devem mais apontá-lo como desvio; módulos novos que precisem de leitura agregada cross-domínio têm um precedente documentado a seguir.
- Negativas/custos: um `*.repository.ts` deixa de ser "privado" ao seu módulo — qualquer mudança de contrato nele agora pode ter consumidores em módulos diferentes do seu, exigindo checar os usos cross-módulo (`grep` pelo nome do repository) antes de alterar sua assinatura.
- **Continua proibido:** um service importar framework/infra de outro módulo (já coberto pela regra `no-express-in-domain` do dependency-cruiser) ou pular a camada de repository, acessando Prisma diretamente fora do módulo dono do dado.
