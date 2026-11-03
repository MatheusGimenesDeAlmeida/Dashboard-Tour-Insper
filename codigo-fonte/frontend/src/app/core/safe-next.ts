/**
 * Destino depois do login: só caminhos internos da área do próprio perfil.
 * Bloqueia "//site.com" e "/\site.com", que o navegador trataria como outro site (redirecionamento aberto).
 */
export function safeNext(next: string | null, role: string, fallback: string): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  const area = role === 'admissions' ? '/admin' : '/embaixador';
  return next === area || next.startsWith(area + '/') || next.startsWith(area + '?') ? next : fallback;
}
