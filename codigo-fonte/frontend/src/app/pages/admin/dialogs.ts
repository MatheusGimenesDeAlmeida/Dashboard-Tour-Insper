import { Component, Injectable, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';

import { addDays, dateLong, dateTime, hhmm, maskPhone } from '../../core/format';
import { Slot } from '../../core/models';
import { StatusChip } from '../../shared/status-chip';
import { AdminApi, AvailableAmbassador, BookingDetail, Group } from './admin-api';
import { AdminState } from './admin-state';

const WIDE = { width: '760px', maxWidth: 'calc(100vw - 24px)', autoFocus: 'dialog' as const };
const NARROW = { width: '480px', maxWidth: 'calc(100vw - 24px)', autoFocus: 'dialog' as const };

const EVENT_LABELS: Record<string, string> = {
  'booking.created': 'Agendamento criado', 'booking.confirmed': 'Tour confirmado', 'booking.cancelled': 'Cancelado',
  'booking.rescheduled': 'Reagendado', 'booking.presence_confirmed': 'Candidato confirmou presença', 'booking.closed': 'Encerrado no CRM',
  'attendance.realizado': 'Presença: compareceu', 'attendance.nao_compareceu': 'Presença: não compareceu', 'nps.received': 'NPS respondido',
  'message.resent': 'Mensagem reenviada', 'group.created': 'Grupo aberto', 'allocation.ranked': 'Alocação: ranking de embaixadores',
  'group.exception_opened': 'Exceção aberta', 'exception.assigned': 'Admissões designou embaixador',
  'exception.admissions_conducts': 'Admissões vai conduzir', 'exception.new_date_proposed': 'Admissões propôs nova data',
  'exception.reallocation': 'Alocação reaberta', 'ambassador.withdrew': 'Embaixador desistiu', 'group.cancelled': 'Grupo cancelado',
  'tour.completed': 'Tour concluído', 'gift.collected': 'Brinde e voucher',
};
const ACTORS: Record<string, string> = { system: 'plataforma', candidate: 'candidato', ambassador: 'embaixador', admissions: 'Admissões' };

/** Abre os diálogos do painel. Cada método devolve true quando algo mudou (a seção recarrega). */
@Injectable({ providedIn: 'root' })
export class AdminDialogs {
  private dialog = inject(MatDialog);

  confirm(title: string, text: string, ok: string, danger = false): Promise<boolean> {
    return firstValueFrom(this.dialog.open(ConfirmDialog, { ...NARROW, data: { title, text, ok, danger } }).afterClosed()).then((r) => !!r);
  }
  booking(id: number): Promise<boolean> {
    return firstValueFrom(this.dialog.open(BookingDialog, { ...WIDE, data: id }).afterClosed()).then((r) => !!r);
  }
  group(g: Group): Promise<boolean> {
    return firstValueFrom(this.dialog.open(GroupDialog, { ...WIDE, data: g }).afterClosed()).then((r) => !!r);
  }
  assign(g: Group): Promise<boolean> {
    return firstValueFrom(this.dialog.open(AssignDialog, { ...NARROW, data: g }).afterClosed()).then((r) => !!r);
  }
  reschedule(b: BookingDetail): Promise<boolean> {
    return firstValueFrom(this.dialog.open(RescheduleDialog, { ...NARROW, data: b }).afterClosed()).then((r) => !!r);
  }
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content><p>{{ data.text }}</p></mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Voltar</button>
      <button mat-flat-button [class.danger]="data.danger" [mat-dialog-close]="true">{{ data.ok }}</button>
    </mat-dialog-actions>
  `,
  styles: `.danger { --mat-button-filled-container-color: var(--err); }`,
})
export class ConfirmDialog {
  protected data = inject<{ title: string; text: string; ok: string; danger: boolean }>(MAT_DIALOG_DATA);
}

@Component({
  selector: 'app-booking-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatMenuModule, MatProgressBarModule, StatusChip],
  templateUrl: './booking-dialog.html',
  styleUrl: './dialogs.scss',
})
export class BookingDialog implements OnInit {
  private id = inject<number>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<BookingDialog>);
  private api = inject(AdminApi);
  private state = inject(AdminState);
  private dialogs = inject(AdminDialogs);

  protected b = signal<BookingDetail | null>(null);
  protected error = signal<string | null>(null);
  protected readonly dateTime = dateTime;
  protected readonly maskPhone = maskPhone;
  protected readonly templates = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'];

  async ngOnInit() {
    try {
      this.b.set(await this.api.booking(this.id));
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }

  protected active() {
    return ['aguardando_embaixador', 'confirmado', 'excecao'].includes(this.b()!.status);
  }
  protected canMarkAttendance() {
    const b = this.b()!;
    return ['confirmado', 'presenca_pendente', 'realizado', 'nao_compareceu'].includes(b.status) && b.slot_start < this.state.now();
  }
  protected eventLabel(e: { type: string; actor: string }) {
    return `${EVENT_LABELS[e.type] || e.type} · ${ACTORS[e.actor] || e.actor}`;
  }

  private async act(p: Promise<unknown>, ok = 'Feito.') {
    if (await this.state.run(p, ok)) {
      this.state.refresh();
      this.ref.close(true);
    }
  }

  protected async cancel() {
    const b = this.b()!;
    if (await this.dialogs.confirm('Cancelar agendamento', `Cancelar a visita de ${b.full_name}? O candidato recebe um e-mail.`, 'Cancelar visita', true))
      this.act(this.api.patchBooking(b.id, { action: 'cancel', reason: 'cancelado por Admissões' }), 'Visita cancelada.');
  }
  protected attendance(attended: boolean) {
    this.act(this.api.patchBooking(this.b()!.id, { action: 'attendance', attended }), 'Presença registrada.');
  }
  protected resend(code: string) {
    this.act(this.api.patchBooking(this.b()!.id, { action: 'resend', template_code: code }), `Mensagem ${code} reenviada.`);
  }
  protected async reschedule() {
    const b = this.b()!;
    this.ref.close(await this.dialogs.reschedule(b));
  }
  protected async assign() {
    this.ref.close(await this.dialogs.assign(this.b()!.group));
  }
  protected async anonymize() {
    if (await this.dialogs.confirm('Anonimizar titular', 'Apaga nome, CPF, e-mail e telefone deste titular (pedido LGPD). Não dá para desfazer.', 'Anonimizar', true))
      this.act(this.api.anonymize(this.b()!.id), 'Dados anonimizados.');
  }
}

@Component({
  selector: 'app-group-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, StatusChip],
  template: `
    <h2 mat-dialog-title>Grupo · {{ g.date_label }}, {{ g.time_label }}</h2>
    <mat-dialog-content>
      <div class="facts">
        <span><mat-icon>person</mat-icon>{{ g.handled_by_admissions ? 'Admissões conduz' : (g.ambassador || 'Sem embaixador') }}</span>
        <span><mat-icon>group</mat-icon>{{ g.people }}/{{ g.capacity }} pessoas</span>
        <app-status [status]="g.in_exception ? 'excecao' : g.status" />
      </div>
      @if (g.pending_invite; as inv) {
        <p class="muted">Convite em aberto para {{ inv.ambassador }} até {{ dateTime(inv.expires_at) }}.</p>
      }
      <table class="tbl">
        <thead><tr><th>Protocolo</th><th>Nome</th><th class="num">Pessoas</th><th>Situação</th></tr></thead>
        <tbody>
          @for (b of g.bookings; track b.id) {
            <tr class="click" tabindex="0" (click)="open(b.id)" (keydown.enter)="open(b.id)">
              <td class="mono">{{ b.protocol }}</td><td>{{ b.name }}</td><td class="num">{{ b.party_size }}</td><td><app-status [status]="b.status" /></td>
            </tr>
          }
        </tbody>
      </table>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Fechar</button>
      @if (g.status !== 'realizado') {
        <button mat-flat-button (click)="assign()"><mat-icon>person_add</mat-icon> Trocar/designar embaixador</button>
      }
    </mat-dialog-actions>
  `,
  styleUrl: './dialogs.scss',
})
export class GroupDialog {
  protected g = inject<Group>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<GroupDialog>);
  private dialogs = inject(AdminDialogs);
  protected readonly dateTime = dateTime;

  protected async open(id: number) {
    if (await this.dialogs.booking(id)) this.ref.close(true);
  }
  protected async assign() {
    if (await this.dialogs.assign(this.g)) this.ref.close(true);
  }
}

@Component({
  selector: 'app-assign-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatSelectModule, MatProgressBarModule],
  template: `
    <h2 mat-dialog-title>Designar embaixador</h2>
    <mat-dialog-content>
      <p>{{ g.date_label }}, {{ g.time_label }} · {{ g.people }} pessoa(s)</p>
      @if (items(); as list) {
        <mat-form-field class="full">
          <mat-label>Embaixador</mat-label>
          <mat-select [(ngModel)]="chosen">
            @for (a of list; track a.id) {
              <mat-option [value]="a.id" [disabled]="a.busy">
                {{ a.name }}{{ a.course ? ' · ' + a.course : '' }} · {{ a.busy ? 'ocupado' : a.available ? 'disponível' : 'fora da disponibilidade' }}
              </mat-option>
            }
          </mat-select>
        </mat-form-field>
        <p class="muted">O embaixador e os candidatos são avisados automaticamente.</p>
      } @else {
        <mat-progress-bar mode="indeterminate" />
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Voltar</button>
      <button mat-flat-button [disabled]="!chosen || saving()" (click)="save()">Designar</button>
    </mat-dialog-actions>
  `,
  styleUrl: './dialogs.scss',
})
export class AssignDialog implements OnInit {
  protected g = inject<Group>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<AssignDialog>);
  private api = inject(AdminApi);
  private state = inject(AdminState);
  protected items = signal<AvailableAmbassador[] | null>(null);
  protected saving = signal(false);
  protected chosen: number | null = null;

  async ngOnInit() {
    const r = await this.api.availableAmbassadors(this.g.id);
    this.items.set(r.items);
    this.chosen = r.items.find((a) => a.available && !a.busy)?.id ?? null;
  }

  protected async save() {
    this.saving.set(true);
    if (await this.state.run(this.api.resolveException(this.g.id, { action: 'designar', ambassador_id: this.chosen }), 'Embaixador designado.')) {
      this.state.refresh();
      this.ref.close(true);
    }
    this.saving.set(false);
  }
}

@Component({
  selector: 'app-reschedule-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatSelectModule, MatProgressBarModule],
  template: `
    <h2 mat-dialog-title>Reagendar</h2>
    <mat-dialog-content>
      <p>{{ b.full_name }} · {{ b.party_size }} pessoa(s). Admissões não tem limite de reagendamentos.</p>
      @if (slots(); as list) {
        <mat-form-field class="full">
          <mat-label>Novo horário</mat-label>
          <mat-select [(ngModel)]="chosen">
            @for (s of list; track s.slot_start) {
              <mat-option [value]="s.slot_start">{{ dateLong(s.date) }}, {{ hhmm(s.time) }} — {{ s.remaining }} vagas</mat-option>
            }
          </mat-select>
        </mat-form-field>
      } @else {
        <mat-progress-bar mode="indeterminate" />
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Voltar</button>
      <button mat-flat-button [disabled]="!chosen || saving()" (click)="save()">Reagendar</button>
    </mat-dialog-actions>
  `,
  styleUrl: './dialogs.scss',
})
export class RescheduleDialog implements OnInit {
  protected b = inject<BookingDetail>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<RescheduleDialog>);
  private api = inject(AdminApi);
  private state = inject(AdminState);
  protected slots = signal<Slot[] | null>(null);
  protected saving = signal(false);
  protected chosen: string | null = null;
  protected readonly dateLong = dateLong;
  protected readonly hhmm = hhmm;

  async ngOnInit() {
    const today = this.state.today();
    const token = this.b.manage_url.split('/').pop()!;
    const r = await this.api.slots(today, addDays(today, 60), this.b.party_size, token);
    this.slots.set(r.slots.filter((s) => s.available && s.slot_start !== this.b.slot_start));
  }

  protected async save() {
    this.saving.set(true);
    if (await this.state.run(this.api.patchBooking(this.b.id, { action: 'reschedule', slot_start: this.chosen }), 'Reagendado. O candidato recebeu o novo horário.')) {
      this.ref.close(true);
    }
    this.saving.set(false);
  }
}
