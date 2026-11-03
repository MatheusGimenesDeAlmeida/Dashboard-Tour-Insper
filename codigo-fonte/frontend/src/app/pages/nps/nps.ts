import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';

import { Api, ApiError } from '../../core/api';
import { NpsInfo } from '../../core/models';

/** /nps/:token — avaliação individual depois do tour. */
@Component({
  selector: 'app-nps',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule],
  templateUrl: './nps.html',
  styleUrl: './nps.scss',
})
export class Nps implements OnInit {
  private api = inject(Api);
  private snack = inject(MatSnackBar);

  token = input.required<string>();

  protected info = signal<NpsInfo | null>(null);
  protected error = signal<string | null>(null);
  protected done = signal(false);
  protected sending = signal(false);
  protected missingScore = signal(false);

  protected readonly scores = Array.from({ length: 11 }, (_, i) => i);
  protected score: number | null = null;
  protected rating: number | null = null;
  protected highlight = '';
  protected improvement = '';

  async ngOnInit() {
    try {
      const info = await this.api.nps(this.token());
      this.info.set(info);
      this.done.set(info.answered);
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }

  /** Cor da nota: 0–6 detrator, 7–8 neutro, 9–10 promotor */
  protected tone(n: number) {
    return n <= 6 ? 'low' : n <= 8 ? 'mid' : 'high';
  }

  protected async send() {
    if (this.score === null) {
      this.missingScore.set(true);
      return;
    }
    this.sending.set(true);
    try {
      await this.api.submitNps(this.token(), {
        score: this.score, highlight: this.highlight, improvement: this.improvement, ambassador_rating: this.rating,
      });
      this.done.set(true);
      window.scrollTo({ top: 0 });
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'ja_respondido') this.done.set(true);
      else this.snack.open(err.message, 'OK', { duration: 5000, panelClass: 'snack-error' });
    } finally {
      this.sending.set(false);
    }
  }
}
