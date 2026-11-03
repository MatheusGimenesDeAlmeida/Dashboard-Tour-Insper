import { Component, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/** /embed — botão pronto para a equipe do site institucional colar na página inicial. */
@Component({
  selector: 'app-embed',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="wrap page narrow">
      <p class="eyebrow">Para a equipe do site</p>
      <h1>Botão de agendamento</h1>
      <p class="lead">Cole o trecho abaixo na página inicial do Insper. Assim o agendamento fica a 1 clique, e não no 3º.</p>
      <section class="card">
        <h2 class="sec">Prévia</h2>
        <div class="preview"><a [href]="url" [style]="buttonStyle">Agende sua visita ao campus</a></div>
        <h2 class="sec top">Código</h2>
        <pre><code>{{ code }}</code></pre>
        <div class="actions">
          <button mat-flat-button (click)="copy()"><mat-icon>{{ copied() ? 'check' : 'content_copy' }}</mat-icon> {{ copied() ? 'Copiado!' : 'Copiar código' }}</button>
          <span class="muted">Endereço do agendamento: <code>{{ url }}</code></span>
        </div>
      </section>
    </div>
  `,
  styles: `
    .preview { padding: 28px; border-radius: var(--radius); background: repeating-conic-gradient(var(--mat-sys-surface-container) 0 25%, var(--card) 0 50%) 0 0 / 20px 20px; text-align: center; }
    .top { margin-top: 24px; }
    pre { background: var(--ink); color: #e6edf3; padding: 16px; border-radius: var(--radius-sm); overflow-x: auto; font-size: 13px; white-space: pre-wrap; word-break: break-all; }
    .actions { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; code { font-size: 13px; } }
  `,
})
export class Embed {
  protected readonly url = location.origin + '/agendar';
  protected readonly buttonStyle =
    'display:inline-block;background:#E50505;color:#fff;font:600 16px Inter,Arial,sans-serif;padding:14px 22px;border-radius:999px;text-decoration:none';
  protected readonly code = `<a href="${this.url}" style="${this.buttonStyle}">Agende sua visita ao campus</a>`;
  protected copied = signal(false);

  protected async copy() {
    await navigator.clipboard.writeText(this.code);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2500);
  }
}
