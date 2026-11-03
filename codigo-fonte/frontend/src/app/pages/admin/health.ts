import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { dateTime, num } from '../../core/format';
import { StatusChip } from '../../shared/status-chip';
import { AdminApi, Jobs } from './admin-api';
import { AdminState } from './admin-state';

/** Saúde das integrações e dos jobs; em desenvolvimento, simulação de tempo para demonstrar as automações. */
@Component({
  selector: 'app-admin-health',
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule, StatusChip],
  template: `
    <header class="adm-head">
      <div><p class="eyebrow">Plataforma</p><h1>Saúde e simulação</h1></div>
    </header>
    @if (r(); as r) {
      <div class="tiles">
        @for (t of tiles(); track t.label) {
          <div class="card tile"><span class="t-label"><mat-icon>{{ t.icon }}</mat-icon>{{ t.label }}</span><strong>{{ t.value }}</strong><small>{{ t.meta }}</small></div>
        }
      </div>

      @if (r.dev) {
        <section class="card sim">
          <div>
            <h2 class="sec"><mat-icon>fast_forward</mat-icon> Simulação de tempo</h2>
            <p class="muted">Adiante o relógio para ver lembretes, expiração de convites, exceções, presença pendente, NPS D+1 e
              encerramento no CRM acontecerem sozinhos. Os jobs rodam logo após cada avanço. Só existe no modo de demonstração.</p>
          </div>
          <div class="btns">
            @for (h of [1, 6, 12, 24]; track h) {
              <button mat-stroked-button [disabled]="busy()" (click)="advance(h)">+{{ h === 24 ? '1 dia' : h + (h === 1 ? ' hora' : ' horas') }}</button>
            }
            <button mat-button [disabled]="busy()" (click)="resetClock()">Voltar ao tempo real</button>
            <button mat-flat-button class="btn-dark" [disabled]="busy()" (click)="runJobs()"><mat-icon>play_arrow</mat-icon> Rodar jobs agora</button>
          </div>
        </section>
      }

      <h2 class="sec top">Jobs agendados</h2>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Job</th><th>Última execução</th><th>Situação</th><th>Resultado</th></tr></thead>
          <tbody>
            @for (j of r.jobs; track j.job) {
              <tr><td><code>{{ j.job }}</code></td><td class="nowrap">{{ dateTime(j.started_at) }}</td><td><app-status [status]="j.status" /></td>
                <td>@if (j.status === 'falhou') { <pre>{{ j.detail }}</pre> } @else { {{ j.detail || '—' }} }</td></tr>
            }
          </tbody>
        </table>
      </div>
    } @else { <mat-progress-bar mode="indeterminate" aria-label="Carregando" /> }
  `,
  styles: `
    .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; margin-bottom: 20px; }
    .tile { display: flex; flex-direction: column; gap: 4px; padding: 18px 20px;
      .t-label { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); mat-icon { font-size: 18px; width: 18px; height: 18px; } }
      strong { font-size: 18px; } small { color: var(--muted); font-size: 13px; } }
    .sim { display: grid; gap: 12px; background: var(--ink); color: #fff;
      .sec { color: #fff; display: flex; align-items: center; gap: 8px; } .muted { color: rgba(255,255,255,.7); margin: 0; }
      .btns { display: flex; flex-wrap: wrap; gap: 8px; }
      --mat-button-outlined-label-text-color: #fff; --mat-button-outlined-outline-color: rgba(255,255,255,.35); --mat-button-text-label-text-color: #fff;
      .btn-dark { --mat-button-filled-container-color: var(--red); } }
    .top { margin-top: 28px; }
    code { font-size: 13px; }
    pre { white-space: pre-wrap; font-size: 12px; margin: 0; color: var(--err); }
  `,
})
export class Health implements OnInit {
  private api = inject(AdminApi);
  private state = inject(AdminState);
  protected r = signal<Jobs | null>(null);
  protected busy = signal(false);
  protected readonly dateTime = dateTime;

  protected tiles = computed(() => {
    const r = this.r();
    if (!r) return [];
    return [
      { icon: 'schedule', label: 'Relógio da plataforma', value: dateTime(r.now),
        meta: r.clock_offset_hours ? `adiantado ${num(r.clock_offset_hours)} h (simulação)` : 'tempo real' },
      { icon: 'mail', label: 'E-mail', value: ({ local: 'Caixa local', brevo: 'Brevo (API)', smtp: 'SMTP' } as Record<string, string>)[r.email_adapter] ?? r.email_adapter,
        meta: r.email_adapter === 'local' ? 'simulado — defina BREVO_API_KEY para envio real'
          : 'envio real; endereços fictícios (@exemplo.com) ficam na caixa local' },
      { icon: 'sync_alt', label: 'CRM', value: r.crm_adapter === 'mock' ? 'Simulado' : 'Webhook', meta: r.crm.map((c) => `${c.n} ${c.status}`).join(' · ') || 'sem operações' },
      { icon: 'chat', label: 'WhatsApp', value: 'Simulado', meta: 'aguarda conta WhatsApp Business' },
      { icon: 'outgoing_mail', label: 'Mensagens', value: String(r.notifications.reduce((s, x) => s + x.n, 0)),
        meta: r.notifications.map((n) => `${n.n} ${n.status}`).join(' · ') },
    ];
  });

  ngOnInit() {
    this.load();
  }
  private async load() {
    this.r.set(await this.api.jobs());
  }
  private async after(p: Promise<unknown>, ok: string) {
    this.busy.set(true);
    await this.state.run(p, ok);
    await Promise.all([this.load(), this.state.refresh()]);
    this.busy.set(false);
  }
  protected advance(h: number) {
    this.after(this.api.clock({ advance_hours: h }), `Relógio adiantado ${h} h. Jobs executados.`);
  }
  protected resetClock() {
    this.after(this.api.clock({ reset: true }), 'Relógio voltou ao tempo real.');
  }
  protected runJobs() {
    this.after(this.api.runJobs(), 'Jobs executados.');
  }
}
