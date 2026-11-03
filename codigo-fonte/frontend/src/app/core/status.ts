// Rótulo e tom de cada situação (agendamento, grupo, convite, mensagem, job), como no painel antigo.
export type Tone = '' | 'ok' | 'warn' | 'err' | 'info' | 'dark';

export const STATUS: Record<string, [string, Tone]> = {
  aguardando_embaixador: ['Aguardando embaixador', 'warn'], confirmado: ['Confirmado', 'ok'], excecao: ['Exceção', 'err'],
  realizado: ['Realizado', 'dark'], encerrado: ['Encerrado', ''], nao_compareceu: ['Não compareceu', 'err'],
  presenca_pendente: ['Presença pendente', 'warn'], cancelado_candidato: ['Cancelado (candidato)', ''],
  cancelado_admissoes: ['Cancelado (Admissões)', ''], aberto: ['Aberto', 'warn'], com_embaixador: ['Com embaixador', 'ok'],
  cancelado: ['Cancelado', ''], enviado: ['Enviado', 'info'], aceito: ['Aceito', 'ok'], recusado: ['Recusado', 'err'],
  expirado: ['Expirado', 'err'], pendente: ['Na fila', ''], desistiu: ['Desistiu', 'err'], simulado: ['Simulado', 'info'],
  falhou: ['Falhou', 'err'], ok: ['OK', 'ok'],
};

export const BOOKING_STATUSES = [
  'aguardando_embaixador', 'confirmado', 'excecao', 'realizado', 'encerrado', 'nao_compareceu', 'presenca_pendente',
  'cancelado_candidato', 'cancelado_admissoes',
];

export function statusLabel(s: string): string {
  return STATUS[s]?.[0] ?? s;
}

export function statusTone(s: string): Tone {
  return STATUS[s]?.[1] ?? '';
}
