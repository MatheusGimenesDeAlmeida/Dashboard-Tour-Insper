import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { toDataURL } from 'qrcode';
import { firstValueFrom } from 'rxjs';

import { splitDateLabel } from '../../core/format';
import { StatusChip } from '../../shared/status-chip';
import { ConfirmDialog } from '../admin/dialogs';
import { AmbApi, Invitation, Person, Tour } from './amb-api';

/** Lista dos candidatos de um grupo, com o que o embaixador precisa saber para preparar o tour. */
@Component({
  selector: 'app-people',
  imports: [MatIconModule],
  template: `
    @for (p of people(); track p.booking_id) {
      <div class="person">
        <span class="av" aria-hidden="true">{{ p.first_name[0] }}</span>
        <div>
          <strong>{{ p.first_name }}</strong>
          <div class="meta">{{ line(p) }}</div>
          @if (p.mobility_restriction) {
            <div class="flag"><mat-icon>accessible</mat-icon>Restrição de locomoção{{ p.mobility_notes ? ': ' + p.mobility_notes : '' }}</div>
          }
          @if (p.questions) { <div class="q">“{{ p.questions }}”</div> }
        </div>
      </div>
    }
  `,
  styles: `
    .person { display: flex; gap: 12px; padding: 12px 0; border-top: 1px solid var(--line); }
    .av { width: 34px; height: 34px; border-radius: 50%; background: var(--mat-sys-surface-container); display: grid; place-items: center; font-weight: 700; flex: none; }
    .meta { font-size: 14px; color: var(--muted); }
    .flag { display: inline-flex; align-items: center; gap: 4px; margin-top: 6px; font-size: 13px; font-weight: 600; color: #7a5b00; background: var(--yellow-soft);
      padding: 2px 10px; border-radius: 999px; mat-icon { font-size: 16px; width: 16px; height: 16px; } }
    .q { margin-top: 6px; font-size: 14px; color: var(--ink-2); font-style: italic; }
  `,
})
export class People {
  people = input.required<Person[]>();
  protected line(p: Person) {
    const bits = [p.course_interest, p.is_treineiro ? 'treineiro' : 'vestibulando'];
    if (p.companions) bits.push(`+${p.companions} acompanhante${p.companions > 1 ? 's' : ''}`);
    if (p.language && p.language !== 'Português') bits.push(`idioma: ${p.language}`);
    return bits.join(' · ');
  }
}

/** Convite para conduzir um tour, com contagem regressiva do prazo de resposta. */
@Component({
  selector: 'app-offer',
  imports: [MatButtonModule, MatIconModule, People],
  template: `
    <article class="card offer">
      <div class="top">
        <span class="ic"><mat-icon>notifications_active</mat-icon></span>
        <div class="when"><h3>{{ day()[0] }}, {{ inv().time_label }}</h3><p class="muted">{{ day()[1] }}</p></div>
        <div class="ring" [attr.aria-label]="left() + ' para responder'">
          <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="26" class="track" />
            <circle cx="32" cy="32" r="26" class="prog" [class.urgent]="fraction() < .25" [attr.stroke-dasharray]="dash()" transform="rotate(-90 32 32)" />
          </svg>
          <span>{{ left() }}</span>
        </div>
      </div>
      <div class="chips">
        <span class="pill"><mat-icon>group</mat-icon>{{ inv().people_count }} pessoa{{ inv().people_count > 1 ? 's' : '' }}</span>
        @for (c of courses(); track c) { <span class="pill">{{ c }}</span> }
        @if (mobility()) { <span class="pill warn"><mat-icon>accessible</mat-icon>locomoção</span> }
        @for (l of languages(); track l) { <span class="pill info"><mat-icon>translate</mat-icon>{{ l }}</span> }
      </div>
      @if (withPeople()) { <app-people [people]="inv().people" /> }
      <div class="actions">
        <button mat-flat-button (click)="accept.emit(inv())"><mat-icon>check</mat-icon> Aceitar</button>
        <button mat-stroked-button (click)="decline.emit(inv())">Recusar</button>
      </div>
    </article>
  `,
  styles: `
    .offer { border-top: 4px solid var(--red); }
    .top { display: flex; align-items: center; gap: 14px; }
    .ic { width: 46px; height: 46px; border-radius: 14px; background: var(--red-soft); color: var(--red); display: grid; place-items: center; flex: none; }
    .when { flex: 1; min-width: 0; h3 { margin: 0; font-size: 22px; &::first-letter { text-transform: uppercase; } } p { margin: 2px 0 0; } }
    .ring { position: relative; width: 64px; height: 64px; flex: none; span { position: absolute; inset: 0; display: grid; place-items: center; font-size: 12px; font-weight: 700; } }
    .track { fill: none; stroke: var(--line); stroke-width: 6; }
    .prog { fill: none; stroke: var(--ink); stroke-width: 6; stroke-linecap: round; &.urgent { stroke: var(--red); } }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 16px 0 6px; .pill mat-icon { font-size: 16px; width: 16px; height: 16px; } }
    .actions { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
  `,
})
export class OfferCard {
  inv = input.required<Invitation>();
  now = input.required<string>();
  withPeople = input(true);
  accept = output<Invitation>();
  decline = output<Invitation>();

  protected day = computed(() => splitDateLabel(this.inv().date_label));
  private ms = computed(() => new Date(this.inv().expires_at).getTime() - new Date(this.now()).getTime());
  protected fraction = computed(() => Math.max(0, Math.min(1, this.ms() / (12 * 3600000))));
  protected left = computed(() => {
    const ms = this.ms();
    if (ms <= 0) return 'encerrado';
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
  });
  protected dash = computed(() => `${(2 * Math.PI * 26 * this.fraction()).toFixed(1)} ${(2 * Math.PI * 26).toFixed(1)}`);
  protected courses = computed(() => [...new Set(this.inv().people.map((p) => p.course_interest))]);
  protected mobility = computed(() => this.inv().people.some((p) => p.mobility_restriction));
  protected languages = computed(() => [...new Set(this.inv().people.filter((p) => p.language !== 'Português').map((p) => p.language))]);
}

/** Tour confirmado: candidatos, lista de presença, QR da avaliação, brinde e desistência. */
@Component({
  selector: 'app-tour',
  imports: [MatButtonModule, MatButtonToggleModule, MatCheckboxModule, MatIconModule, People, StatusChip],
  template: `
    <article class="card tour" [class.today]="t().is_today">
      <div class="top">
        <span class="ic"><mat-icon>{{ t().is_today ? 'location_on' : 'event' }}</mat-icon></span>
        <div class="when"><h3>{{ day()[0] }}, {{ t().time_label }}</h3><p class="muted">{{ day()[1] }} · {{ t().people_count }} pessoa(s)</p></div>
        <div class="tags">@if (t().is_today) { <span class="pill warn">Hoje</span> }<app-status [status]="t().status" /></div>
      </div>

      @if (t().can_mark) {
        <h4>Lista de presença</h4>
        @for (p of t().people; track p.booking_id) {
          <div class="mark">
            <div><strong>{{ p.first_name }}</strong><small>{{ p.party_size }} pessoa(s)</small></div>
            <mat-button-toggle-group [value]="marks()[p.booking_id]" (change)="mark(p.booking_id, $event.value)" [attr.aria-label]="'Presença de ' + p.first_name" hideSingleSelectionIndicator>
              <mat-button-toggle [value]="true">Compareceu</mat-button-toggle>
              <mat-button-toggle [value]="false">Não veio</mat-button-toggle>
            </mat-button-toggle-group>
          </div>
        }
        <div class="actions">
          <button mat-flat-button class="btn-dark" (click)="saveAttendance()"><mat-icon>how_to_reg</mat-icon> Salvar presença</button>
          <button mat-flat-button (click)="showQr()"><mat-icon>qr_code_2</mat-icon> Mostrar QR da avaliação</button>
        </div>
      } @else {
        <app-people [people]="t().people" />
      }

      @if (t().has_gift) {
        <mat-checkbox class="gift" [checked]="t().gift_collected" (change)="gift($event.checked)">Retirei brinde e voucher de almoço</mat-checkbox>
      }
      @if (!t().is_past) {
        <button mat-button class="withdraw" (click)="withdraw()"><mat-icon>event_busy</mat-icon> Não vou conseguir conduzir</button>
      }
    </article>
  `,
  styles: `
    .tour { margin-bottom: 16px; &.today { border-top: 4px solid var(--yellow); } }
    .top { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
    .ic { width: 46px; height: 46px; border-radius: 14px; background: var(--mat-sys-surface-container); display: grid; place-items: center; flex: none; }
    .when { flex: 1; min-width: 180px; h3 { margin: 0; font-size: 22px; &::first-letter { text-transform: uppercase; } } p { margin: 2px 0 0; } }
    .tags { display: flex; gap: 6px; }
    h4 { font-size: 14px; font-weight: 600; margin: 18px 0 4px; }
    .mark { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 0; border-top: 1px solid var(--line);
      small { display: block; color: var(--muted); font-size: 13px; }
      .mat-button-toggle-checked:first-child { background: var(--ok-soft); color: var(--ok); font-weight: 600; }
      .mat-button-toggle-checked:last-child { background: var(--err-soft); color: var(--err); font-weight: 600; } }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
    .gift { display: block; margin-top: 12px; }
    .withdraw { margin-top: 8px; --mat-button-text-label-text-color: var(--muted); }
  `,
})
export class TourCard implements OnInit {
  private amb = inject(AmbApi);
  private dialog = inject(MatDialog);
  t = input.required<Tour>();
  changed = output<void>();

  protected day = computed(() => splitDateLabel(this.t().date_label));
  protected marks = signal<Record<number, boolean>>({});

  ngOnInit() {
    const m: Record<number, boolean> = {};
    for (const p of this.t().people) if (p.attended !== null) m[p.booking_id] = p.attended;
    this.marks.set(m);
  }

  protected mark(id: number, v: boolean) {
    this.marks.update((m) => ({ ...m, [id]: v }));
  }
  protected async saveAttendance() {
    const list = Object.entries(this.marks()).map(([booking_id, attended]) => ({ booking_id: +booking_id, attended }));
    if (!list.length) return this.amb.toast('Marque pelo menos uma pessoa.', true);
    if (await this.amb.run(this.amb.attendance(this.t().group_id, list), 'Presença registrada.')) this.changed.emit();
  }
  protected async showQr() {
    try {
      const r = await this.amb.npsQr(this.t().group_id);
      // O servidor monta o link com APP_BASE_URL; no navegador, o endereço atual é o mais confiável
      const url = location.origin + new URL(r.url).pathname;
      const img = await toDataURL(url, { width: 300, margin: 1, errorCorrectionLevel: 'M' });
      this.dialog.open(QrDialog, { data: { url, img }, width: '400px', maxWidth: 'calc(100vw - 24px)' });
    } catch (e) {
      this.amb.toast((e as Error).message, true);
    }
  }
  protected gift(collected: boolean) {
    this.amb.run(this.amb.gift(this.t().group_id, collected), collected ? 'Retirada registrada.' : 'Retirada desmarcada.');
  }
  protected async withdraw() {
    const ok = await firstValueFrom(this.dialog.open(ConfirmDialog, {
      width: '440px', maxWidth: 'calc(100vw - 24px)',
      data: { title: 'Desistir do tour', text: 'O tour volta para a alocação automática e o reserva será chamado. Use só se não puder mesmo ir.', ok: 'Desistir', danger: true },
    }).afterClosed());
    if (ok && (await this.amb.run(this.amb.withdraw(this.t().group_id), 'Desistência registrada. Obrigado por avisar.'))) this.changed.emit();
  }
}

@Component({
  selector: 'app-qr-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Avaliação do tour</h2>
    <mat-dialog-content class="qr">
      <p>Peça ao grupo para apontar a câmera do celular:</p>
      <img [src]="data.img" width="300" height="300" alt="QR code da avaliação do tour">
      <a [href]="data.url" target="_blank" rel="noopener">{{ data.url }}</a>
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-flat-button mat-dialog-close>Fechar</button></mat-dialog-actions>
  `,
  styles: `.qr { text-align: center; img { margin: 8px auto 12px; max-width: 100%; height: auto; } a { word-break: break-all; font-size: 12px; color: var(--muted); } }`,
})
export class QrDialog {
  protected data = inject<{ url: string; img: string }>(MAT_DIALOG_DATA);
}

@Component({
  selector: 'app-decline-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>Recusar convite</h2>
    <mat-dialog-content>
      <p>O convite vai para o próximo embaixador da fila.</p>
      <mat-form-field class="full"><mat-label>Motivo (opcional)</mat-label>
        <input matInput [(ngModel)]="reason" placeholder="Ex.: tenho aula neste horário"></mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Voltar</button>
      <button mat-flat-button class="danger" [mat-dialog-close]="{ reason }">Recusar</button>
    </mat-dialog-actions>
  `,
  styles: `.full { width: 100%; } .danger { --mat-button-filled-container-color: var(--err); }`,
})
export class DeclineDialog {
  protected reason = '';
}

/** Aceitar/recusar um convite, usado no Início e em Convites. */
export async function respondInvite(amb: AmbApi, dialog: MatDialog, inv: Invitation, accept: boolean): Promise<boolean> {
  if (accept) return amb.run(amb.accept(inv.invitation_id), 'Tour aceito! O candidato já recebeu seu nome.');
  const r = await firstValueFrom(dialog.open(DeclineDialog, { width: '440px', maxWidth: 'calc(100vw - 24px)' }).afterClosed());
  return r ? amb.run(amb.decline(inv.invitation_id, r.reason), 'Convite recusado.') : false;
}
