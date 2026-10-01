export type ActionDecision = "record_step" | "set_waiting" | "complete_action" | "reschedule" | "clarify" | "change_topic" | "multiple_updates";
export interface ActionEvalSample {
  id: string; category: string; message: string; context: string; expected: string;
  family?: string; variant?: "canonical" | "paraphrase" | "contrastive" | "adversarial";
  locale?: "pt-BR" | "en-US"; provenance?: "hand-authored" | "user-derived" | "controlled-generation";
  pairId?: string; split?: "development" | "holdout"; expectedDecision?: ActionDecision;
}

export const decisionLabels: Record<ActionDecision, string> = {
  record_step: "Registrar passo",
  set_waiting: "Registrar e aguardar",
  complete_action: "Concluir ação",
  reschedule: "Alterar prazo",
  clarify: "Pedir esclarecimento",
  change_topic: "Mudar de assunto ou rumo",
  multiple_updates: "Separar múltiplas atualizações"
};

export const expectedDecisionById: Record<string, ActionDecision> = {
  "action-001": "record_step", "action-002": "record_step", "action-003": "record_step",
  "action-004": "set_waiting", "action-005": "set_waiting", "action-006": "set_waiting",
  "action-007": "clarify", "action-008": "complete_action", "action-009": "complete_action",
  "action-010": "complete_action", "action-011": "clarify", "action-012": "clarify",
  "action-013": "complete_action", "action-014": "change_topic", "action-015": "change_topic",
  "action-016": "multiple_updates", "action-017": "record_step", "action-018": "reschedule",
  "action-019": "complete_action", "action-020": "clarify"
};

export const actionEvalSamples: ActionEvalSample[] = [
  { id: "action-001", category: "Passo realizado", message: "Falei com a ginecologista.", context: "Ação aberta: Remarcar consulta de retorno da Júlia com a ginecologista.", expected: "Registrar um passo; manter o estado atual." },
  { id: "action-002", category: "Passo realizado", message: "Mandei mensagem pra ela agora.", context: "Ação aberta: Remarcar consulta de retorno da Júlia com a ginecologista.", expected: "Registrar um passo e sugerir aguardando se a resposta depender dela." },
  { id: "action-003", category: "Passo realizado", message: "Ela me respondeu.", context: "A conversa já estabeleceu que 'ela' é a ginecologista.", expected: "Registrar um passo; não concluir nem mudar estado sem informação adicional." },
  { id: "action-004", category: "Aguardando", message: "Consegui falar com a clínica, mas ainda não abriram a agenda.", context: "Ação aberta: Remarcar consulta com a ginecologista.", expected: "Registrar o contato e mudar a Ação para aguardando." },
  { id: "action-005", category: "Aguardando", message: "Agora estou esperando ela me passar os horários.", context: "Ação aberta: Remarcar consulta com a ginecologista.", expected: "Registrar passo e mudar para aguardando; dependência: ela informar os horários." },
  { id: "action-006", category: "Aguardando", message: "Ela disse que vai ver e me responde amanhã.", context: "Ação aberta: Remarcar consulta com a ginecologista.", expected: "Registrar passo e mudar para aguardando, preservando o prazo de conclusão." },
  { id: "action-007", category: "Aguardando", message: "Não depende mais de mim agora.", context: "Há uma Ação aberta, mas nenhuma dependência foi explicitada nesta mensagem.", expected: "Perguntar minimamente o que ou quem está sendo aguardado antes de mudar o estado." },
  { id: "action-008", category: "Conclusão", message: "Consegui remarcar.", context: "Ação aberta: Remarcar consulta com a ginecologista.", expected: "Registrar o resultado e sugerir conclusão da Ação aberta." },
  { id: "action-009", category: "Conclusão", message: "Fechou para quinta-feira às 14h.", context: "A conversa trata do agendamento da consulta.", expected: "Registrar data e horário como resultado e sugerir conclusão." },
  { id: "action-010", category: "Conclusão", message: "A consulta está marcada.", context: "Existe uma única Ação ativa relacionada à consulta.", expected: "Selecionar a Ação da consulta, registrar o passo e sugerir conclusão." },
  { id: "action-011", category: "Conclusão", message: "Resolvido.", context: "Nenhuma Ação está aberta e existem várias Ações ativas.", expected: "Perguntar qual Ação foi resolvida; não propor escrita." },
  { id: "action-012", category: "Ambiguidade", message: "Consegui falar com ela.", context: "Candidatas: Remarcar consulta; Procurar uma nova ginecologista.", expected: "Pedir desambiguação entre as duas Ações." },
  { id: "action-013", category: "Ambiguidade", message: "Consegui remarcar com ela.", context: "Candidatas: Remarcar consulta; Procurar uma nova ginecologista.", expected: "Selecionar Remarcar consulta e sugerir conclusão." },
  { id: "action-014", category: "Mudança de rumo", message: "Não gostei do atendimento, vou procurar outra.", context: "Ação aberta: Remarcar consulta com a ginecologista atual.", expected: "Registrar o acontecimento; não concluir automaticamente; destacar Procurar outra ginecologista como possível nova Ação." },
  { id: "action-015", category: "Mudança de assunto", message: "Sobre o psiquiatra, também preciso remarcar o retorno.", context: "Ação da ginecologista está aberta na tela.", expected: "Não aplicar à ginecologista; buscar Ação do psiquiatra ou oferecer criar uma." },
  { id: "action-016", category: "Múltiplas entidades", message: "A da ginecologista deu certo, mas a do psiquiatra ainda não.", context: "Existem Ações distintas para ginecologista e psiquiatra.", expected: "Separar os dois fatos e nunca registrar tudo em uma única Ação." },
  { id: "action-017", category: "Referência contextual", message: "Ela respondeu e pediu os exames.", context: "Ação aberta: Remarcar consulta com a ginecologista; 'ela' foi estabelecido antes.", expected: "Registrar passo na Ação aberta e não inventar conclusão." },
  { id: "action-018", category: "Agendamento", message: "Isso ficou para semana que vem.", context: "A conversa estabeleceu uma única Ação e 'isso' se refere ao prazo dela.", expected: "Resolver semana que vem deterministicamente e confirmar o novo prazo da Ação." },
  { id: "action-019", category: "Referência contextual", message: "Pode fechar essa.", context: "Uma Ação está expandida na tela.", expected: "Mostrar o título da Ação visível e sugerir conclusão." },
  { id: "action-020", category: "Ambiguidade", message: "Pode fechar.", context: "Nenhuma entidade está aberta e há Ações e Pontas Soltas ativas.", expected: "Perguntar o que deve ser fechado; não propor escrita." },
  { id: "holdout-001", split: "holdout", expectedDecision: "record_step", category: "Passo realizado", message: "Liguei e ninguém atendeu.", context: "Ação expandida: Confirmar horário de atendimento da escola.", expected: "Registrar a tentativa sem concluir nem mudar o estado." },
  { id: "holdout-002", split: "holdout", expectedDecision: "set_waiting", category: "Aguardando", message: "Eles disseram que retornam depois do almoço.", context: "Ação expandida: Confirmar disponibilidade da vistoria.", expected: "Registrar o contato e colocar a Ação em espera pelo retorno." },
  { id: "holdout-003", split: "holdout", expectedDecision: "complete_action", category: "Conclusão", message: "O contrato foi assinado por todo mundo.", context: "Ação expandida: Colher assinaturas do contrato.", expected: "Registrar o resultado e sugerir conclusão." },
  { id: "holdout-004", split: "holdout", expectedDecision: "complete_action", category: "Referência contextual", message: "Pode encerrar isso.", context: "Uma única Ação está expandida na tela.", expected: "Identificar a Ação expandida e sugerir conclusão." },
  { id: "holdout-005", split: "holdout", expectedDecision: "clarify", category: "Ambiguidade", message: "Terminou.", context: "Nenhuma entidade está em foco e existem várias Ações ativas.", expected: "Perguntar qual Ação terminou; não propor escrita." },
  { id: "holdout-006", split: "holdout", expectedDecision: "change_topic", category: "Mudança de assunto", message: "Falando no aluguel, preciso enviar a ficha hoje.", context: "Ação escolar está expandida na tela.", expected: "Não aplicar à Ação escolar; localizar o contexto do aluguel." },
  { id: "holdout-007", split: "holdout", expectedDecision: "multiple_updates", category: "Múltiplas entidades", message: "A escola confirmou, mas o transporte ainda não.", context: "Existem Ações distintas para escola e transporte.", expected: "Separar os dois fatos em atualizações distintas." },
  { id: "holdout-008", split: "holdout", expectedDecision: "reschedule", category: "Agendamento", message: "Deixa isso para o mês que vem.", context: "Uma única Ação está expandida na tela.", expected: "Interpretar o prazo relativo e sugerir reagendamento." },
  { id: "holdout-009", split: "holdout", expectedDecision: "record_step", category: "Passo realizado", message: "Já comecei a preencher, ainda faltam os comprovantes.", context: "Ação expandida: Preencher e enviar a ficha do imóvel.", expected: "Registrar o progresso sem concluir a Ação." },
  { id: "holdout-010", split: "holdout", expectedDecision: "set_waiting", category: "Aguardando", message: "Agora só falta o proprietário aprovar.", context: "Ação expandida: Conseguir aprovação da ficha do imóvel.", expected: "Registrar a dependência externa e colocar em espera." },
  { id: "holdout-011", split: "holdout", expectedDecision: "change_topic", category: "Mudança de rumo", message: "Desisti desse imóvel e vou visitar outro.", context: "Ação expandida: Enviar ficha do imóvel atual.", expected: "Registrar a mudança de rumo sem concluir a Ação atual como sucesso." },
  { id: "holdout-012", split: "holdout", expectedDecision: "clarify", category: "Ambiguidade", message: "Ela respondeu.", context: "Há duas Ações candidatas envolvendo pessoas diferentes e nenhuma está em foco.", expected: "Perguntar quem respondeu ou a qual Ação o relato pertence." },
  { id: "holdout-013", split: "holdout", expectedDecision: "complete_action", category: "Conclusão", message: "A ficha foi aprovada.", context: "Ação expandida: Conseguir aprovação da ficha.", expected: "Registrar a aprovação e sugerir conclusão." },
  { id: "holdout-014", split: "holdout", expectedDecision: "record_step", category: "Passo realizado", message: "Fiz a visita, mas ainda vou decidir.", context: "Ação expandida: Visitar o imóvel.", expected: "Registrar a visita; não inferir decisão nem próximo estado." },
  { id: "holdout-015", split: "holdout", expectedDecision: "clarify", category: "Ambiguidade", message: "Muda isso para amanhã.", context: "Nenhuma entidade está em foco e existem várias Ações ativas.", expected: "Perguntar qual Ação deve ter o prazo alterado." },
  { id: "holdout-016", split: "holdout", expectedDecision: "reschedule", category: "Agendamento", message: "Remarca a consulta para sexta.", context: "Existe uma única Ação ativa chamada Marcar consulta de retorno.", expected: "Selecionar a Ação nomeada e sugerir o novo prazo." }
];
