import { Component, OnInit, inject, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';

import { Api } from '../../core/api';
import { NpsGroup } from '../../core/models';

/** /nps/grupo/:token — QR mostrado pelo embaixador no fim do tour: cada pessoa toca no próprio nome. */
@Component({
  selector: 'app-nps-group',
  imports: [RouterLink, MatIconModule, MatProgressBarModule],
  template: `
    <div class="wrap page"><div class="narrow">
      @if (error(); as msg) {
        <h1>Link indisponível</h1>
        <div class="notice error" role="alert"><mat-icon>link_off</mat-icon>{{ msg }}</div>
      } @else if (group(); as g) {
        <p class="eyebrow">Avalie sua visita</p>
        <h1>Como foi a visita?</h1>
        <p class="lead">Tour de {{ g.date_label }}. Toque no seu nome para avaliar.</p>
        @if (g.people.length) {
          <div class="people">
            @for (p of g.people; track p.token) {
              @if (p.answered) {
                <span class="person done"><mat-icon>check_circle</mat-icon>{{ p.first_name }}</span>
              } @else {
                <a class="person" [routerLink]="['/nps', p.token]"><mat-icon>person</mat-icon>{{ p.first_name }}</a>
              }
            }
          </div>
        } @else {
          <div class="notice"><mat-icon>info</mat-icon>Nenhum participante encontrado.</div>
        }
      } @else {
        <mat-progress-bar mode="indeterminate" aria-label="Carregando" />
      }
    </div></div>
  `,
  styles: `
    .people { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-top: 24px; }
    .person { display: flex; align-items: center; gap: 10px; padding: 18px; border-radius: var(--radius); background: var(--card);
      box-shadow: var(--shadow); text-decoration: none; font-weight: 600; font-size: 17px; color: var(--ink); }
    a.person:hover { box-shadow: var(--shadow-up); transform: translateY(-1px); }
    a.person mat-icon { color: var(--red); }
    .done { opacity: .55; mat-icon { color: var(--ok); } }
  `,
})
export class NpsGroupPage implements OnInit {
  private api = inject(Api);
  token = input.required<string>();
  protected group = signal<NpsGroup | null>(null);
  protected error = signal<string | null>(null);

  async ngOnInit() {
    try {
      this.group.set(await this.api.npsGroup(this.token()));
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }
}
