import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { addDays, dayMonth, hhmm, weekdayShort } from '../../core/format';
import { Agenda as AgendaData, Group } from './admin-api';
import { AdminApi } from './admin-api';
import { AdminState } from './admin-state';
import { AdminDialogs } from './dialogs';

/** Agenda da semana: cada bloco é um grupo (ocupação/capacidade e embaixador). */
@Component({
  selector: 'app-admin-agenda',
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    <header class="adm-head">
      <div><p class="eyebrow">Semana</p><h1>Agenda</h1></div>
      <div class="tools">
        <button mat-stroked-button (click)="move(-7)"><mat-icon>chevron_left</mat-icon> Anterior</button>
        <button mat-stroked-button (click)="thisWeek()">Esta semana</button>
        <button mat-stroked-button (click)="move(7)">Próxima <mat-icon iconPositionEnd>chevron_right</mat-icon></button>
      </div>
      @if (data(); as r) { <p class="muted">{{ dayMonth(r.from) }} a {{ dayMonth(r.to) }} · clique em um grupo para ver os candidatos.</p> }
    </header>
    <div class="legend">
      <span><i class="ok"></i>Com embaixador</span><span><i class="wait"></i>Aguardando embaixador</span>
      <span><i class="exc"></i>Exceção</span><span><i class="adm"></i>Admissões conduz</span><span><i class="done"></i>Realizado</span>
    </div>
    @if (loading()) { <mat-progress-bar mode="indeterminate" aria-label="Carregando" /> }
    @if (data(); as r) {
      <div class="scroll">
        <div class="grid" [style.grid-template-columns]="'64px repeat(' + days().length + ', minmax(150px, 1fr))'">
          <div></div>
          @for (d of days(); track d) {
            <div class="head" [class.today]="d === state.today()"><span>{{ weekdayShort(d) }}</span><b>{{ dayMonth(d) }}</b></div>
          }
          @for (t of r.start_times; track t) {
            <div class="time">{{ hhmm(t) }}</div>
            @for (d of days(); track d) {
              <div class="cell">
                @for (g of groupsAt(d, t); track g.id) {
                  <button type="button" class="grp" [class]="'grp ' + kind(g)" (click)="open(g)">
                    <strong>{{ g.people }}/{{ g.capacity }}</strong>
                    <span>{{ who(g) }}</span>
                  </button>
                }
                @if (slotAt(d, t); as s) {
                  @if (s.reason) { <span class="free blocked">bloqueado</span> }
                  @else if (s.slot_start > state.now()) { <span class="free">{{ s.remaining }} vagas livres</span> }
                }
              </div>
            }
          }
        </div>
      </div>
    }
  `,
  styles: `
    .legend { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 13px; color: var(--ink-2); margin-bottom: 14px;
      span { display: inline-flex; align-items: center; gap: 6px; } i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
      .ok { background: var(--ok-soft); border: 2px solid var(--ok); } .wait { background: var(--yellow-soft); border: 2px solid #c98500; }
      .exc { background: var(--err-soft); border: 2px solid var(--err); } .adm { background: var(--info-soft); border: 2px solid var(--info); }
      .done { background: var(--mat-sys-surface-container); border: 2px solid var(--muted); } }
    .scroll { overflow-x: auto; background: var(--card); border-radius: var(--radius-lg); box-shadow: var(--shadow); padding: 8px; }
    .grid { display: grid; gap: 4px; min-width: max-content; }
    .head { padding: 10px 8px; text-align: center; font-size: 13px; color: var(--muted); display: flex; flex-direction: column;
      b { color: var(--ink); font-size: 15px; } &.today { background: var(--red-soft); border-radius: 10px; b { color: var(--red-dark); } } }
    .time { font-size: 13px; font-weight: 600; color: var(--muted); text-align: right; padding: 12px 8px 0 0; }
    .cell { min-height: 72px; padding: 6px; border-radius: 10px; background: var(--mat-sys-surface-container-low); display: flex; flex-direction: column; gap: 4px; }
    .grp { display: flex; flex-direction: column; align-items: flex-start; gap: 0; text-align: left; padding: 6px 9px; border-radius: 8px; cursor: pointer;
      border: 0; border-left: 4px solid; font: inherit; font-size: 13px; color: var(--ink);
      strong { font-size: 14px; } span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
      &:hover { filter: brightness(.97); }
      &.ok { background: var(--ok-soft); border-color: var(--ok); } &.wait { background: var(--yellow-soft); border-color: #c98500; }
      &.exc { background: var(--err-soft); border-color: var(--err); span { color: var(--err); font-weight: 600; } }
      &.adm { background: var(--info-soft); border-color: var(--info); } &.done { background: var(--mat-sys-surface-container); border-color: var(--muted); } }
    .free { font-size: 12px; color: var(--muted); margin-top: auto; } .blocked { color: var(--err); }
  `,
})
export class Agenda implements OnInit {
  private api = inject(AdminApi);
  private dialogs = inject(AdminDialogs);
  protected state = inject(AdminState);
  protected readonly hhmm = hhmm;
  protected readonly dayMonth = dayMonth;
  protected readonly weekdayShort = weekdayShort;

  protected from = signal('');
  protected data = signal<AgendaData | null>(null);
  protected loading = signal(false);
  protected days = computed(() => {
    const r = this.data();
    if (!r) return [];
    return Array.from({ length: 7 }, (_, i) => addDays(this.from(), i))
      .filter((d) => r.weekdays.includes((new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7));
  });

  ngOnInit() {
    this.thisWeek();
  }

  protected thisWeek() {
    const t = this.state.today();
    this.from.set(addDays(t, -((new Date(t + 'T12:00:00Z').getUTCDay() + 6) % 7))); // segunda-feira
    this.load();
  }
  protected move(n: number) {
    this.from.set(addDays(this.from(), n));
    this.load();
  }
  private async load() {
    this.loading.set(true);
    try {
      this.data.set(await this.api.agenda(this.from(), addDays(this.from(), 6)));
    } catch (e) {
      this.state.toast((e as Error).message, true);
    } finally {
      this.loading.set(false);
    }
  }

  protected slotAt(d: string, t: string) {
    return this.data()!.slots.find((s) => s.date === d && s.time === t);
  }
  protected groupsAt(d: string, t: string) {
    const s = this.slotAt(d, t);
    return s ? this.data()!.groups.filter((g) => g.slot_start === s.slot_start) : [];
  }
  protected kind(g: Group) {
    if (g.in_exception) return 'exc';
    if (g.status === 'realizado') return 'done';
    if (g.handled_by_admissions) return 'adm';
    return g.ambassador ? 'ok' : 'wait';
  }
  protected who(g: Group) {
    if (g.in_exception) return 'Exceção';
    if (g.handled_by_admissions) return 'Admissões';
    if (g.ambassador) return g.ambassador;
    return g.pending_invite ? `convite: ${g.pending_invite.ambassador.split(' ')[0]}` : 'sem embaixador';
  }
  protected async open(g: Group) {
    if (await this.dialogs.group(g)) this.load();
  }
}
