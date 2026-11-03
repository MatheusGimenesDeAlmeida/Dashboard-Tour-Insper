// Formatação de datas (sempre no fuso de São Paulo) e máscaras/validação de CPF e celular.

const TZ = 'America/Sao_Paulo';
const dtf = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, ...opts });

/** "10:00" → "10h", "14:30" → "14h30" */
export function hhmm(t: string): string {
  const [a, b] = t.split(':');
  return b === '00' ? `${+a}h` : `${+a}h${b}`;
}

/** "2026-11-04" → "quarta-feira, 4 de novembro" */
export function dateLong(dateStr: string): string {
  return dtf({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(dateStr + 'T12:00:00-03:00'));
}

/** "2026-11-04" → "Qua, 4 nov" */
export function shortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00-03:00');
  const wd = dtf({ weekday: 'short' }).format(d).replace('.', '');
  const dm = dtf({ day: 'numeric', month: 'short' }).format(d).replace('.', '').replace(' de ', ' ');
  return `${wd[0].toUpperCase()}${wd.slice(1)}, ${dm}`;
}

/** Data AAAA-MM-DD + n dias */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** AAAA-MM-DD → Date local (meio-dia, para não virar o dia por fuso) e o inverso. Usado pelo calendário. */
export function toDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
export function fromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "quarta-feira, 4 de novembro de 2026" → ["quarta-feira", "4 de novembro de 2026"] */
export function splitDateLabel(label: string): [string, string] {
  const [weekday, ...rest] = label.split(',');
  return [weekday, rest.join(',').trim()];
}

export function maskCPF(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function cpfValid(v: string): boolean {
  const d = v.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  for (const n of [9, 10]) {
    let s = 0;
    for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i);
    if (((s * 10) % 11) % 10 !== +d[n]) return false;
  }
  return true;
}

export function maskPhone(v: string): string {
  let d = v.replace(/\D/g, '');
  let prefix = '';
  if (d.startsWith('55') && d.length > 11) { prefix = '+55 '; d = d.slice(2); }
  d = d.slice(0, 11);
  if (d.length <= 2) return prefix + d;
  if (d.length <= 6) return `${prefix}(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `${prefix}(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `${prefix}(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function phoneValid(v: string): boolean {
  const d = v.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  return d.length >= 10 && d.length <= 11;
}
