import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { Api } from '../../core/api';
import { dateTime } from '../../core/format';

interface Item { id: number; recipient: string; template_code: string; channel: string; subject: string; sent_at: string | null; created_at: string }
interface Message extends Item { body_text: string | null; body_html: string | null; attachments: { index: number; filename: string }[] }

/** /caixa-de-entrada — todos os e-mails e WhatsApps simulados que a plataforma "enviou" (só no modo de demonstração). */
@Component({
  selector: 'app-inbox',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule],
  template: `
    <div class="wrap page">
      <header class="adm-head">
        <div><p class="eyebrow">Demonstração</p><h1>Caixa de entrada</h1></div>
        <div class="tools">
          <mat-form-field class="filter" subscriptSizing="dynamic">
            <mat-label>Filtrar por destinatário</mat-label><mat-icon matPrefix>search</mat-icon>
            <input matInput [(ngModel)]="filter" (ngModelChange)="search()">
          </mat-form-field>
          <button mat-icon-button (click)="load()" aria-label="Atualizar"><mat-icon>refresh</mat-icon></button>
        </div>
        <p class="muted">Nada aqui sai de verdade para a internet: os e-mails e WhatsApps são simulados.</p>
      </header>

      @if (error(); as msg) {
        <div class="notice error" role="alert"><mat-icon>error</mat-icon>{{ msg }}</div>
      } @else {
        <div class="box" [class.reading]="msg()">
          <div class="list card" role="list">
            @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
            @for (n of items(); track n.id) {
              <button class="item" role="listitem" [class.on]="msg()?.id === n.id" (click)="open(n.id)">
                <span class="ch" [class.wa]="n.channel === 'whatsapp'"><mat-icon>{{ n.channel === 'whatsapp' ? 'chat' : 'mail' }}</mat-icon></span>
                <span class="tx">
                  <span class="r"><strong>{{ n.recipient }}</strong><small>{{ dateTime(n.sent_at || n.created_at) }}</small></span>
                  <span class="s">{{ n.subject }}</span>
                  <span class="code">{{ n.template_code }}</span>
                </span>
              </button>
            } @empty {
              @if (!loading()) { <p class="muted empty">Nenhuma mensagem.</p> }
            }
          </div>
          <div class="view">
            @if (msg(); as m) {
              <div class="card head">
                <button mat-button class="back" (click)="msg.set(null)"><mat-icon>arrow_back</mat-icon> Voltar à lista</button>
                <h2>{{ m.subject }}</h2>
                <p class="muted">Para: {{ m.recipient }} · {{ m.channel === 'whatsapp' ? 'WhatsApp (simulado)' : 'E-mail' }} · {{ m.template_code }} · {{ dateTime(m.sent_at || m.created_at) }}</p>
                @for (a of m.attachments; track a.index) {
                  <a mat-stroked-button [href]="'/api/dev/inbox/' + m.id + '/attachment/' + a.index"><mat-icon>attach_file</mat-icon> {{ a.filename }}</a>
                }
              </div>
              <iframe [title]="m.subject" sandbox="allow-popups allow-top-navigation-by-user-activation" [srcdoc]="srcdoc()"></iframe>
            } @else {
              <div class="card empty-state"><mat-icon>drafts</mat-icon>Escolha uma mensagem.</div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .filter { width: 280px; }
    .box { display: grid; grid-template-columns: minmax(280px, 380px) minmax(0, 1fr); gap: 16px; align-items: start; }
    .list { padding: 6px; max-height: 72vh; overflow-y: auto; }
    .item { display: flex; gap: 12px; width: 100%; padding: 12px; border: 0; border-radius: 12px; background: none; text-align: left; font: inherit; color: var(--ink); cursor: pointer;
      &:hover { background: var(--mat-sys-surface-container-low); } &.on { background: var(--red-soft); } }
    .ch { width: 34px; height: 34px; border-radius: 50%; background: var(--info-soft); color: var(--info); display: grid; place-items: center; flex: none;
      mat-icon { font-size: 18px; width: 18px; height: 18px; } &.wa { background: var(--ok-soft); color: var(--ok); } }
    .tx { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .r { display: flex; justify-content: space-between; gap: 8px; strong { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } small { color: var(--muted); font-size: 12px; white-space: nowrap; } }
    .s { font-size: 14px; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .code { font-size: 11px; font-weight: 600; color: var(--muted); }
    .empty { padding: 16px; }
    .head { margin-bottom: 12px; h2 { font-size: 20px; margin: 0 0 4px; } p { margin: 0 0 8px; font-size: 14px; } }
    .back { display: none; margin: -8px 0 6px -12px; }
    iframe { width: 100%; height: 62vh; border: 0; border-radius: var(--radius-lg); background: #fff; box-shadow: var(--shadow); }
    @media (max-width: 860px) {
      .box { grid-template-columns: 1fr; }
      .box.reading .list, .box:not(.reading) .view { display: none; }
      .back { display: inline-flex; }
      .filter { width: 100%; }
    }
  `,
})
export class Inbox implements OnInit {
  private api = inject(Api);
  to = input<string>();

  protected filter = '';
  protected items = signal<Item[]>([]);
  protected msg = signal<Message | null>(null);
  protected srcdoc = signal('');
  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected readonly dateTime = dateTime;
  private timer?: ReturnType<typeof setTimeout>;

  ngOnInit() {
    this.filter = this.to() ?? '';
    this.load();
  }
  protected search() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.load(), 250);
  }
  protected async load() {
    this.loading.set(true);
    try {
      this.items.set((await this.api.request<{ items: Item[] }>('GET', '/api/dev/inbox?to=' + encodeURIComponent(this.filter))).items);
      this.error.set(null);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.loading.set(false);
    }
  }
  protected async open(id: number) {
    const m = await this.api.request<Message>('GET', `/api/dev/inbox/${id}`);
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const html = m.body_html || `<pre style="font:14px Inter,Arial;white-space:pre-wrap;padding:16px">${esc(m.body_text || '')}</pre>`;
    // Links do e-mail abrem na janela principal (o iframe é isolado pelo sandbox)
    this.srcdoc.set(html.replace(/<a /g, '<a target="_top" '));
    this.msg.set(m);
  }
}
