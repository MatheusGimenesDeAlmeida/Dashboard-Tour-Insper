import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { Api } from '../../core/api';
import { ACTIVE_STATUSES, BookingView } from '../../core/models';
import { Ticket } from '../../shared/ticket';

/** /minha-visita/:token — ver, confirmar presença, reagendar ou cancelar. */
@Component({
  selector: 'app-my-visit',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatProgressBarModule, Ticket],
  templateUrl: './my-visit.html',
  styleUrl: './my-visit.scss',
})
export class MyVisit implements OnInit {
  private api = inject(Api);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  token = input.required<string>();

  protected visit = signal<BookingView | null>(null);
  protected error = signal<string | null>(null);
  protected busy = signal(false);

  protected active = computed(() => ACTIVE_STATUSES.includes(this.visit()?.status ?? ''));
  protected tone = computed(() => this.visit()?.status === 'confirmado' ? 'ok' : this.active() ? 'warn' : '');

  async ngOnInit() {
    try {
      this.visit.set(await this.api.booking(this.token()));
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }

  protected async confirmPresence() {
    this.busy.set(true);
    try {
      this.visit.set(await this.api.confirmAttendance(this.token()));
      this.snack.open('Presença confirmada. Até lá!', 'OK', { duration: 4000 });
    } catch (e) {
      this.snack.open((e as Error).message, 'OK', { duration: 5000, panelClass: 'snack-error' });
    } finally {
      this.busy.set(false);
    }
  }

  protected async cancel() {
    const v = this.visit()!;
    const ref = this.dialog.open(CancelDialog, { data: v, width: '480px', maxWidth: 'calc(100vw - 32px)', autoFocus: 'dialog' });
    const reason = await firstValueFrom(ref.afterClosed());
    if (!reason) return;
    this.busy.set(true);
    try {
      this.visit.set(await this.api.cancel(this.token(), reason));
      this.snack.open('Visita cancelada. A vaga foi liberada.', 'OK', { duration: 4000 });
    } catch (e) {
      this.snack.open((e as Error).message, 'OK', { duration: 5000, panelClass: 'snack-error' });
    } finally {
      this.busy.set(false);
    }
  }
}

@Component({
  selector: 'app-cancel-dialog',
  imports: [FormsModule, MatButtonModule, MatDialogModule, MatRadioModule],
  template: `
    <h2 mat-dialog-title>Cancelar visita?</h2>
    <mat-dialog-content>
      <p>A visita de {{ data.date_label }}, às {{ data.time_label }}, será cancelada e a vaga liberada na hora.</p>
      <p class="label" id="motivo">Motivo (opcional)</p>
      <mat-radio-group [(ngModel)]="reason" aria-labelledby="motivo" class="reasons">
        @for (r of reasons; track r) { <mat-radio-button [value]="r">{{ r[0].toUpperCase() + r.slice(1) }}</mat-radio-button> }
      </mat-radio-group>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Manter visita</button>
      <button mat-flat-button class="danger" [mat-dialog-close]="reason">Cancelar visita</button>
    </mat-dialog-actions>
  `,
  styles: `
    .label { font-weight: 600; margin: 16px 0 4px; color: var(--ink); }
    .reasons { display: flex; flex-direction: column; }
    .danger { --mat-button-filled-container-color: var(--err); }
  `,
})
export class CancelDialog {
  protected data = inject<BookingView>(MAT_DIALOG_DATA);
  protected ref = inject(MatDialogRef<CancelDialog>);
  protected reasons = ['não poderei ir', 'já conheci o campus', 'outro'];
  protected reason = this.reasons[0];
}
