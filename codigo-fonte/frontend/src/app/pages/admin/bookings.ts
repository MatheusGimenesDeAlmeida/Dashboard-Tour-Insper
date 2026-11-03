import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router } from '@angular/router';

import { BOOKING_STATUSES, statusLabel } from '../../core/status';
import { StatusChip } from '../../shared/status-chip';
import { AdminApi, BookingRow } from './admin-api';
import { AdminState } from './admin-state';
import { AdminDialogs } from './dialogs';

interface Filters { q: string; status: string; course: string; treineiro: string; from: string; to: string }
const EMPTY: Filters = { q: '', status: '', course: '', treineiro: '', from: '', to: '' };

/** Lista de agendamentos com filtros (ficam na URL, então dá para compartilhar o link) e exportações. */
@Component({
  selector: 'app-admin-bookings',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatMenuModule, MatProgressBarModule, MatSelectModule, StatusChip],
  template: `
    <header class="adm-head">
      <div><p class="eyebrow">Candidatos</p><h1>Agendamentos</h1></div>
      <div class="tools">
        <button mat-stroked-button [matMenuTriggerFor]="csv"><mat-icon>download</mat-icon> Exportar</button>
        <mat-menu #csv="matMenu">
          @for (e of exports; track e.key) { <a mat-menu-item [href]="'/api/admin/export/' + e.key + '.csv?' + query()">{{ e.label }}</a> }
        </mat-menu>
      </div>
    </header>

    <form class="filters" (ngSubmit)="apply()">
      <mat-form-field class="grow">
        <mat-label>Busca</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input matInput name="q" [(ngModel)]="f.q" placeholder="Nome, CPF, protocolo ou e-mail">
      </mat-form-field>
      <mat-form-field>
        <mat-label>Situação</mat-label>
        <mat-select name="status" [(ngModel)]="f.status">
          <mat-option value="">Todas</mat-option>
          @for (s of statuses; track s) { <mat-option [value]="s">{{ statusLabel(s) }}</mat-option> }
        </mat-select>
      </mat-form-field>
      <mat-form-field>
        <mat-label>Curso</mat-label>
        <mat-select name="course" [(ngModel)]="f.course">
          <mat-option value="">Todos</mat-option>
          @for (c of courses(); track c) { <mat-option [value]="c">{{ c }}</mat-option> }
        </mat-select>
      </mat-form-field>
      <mat-form-field>
        <mat-label>Perfil</mat-label>
        <mat-select name="treineiro" [(ngModel)]="f.treineiro">
          <mat-option value="">Todos</mat-option><mat-option value="1">Treineiros</mat-option><mat-option value="0">Vestibulandos</mat-option>
        </mat-select>
      </mat-form-field>
      <mat-form-field><mat-label>De</mat-label><input matInput type="date" name="from" [(ngModel)]="f.from"></mat-form-field>
      <mat-form-field><mat-label>Até</mat-label><input matInput type="date" name="to" [(ngModel)]="f.to"></mat-form-field>
      <div class="btns">
        <button mat-flat-button class="btn-dark" type="submit">Filtrar</button>
        <button mat-button type="button" (click)="clear()">Limpar</button>
      </div>
    </form>

    @if (loading()) { <mat-progress-bar mode="indeterminate" aria-label="Carregando" /> }
    <p class="muted count">{{ items().length }} resultado(s){{ items().length === 500 ? ' (mostrando os 500 primeiros)' : '' }}</p>
    @if (items().length) {
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Protocolo</th><th>Visita</th><th>Nome</th><th>Curso</th><th class="num">Pessoas</th><th>Embaixador</th><th>Situação</th></tr></thead>
          <tbody>
            @for (b of items(); track b.id) {
              <tr class="click" tabindex="0" (click)="open(b.id)" (keydown.enter)="open(b.id)">
                <td class="mono nowrap">{{ b.protocol }}</td>
                <td class="nowrap">{{ b.date_label }} <small>{{ b.time_label }}</small></td>
                <td><strong>{{ b.full_name }}</strong><br><small>{{ b.email }}</small></td>
                <td>{{ b.course_interest }} @if (b.is_treineiro) { <span class="pill" title="Treineiro">T</span> }</td>
                <td class="num">{{ b.party_size }}</td>
                <td>{{ b.ambassador_name || '—' }}</td>
                <td><app-status [status]="b.status" /></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else if (!loading()) {
      <div class="empty-state card"><mat-icon>search_off</mat-icon>Nenhum agendamento encontrado.</div>
    }
  `,
  styles: `.count { margin: 8px 0 12px; font-size: 14px; } .pill { font-size: 11px; padding: 1px 7px; margin-left: 4px; }`,
})
export class Bookings implements OnInit {
  private api = inject(AdminApi);
  private dialogs = inject(AdminDialogs);
  private state = inject(AdminState);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  protected readonly statuses = BOOKING_STATUSES;
  protected readonly statusLabel = statusLabel;
  protected readonly exports = [
    { key: 'bookings', label: 'Agendamentos (CSV)' }, { key: 'attendance', label: 'Presença (CSV)' },
    { key: 'nps', label: 'NPS (CSV)' }, { key: 'crm', label: 'Arquivo para o CRM (CSV)' },
  ];
  protected f: Filters = { ...EMPTY };
  protected items = signal<BookingRow[]>([]);
  protected courses = signal<string[]>([]);
  protected loading = signal(false);
  private applied = signal<Filters>({ ...EMPTY });
  protected query = computed(() => new URLSearchParams(Object.entries(this.applied()).filter(([, v]) => v)).toString());

  ngOnInit() {
    this.api.config().then((c) => this.courses.set(c.courses.map((x) => x.name)));
    this.route.queryParamMap.subscribe((p) => {
      this.f = { ...EMPTY };
      for (const k of Object.keys(EMPTY) as (keyof Filters)[]) this.f[k] = p.get(k) ?? '';
      this.applied.set({ ...this.f });
      this.load();
    });
  }

  protected apply() {
    const qp = Object.fromEntries(Object.entries(this.f).filter(([, v]) => v));
    this.router.navigate([], { relativeTo: this.route, queryParams: qp });
  }
  protected clear() {
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }
  private async load() {
    this.loading.set(true);
    try {
      this.items.set((await this.api.bookings(new URLSearchParams(this.query()))).items);
    } catch (e) {
      this.state.toast((e as Error).message, true);
    } finally {
      this.loading.set(false);
    }
  }
  protected async open(id: number) {
    if (await this.dialogs.booking(id)) this.load();
  }
}
