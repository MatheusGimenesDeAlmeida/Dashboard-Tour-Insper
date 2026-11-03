import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';

import { dateShort, num } from '../../core/format';
import { StatusChip } from '../../shared/status-chip';
import { AdminApi, Ambassador, Gift } from './admin-api';
import { AdminState } from './admin-state';

/** Embaixadores: convite, estatísticas dos últimos 90 dias e controle de brinde/voucher. */
@Component({
  selector: 'app-admin-ambassadors',
  imports: [FormsModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule,
    MatSelectModule, MatSlideToggleModule, MatTabsModule, StatusChip],
  template: `
    <header class="adm-head">
      <div><p class="eyebrow">Equipe</p><h1>Embaixadores</h1></div>
    </header>

    <form class="filters" #inv="ngForm" (ngSubmit)="invite(inv)">
      <mat-form-field class="grow"><mat-label>Nome</mat-label><input matInput name="name" [(ngModel)]="nw.name" required></mat-form-field>
      <mat-form-field class="grow"><mat-label>E-mail</mat-label><input matInput type="email" name="email" [(ngModel)]="nw.email" required></mat-form-field>
      <mat-form-field>
        <mat-label>Curso</mat-label>
        <mat-select name="course" [(ngModel)]="nw.course">
          <mat-option value="">—</mat-option>
          @for (c of courses(); track c) { <mat-option [value]="c">{{ c }}</mat-option> }
        </mat-select>
      </mat-form-field>
      <div class="btns"><button mat-flat-button type="submit" [disabled]="inv.invalid"><mat-icon>send</mat-icon> Convidar</button></div>
    </form>

    <mat-tab-group animationDuration="150ms">
      <mat-tab label="Desempenho (90 dias)">
        @if (items(); as list) {
          <div class="tbl-wrap tab-body">
            <table class="tbl">
              <thead><tr>
                <th>Embaixador</th><th class="num">Horários/sem.</th><th class="num">Tours</th><th class="num">Convites</th>
                <th class="num">Aceite</th><th class="num">Recusas</th><th class="num">Expirados</th><th class="num">Nota</th>
                <th class="num">Brinde pendente</th><th>Ativo</th>
              </tr></thead>
              <tbody>
                @for (a of list; track a.id) {
                  <tr [class.off]="!a.active">
                    <td><strong>{{ a.display_name }}</strong><br><small>{{ a.course || 'Sem curso' }} · {{ a.email }}</small></td>
                    <td class="num">{{ a.availability.length }}
                      @if (a.availability_stale) { <span class="pill warn" title="Disponibilidade não é atualizada há mais de 30 dias">desatualizada</span> }</td>
                    <td class="num">{{ a.stats.tours || 0 }}</td>
                    <td class="num">{{ a.stats.invites || 0 }}</td>
                    <td class="num">{{ a.stats.invites ? num((100 * a.stats.accepted) / a.stats.invites, 0) + '%' : '—' }}</td>
                    <td class="num">{{ a.stats.declined || 0 }}</td>
                    <td class="num">{{ a.stats.expired || 0 }}</td>
                    <td class="num">{{ a.stats.nps_avg ? num(a.stats.nps_avg, 1) : '—' }}</td>
                    <td class="num">{{ a.stats.gifts_pending || 0 }}</td>
                    <td><mat-slide-toggle [checked]="!!a.active" (change)="toggle(a)" [attr.aria-label]="(a.active ? 'Desativar ' : 'Ativar ') + a.display_name" /></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="muted note">Relatório interno, sem ranking público. Aceite = convites aceitos ÷ convites recebidos.</p>
        } @else { <mat-progress-bar mode="indeterminate" /> }
      </mat-tab>
      <mat-tab label="Brinde e voucher de almoço">
        @if (gifts(); as list) {
          @if (list.length) {
            <div class="tbl-wrap tab-body">
              <table class="tbl">
                <thead><tr><th>Tour</th><th>Embaixador</th><th>Situação do tour</th><th>Retirada</th></tr></thead>
                <tbody>
                  @for (g of list.slice(0, 80); track g.tour_group_id + '-' + g.ambassador_id) {
                    <tr>
                      <td class="nowrap">{{ g.date_label }}</td><td>{{ g.display_name }}</td><td><app-status [status]="g.status" /></td>
                      <td><mat-checkbox [checked]="!!g.collected_at" (change)="gift(g, $event.checked)">{{ g.collected_at ? dateShort(g.collected_at) : 'pendente' }}</mat-checkbox></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else { <div class="card empty-state tab-body"><mat-icon>redeem</mat-icon>Nenhum tour confirmado ainda.</div> }
        } @else { <mat-progress-bar mode="indeterminate" /> }
      </mat-tab>
    </mat-tab-group>
  `,
  styles: `
    .tab-body { margin-top: 16px; }
    .note { font-size: 13px; margin-top: 10px; }
    tr.off td { opacity: .55; }
    .pill { font-size: 11px; padding: 1px 8px; margin-left: 6px; }
  `,
})
export class Ambassadors implements OnInit {
  private api = inject(AdminApi);
  private state = inject(AdminState);
  protected items = signal<Ambassador[] | null>(null);
  protected gifts = signal<Gift[] | null>(null);
  protected courses = signal<string[]>([]);
  protected nw = { name: '', email: '', course: '' };
  protected readonly num = num;
  protected readonly dateShort = dateShort;

  ngOnInit() {
    this.load();
    this.api.config().then((c) => this.courses.set(c.courses.map((x) => x.name)));
  }
  private async load() {
    const [a, g] = await Promise.all([this.api.ambassadors(), this.api.gifts()]);
    this.items.set(a.items);
    this.gifts.set(g.items);
  }
  protected async invite(form: NgForm) {
    if (await this.state.run(this.api.inviteAmbassador(this.nw), 'Convite enviado por e-mail.')) {
      this.nw = { name: '', email: '', course: '' };
      form.resetForm(this.nw);
      this.load();
    }
  }
  protected async toggle(a: Ambassador) {
    await this.state.run(this.api.patchAmbassador(a.id, { active: !a.active }), a.active ? 'Embaixador desativado.' : 'Embaixador ativado.');
    this.load();
  }
  protected async gift(g: Gift, collected: boolean) {
    await this.state.run(this.api.patchAmbassador(g.ambassador_id, { gift_group_id: g.tour_group_id, collected }), 'Atualizado.');
    this.load();
  }
}
