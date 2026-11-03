import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';

import { dateShort, dateTime, hhmm, maskPhone } from '../../core/format';
import { StatusChip } from '../../shared/status-chip';
import { AmbApi, Availability, Invitation, Tour } from './amb-api';
import { OfferCard, TourCard, respondInvite } from './amb-cards';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/** Convites aguardando resposta e histórico recente. */
@Component({
  selector: 'app-amb-invites',
  imports: [MatIconModule, MatProgressBarModule, OfferCard, StatusChip],
  template: `
    <header class="adm-head"><div><p class="eyebrow">Portal do embaixador</p><h1>Convites</h1></div></header>
    @if (loaded()) {
      @for (inv of invites(); track inv.invitation_id) {
        <app-offer class="item" [inv]="inv" [now]="now()" (accept)="respond($event, true)" (decline)="respond($event, false)" />
      } @empty {
        <div class="card empty-state"><mat-icon>mark_email_read</mat-icon><strong>Nenhum convite aguardando resposta.</strong>Mantenha sua disponibilidade em dia para receber tours.</div>
      }
      @if (recent().length) {
        <h2 class="sec top">Respostas recentes</h2>
        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr><th>Tour</th><th>Situação</th><th>Quando</th></tr></thead>
            <tbody>
              @for (r of recent(); track $index) {
                <tr><td>{{ dateTime(r.slot_start) }}</td><td><app-status [status]="r.status" /></td><td>{{ dateTime(r.responded_at) }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    } @else { <mat-progress-bar mode="indeterminate" aria-label="Carregando" /> }
  `,
  styles: `.item { display: block; margin-bottom: 16px; } .top { margin-top: 32px; }`,
})
export class AmbInvites implements OnInit {
  private amb = inject(AmbApi);
  private dialog = inject(MatDialog);
  protected invites = signal<Invitation[]>([]);
  protected recent = signal<{ status: string; responded_at: string; slot_start: string }[]>([]);
  protected now = signal('');
  protected loaded = signal(false);
  protected readonly dateTime = dateTime;

  ngOnInit() {
    this.load();
  }
  private async load() {
    const r = await this.amb.invitations();
    this.invites.set(r.invitations);
    this.recent.set(r.recent);
    this.now.set(r.now);
    this.loaded.set(true);
  }
  protected async respond(inv: Invitation, accept: boolean) {
    if (await respondInvite(this.amb, this.dialog, inv, accept)) this.load();
  }
}

/** Tours confirmados: presença pendente, próximos e anteriores. */
@Component({
  selector: 'app-amb-tours',
  imports: [MatIconModule, MatProgressBarModule, StatusChip, TourCard],
  template: `
    <header class="adm-head"><div><p class="eyebrow">Portal do embaixador</p><h1>Meus tours</h1></div></header>
    @if (data(); as r) {
      @if (r.pending_attendance.length) {
        <div class="notice warn"><mat-icon>how_to_reg</mat-icon>Você tem {{ r.pending_attendance.length }} tour(s) com presença pendente.</div>
        @for (t of r.pending_attendance; track t.group_id) { <app-tour [t]="t" (changed)="load()" /> }
      }
      <h2 class="sec top">Próximos</h2>
      @for (t of r.upcoming; track t.group_id) {
        <app-tour [t]="t" (changed)="load()" />
      } @empty {
        <div class="card empty-state"><mat-icon>event_available</mat-icon>Nenhum tour confirmado. Novos convites aparecem em Convites.</div>
      }
      @if (past().length) {
        <h2 class="sec top">Anteriores</h2>
        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr><th>Tour</th><th class="num">Pessoas</th><th>Situação</th><th>Brinde e voucher</th></tr></thead>
            <tbody>
              @for (t of past(); track t.group_id) {
                <tr><td>{{ t.date_label }}, {{ t.time_label }}</td><td class="num">{{ t.people_count }}</td><td><app-status [status]="t.status" /></td>
                  <td>{{ t.has_gift ? (t.gift_collected ? 'Retirado' : 'Pendente') : '—' }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    } @else { <mat-progress-bar mode="indeterminate" aria-label="Carregando" /> }
  `,
  styles: `.top { margin-top: 28px; } .notice { margin-bottom: 16px; }`,
})
export class AmbTours implements OnInit {
  private amb = inject(AmbApi);
  protected data = signal<{ upcoming: Tour[]; past: Tour[]; pending_attendance: Tour[] } | null>(null);
  protected past = computed(() => {
    const r = this.data();
    return r ? r.past.filter((t) => !r.pending_attendance.some((p) => p.group_id === t.group_id)) : [];
  });

  ngOnInit() {
    this.load();
  }
  protected async load() {
    this.data.set(await this.amb.tours());
  }
}

/** Semana padrão de disponibilidade e exceções por data. */
@Component({
  selector: 'app-amb-availability',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule, MatSelectModule],
  template: `
    <header class="adm-head">
      <div><p class="eyebrow">Portal do embaixador</p><h1>Minha disponibilidade</h1></div>
      <p class="muted">Marque os horários em que você pode conduzir tours toda semana. Os convites só chegam nesses horários.</p>
    </header>
    @if (amb.me()?.availability_stale) {
      <div class="notice warn"><mat-icon>update</mat-icon>Sua disponibilidade não é atualizada há mais de 30 dias. Confira e salve para continuar recebendo convites.</div>
    }
    @if (loaded()) {
      <section class="card">
        <h2 class="sec">Semana padrão <span class="muted count">{{ on().size }} horário(s) marcado(s)</span></h2>
        <div class="grid-wrap">
          <table class="avail">
            <thead><tr><th></th>@for (w of grid().weekdays; track w) { <th scope="col">{{ weekdays[w] }}</th> }</tr></thead>
            <tbody>
              @for (t of grid().start_times; track t) {
                <tr><th scope="row">{{ hhmm(t) }}</th>
                  @for (w of grid().weekdays; track w) {
                    <td><button type="button" class="cell" [class.on]="on().has(w + '|' + t)" [attr.aria-pressed]="on().has(w + '|' + t)"
                      [attr.aria-label]="weekdays[w] + ' ' + hhmm(t)" (click)="toggle(w, t)">
                      @if (on().has(w + '|' + t)) { <mat-icon>check</mat-icon> }</button></td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="card top">
        <h2 class="sec">Exceções por data</h2>
        <p class="muted">Provas, viagens ou um horário extra em que você pode ajudar.</p>
        <ul class="exc">
          @for (e of excs(); track $index; let i = $index) {
            <li><span>{{ dateShort(e.date) }} · {{ e.start_time ? hhmm(e.start_time) : 'dia todo' }} ·
              <strong [class.ok]="e.available" [class.no]="!e.available">{{ e.available ? 'disponível' : 'indisponível' }}</strong></span>
              <button mat-icon-button (click)="removeExc(i)" aria-label="Remover exceção"><mat-icon>delete</mat-icon></button></li>
          } @empty { <li class="muted">Nenhuma exceção cadastrada.</li> }
        </ul>
        <div class="add">
          <mat-form-field><mat-label>Data</mat-label><input matInput type="date" [(ngModel)]="nd" [min]="minDate"></mat-form-field>
          <mat-form-field><mat-label>Horário</mat-label>
            <mat-select [(ngModel)]="nt"><mat-option value="">Dia todo</mat-option>
              @for (t of grid().start_times; track t) { <mat-option [value]="t">{{ hhmm(t) }}</mat-option> }</mat-select></mat-form-field>
          <mat-form-field><mat-label>Situação</mat-label>
            <mat-select [(ngModel)]="na"><mat-option [value]="false">Indisponível</mat-option><mat-option [value]="true">Disponível</mat-option></mat-select></mat-form-field>
          <button mat-stroked-button [disabled]="!nd" (click)="addExc()">Adicionar</button>
        </div>
      </section>

      <div class="save">
        <button mat-flat-button [disabled]="saving()" (click)="save()"><mat-icon>save</mat-icon> {{ saving() ? 'Salvando…' : 'Salvar disponibilidade' }}</button>
        @if (updated(); as u) { <span class="muted">Atualizada em {{ dateTime(u) }}</span> }
      </div>
    } @else { <mat-progress-bar mode="indeterminate" aria-label="Carregando" /> }
  `,
  styles: `
    .notice { margin-bottom: 16px; } .top { margin-top: 20px; } .count { font: 400 13px var(--sans); margin-left: 8px; }
    .grid-wrap { overflow-x: auto; }
    .avail { border-collapse: separate; border-spacing: 6px; th { font-size: 13px; color: var(--muted); font-weight: 600; padding: 2px 6px; } tbody th { text-align: right; } }
    .cell { width: 56px; height: 44px; border-radius: 10px; border: 1.5px dashed var(--line); background: var(--mat-sys-surface-container-low); cursor: pointer;
      display: grid; place-items: center; color: #fff; &:hover { border-color: var(--ink); }
      &.on { background: var(--ok); border: 1.5px solid var(--ok); } }
    @media (max-width: 480px) { .cell { width: 44px; height: 40px; } .avail { border-spacing: 4px; } }
    .exc { list-style: none; padding: 0; margin: 0 0 12px; li { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
      .ok { color: var(--ok); } .no { color: var(--err); } }
    .add { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-start; mat-form-field { width: 170px; } button { margin-top: 8px; } }
    .save { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 20px; }
  `,
})
export class AmbAvailability implements OnInit {
  protected amb = inject(AmbApi);
  protected readonly weekdays = WEEKDAYS;
  protected readonly hhmm = hhmm;
  protected readonly dateShort = dateShort;
  protected readonly dateTime = dateTime;
  protected readonly minDate = new Date().toISOString().slice(0, 10);
  protected grid = computed(() => this.amb.me()!.grid);
  protected on = signal(new Set<string>());
  protected excs = signal<Availability['exceptions']>([]);
  protected updated = signal<string | null>(null);
  protected loaded = signal(false);
  protected saving = signal(false);
  protected nd = '';
  protected nt = '';
  protected na = false;

  ngOnInit() {
    this.load();
  }
  private async load() {
    const r = await this.amb.availability();
    this.on.set(new Set(r.rules.map((x) => `${x.weekday}|${x.start_time}`)));
    this.excs.set(r.exceptions);
    this.updated.set(r.updated_at);
    this.loaded.set(true);
  }
  protected toggle(w: number, t: string) {
    const k = `${w}|${t}`;
    this.on.update((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }
  protected addExc() {
    this.excs.update((l) => [...l, { date: this.nd, start_time: this.nt || null, available: this.na }]);
    this.nd = '';
  }
  protected removeExc(i: number) {
    this.excs.update((l) => l.filter((_, j) => j !== i));
  }
  protected async save() {
    this.saving.set(true);
    const rules = [...this.on()].map((k) => { const [w, t] = k.split('|'); return { weekday: +w, start_time: t }; });
    if (await this.amb.run(this.amb.saveAvailability({ rules, exceptions: this.excs() }), 'Disponibilidade salva.')) {
      await Promise.all([this.amb.loadMe(), this.load()]);
    }
    this.saving.set(false);
  }
}

/** Perfil do embaixador: curso, idiomas e telefone. */
@Component({
  selector: 'app-amb-profile',
  imports: [FormsModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule],
  template: `
    <header class="adm-head"><div><p class="eyebrow">Portal do embaixador</p><h1>Perfil</h1></div></header>
    @if (amb.me(); as me) {
      <section class="card form">
        <div class="id"><span class="av">{{ me.ambassador.display_name[0] }}</span><div><strong>{{ me.ambassador.display_name }}</strong><small>{{ me.email }}</small></div></div>
        <mat-form-field>
          <mat-label>Seu curso</mat-label>
          <mat-select [(ngModel)]="course"><mat-option value="">—</mat-option>
            @for (c of me.courses; track c) { <mat-option [value]="c">{{ c }}</mat-option> }</mat-select>
          <mat-hint>Ajuda a combinar você com candidatos do mesmo curso.</mat-hint>
        </mat-form-field>
        <p class="label">Idiomas em que você conduz o tour</p>
        @for (l of me.languages; track l) {
          <mat-checkbox [checked]="langs.has(l)" (change)="toggleLang(l, $event.checked)">{{ l }}</mat-checkbox>
        }
        <mat-form-field class="gap">
          <mat-label>Telefone (para contato de Admissões)</mat-label>
          <input matInput type="tel" [(ngModel)]="phone" (input)="phone = maskPhone(phone)">
        </mat-form-field>
        <button mat-flat-button [disabled]="saving()" (click)="save()">{{ saving() ? 'Salvando…' : 'Salvar perfil' }}</button>
      </section>
    }
  `,
  styles: `
    .form { max-width: 560px; display: flex; flex-direction: column; gap: 6px; mat-form-field { width: 100%; } button { align-self: flex-start; } }
    .id { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; small { display: block; color: var(--muted); } }
    .av { width: 44px; height: 44px; border-radius: 50%; background: var(--red); color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 18px; }
    .label { font-weight: 500; margin: 14px 0 2px; } .gap { margin-top: 14px; }
  `,
})
export class AmbProfile {
  protected amb = inject(AmbApi);
  protected readonly maskPhone = maskPhone;
  private a = this.amb.me()!.ambassador;
  protected course = this.a.course ?? '';
  protected phone = this.a.phone ?? '';
  protected langs = new Set(this.a.languages);
  protected saving = signal(false);

  protected toggleLang(l: string, on: boolean) {
    if (on) this.langs.add(l); else this.langs.delete(l);
  }
  protected async save() {
    this.saving.set(true);
    if (await this.amb.run(this.amb.saveProfile({ course: this.course, languages: [...this.langs], phone: this.phone }), 'Perfil salvo.')) await this.amb.loadMe();
    this.saving.set(false);
  }
}
