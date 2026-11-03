import { Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { num, splitDateLabel } from '../../core/format';
import { AdminApi, Group } from './admin-api';
import { AdminState } from './admin-state';
import { AdminDialogs } from './dialogs';

/** Fila de exceções: grupos sem embaixador, do tour mais próximo para o mais distante. */
@Component({
  selector: 'app-admin-exceptions',
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    <header class="adm-head">
      <div><p class="eyebrow">Fila</p><h1>Exceções</h1></div>
      <p class="muted">Grupos que ficaram sem embaixador, ordenados pela proximidade do tour.</p>
    </header>
    @if (items(); as list) {
      @for (g of list; track g.id) {
        <article class="card exc">
          <div class="top">
            <span class="ic" [class.urgent]="(g.hours_left ?? 99) < 24"><mat-icon>report</mat-icon></span>
            <div class="when">
              <h2>{{ day(g)[0] }}, {{ g.time_label }}</h2>
              <p class="muted">{{ day(g)[1] }} · {{ g.people }} pessoa(s)</p>
            </div>
            <span class="pill" [class.err]="(g.hours_left ?? 99) < 24" [class.warn]="(g.hours_left ?? 99) >= 24">
              <mat-icon>schedule</mat-icon>{{ (g.hours_left ?? 0) < 0 ? 'tour já passou' : 'faltam ' + num(g.hours_left, 0) + ' h' }}
            </span>
          </div>
          @if (g.reason) { <p class="reason">{{ g.reason }}</p> }
          <ul class="who">
            @for (b of g.bookings; track b.id) {
              <li><span><strong>{{ b.name }}</strong> · {{ b.course }}</span><span class="muted">{{ b.party_size }} pessoa(s) · <span class="mono">{{ b.protocol }}</span></span></li>
            }
          </ul>
          <div class="actions">
            <button mat-flat-button (click)="assign(g)"><mat-icon>person_add</mat-icon> Designar embaixador</button>
            <button mat-stroked-button (click)="act(g, 'admissoes_conduz', 'Admissões vai conduzir o tour.')">Admissões conduz</button>
            <button mat-stroked-button (click)="act(g, 'reabrir_alocacao', 'Alocação reaberta.')">Tentar alocação de novo</button>
            <button mat-stroked-button (click)="propose(g)">Propor nova data</button>
          </div>
        </article>
      } @empty {
        <div class="card empty-state"><mat-icon>task_alt</mat-icon><strong>Nenhuma exceção aberta.</strong>Tudo está sendo resolvido automaticamente.</div>
      }
    } @else {
      <mat-progress-bar mode="indeterminate" aria-label="Carregando" />
    }
  `,
  styles: `
    .exc { margin-bottom: 16px; }
    .top { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
    .ic { width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; background: var(--yellow-soft); color: #8a6100;
      &.urgent { background: var(--err-soft); color: var(--err); } }
    .when { flex: 1; min-width: 200px; h2 { margin: 0; font-size: 22px; &::first-letter { text-transform: uppercase; } } p { margin: 2px 0 0; } }
    .pill mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .reason { margin: 14px 0 0; color: var(--ink-2); }
    .who { list-style: none; padding: 0; margin: 14px 0; border-top: 1px solid var(--line);
      li { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 14px; } }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  `,
})
export class Exceptions implements OnInit {
  private api = inject(AdminApi);
  private dialogs = inject(AdminDialogs);
  private state = inject(AdminState);
  protected items = signal<Group[] | null>(null);
  protected readonly num = num;

  ngOnInit() {
    this.load();
  }
  private async load() {
    const r = await this.api.exceptions();
    this.items.set(r.items);
    this.state.openExceptions.set(r.items.length);
  }
  protected day(g: Group) {
    return splitDateLabel(g.date_label);
  }
  protected async assign(g: Group) {
    if (await this.dialogs.assign(g)) this.load();
  }
  protected async act(g: Group, action: string, ok: string) {
    if (await this.state.run(this.api.resolveException(g.id, { action }), ok)) this.load();
  }
  protected async propose(g: Group) {
    if (await this.dialogs.confirm('Propor nova data', 'Os candidatos recebem um e-mail pedindo para escolher outro horário pelo link “Minha visita”.', 'Enviar'))
      this.act(g, 'propor_nova_data', 'Candidatos avisados.');
  }
}
