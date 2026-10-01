# Trama como estado persistente e auditável de raciocínio

## Definição central

**Trama é um sistema para persistir e auditar o estado de raciocínio sobre uma
situação, e um agente que conduz a investigação necessária para fazê-lo
evoluir.**

Ele não guarda somente conhecimento, arquivos ou anotações. Ele registra o que
se entende até aqui, por que se entende isso, o que ainda é incerto e qual é o
próximo movimento que pode reduzir essa incerteza. Por isso, Trama serve tanto
para situações da vida e do trabalho quanto para investigações formais: qualquer
contexto complexo que precise ser compreendido, acompanhado e conduzido ao
longo do tempo.

Uma analogia útil é: **Git para raciocínio**. Assim como Git preserva versões e
diferenças de um código, Trama preserva versões e diferenças de uma leitura
sobre o mundo — sem fingir que essa leitura é imutável ou definitiva.

## O que constitui o estado

O estado de uma Trama representa uma interpretação estruturada e provisória de
uma situação. Seus elementos básicos incluem:

- **Problem**: a situação, tensão, decisão ou assunto a compreender;
- **Hypothesis**: explicação, cenário, solução ou julgamento provisório;
- **Condition**: condição necessária, suficiente, impeditiva ou a verificar;
- **Question**: pergunta que, se respondida, pode alterar o entendimento;
- **Evidence**: material preservado que informa a análise;
- **Finding**: determinação explicitamente aprovada e fundamentada;
- **relações semânticas e acionáveis**: conexões como apoiar, contradizer,
  qualificar, depender de, exigir verificação, desbloquear, gerar uma pergunta
  ou demandar uma ação.

Esses objetos não formam apenas uma coleção. As relações entre eles expressam a
estrutura do problema: qual evidência informa qual hipótese, qual condição
permanece aberta, qual pergunta é relevante e que ação pode produzir a próxima
evidência.

## Proveniência, revisão e auditabilidade

Todo elemento relevante deve preservar sua proveniência: de onde veio, quando
foi registrado, por quem ou por qual processo foi proposto, e que evidência ou
justificativa externa sustenta sua interpretação. Mudanças não apagam o estado
anterior; elas criam revisões que tornam possível recuperar a evolução de um
julgamento e entender por que ele mudou.

Isso não significa armazenar o *chain-of-thought* interno de um modelo. O que
Trama preserva são **justificativas externas, legíveis e auditáveis**: fatos
citáveis, fontes, evidências, premissas declaradas, relações e decisões. É um
**reasoning ledger** — um livro-razão do raciocínio que pode ser inspecionado e
contestado sem depender de pensamentos privados ou opacos.

Hipóteses, condições e julgamentos podem ser revisados, fortalecidos,
enfraquecidos, substituídos ou descartados. O histórico continua acessível;
revisar não é reescrever o passado.

## Sessões como transações de raciocínio

Uma sessão é a unidade de trabalho investigativo. Ela parte de um estado
conhecido, reúne novos insumos e produz uma proposta explícita de mudança:

```text
State n → Session → Delta → State n+1
```

- **State n** é o entendimento persistido antes da sessão;
- **Session** é a conversa, análise ou atividade que examina o caso;
- **Delta** é o conjunto de criações, revisões, relações, perguntas e ações
  propostas;
- **State n+1** é o novo entendimento, somente depois de o delta ser aceito.

Ao fim de uma sessão, o agente não deve declarar unilateralmente uma nova
verdade. Ele propõe o delta com suas justificativas e proveniência. O usuário
pode revisar, aceitar, rejeitar ou ajustar cada mudança antes de ela compor o
estado persistido. Esse mecanismo separa descoberta, proposta e aprovação.

## O papel do agente investigativo

O agente não é apenas um registrador de mensagens. Sua função é trabalhar sobre
o estado atual para orientar o futuro da investigação. Em particular, ele deve
ser capaz de:

- identificar lacunas de informação e ambiguidades relevantes;
- reconhecer condições ainda não resolvidas e dependências entre elas;
- formular ou refinar hipóteses sem convertê-las prematuramente em fatos;
- propor as próximas perguntas com maior poder de discriminação;
- sugerir ações, fontes ou evidências que possam destravar o caso;
- explicar que mudança de estado está propondo e por quê.

Assim, Trama comprime o passado em um estado navegável e orienta o futuro por
meio de perguntas e ações concretas. O objetivo não é reproduzir toda a
conversa anterior, mas preservar a parte que continua relevante para decidir o
que investigar, fazer ou revisar agora.

## Implicação arquitetural

A arquitetura deve tratar o estado investigativo, os deltas propostos, as
aprovações e a trilha de auditoria como conceitos de primeira classe. Arquivos,
conversas, bancos de conhecimento e modelos de IA podem fornecer contexto e
capacidade, mas não substituem essa semântica. O valor específico de Trama está
em manter a continuidade verificável entre aquilo que se sabia, aquilo que foi
descoberto, aquilo que se propôs mudar e aquilo que foi efetivamente aceito.
