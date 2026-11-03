import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { splitDateLabel } from '../core/format';
import { BookingView } from '../core/models';

/** Comprovante da visita, usado na confirmação do agendamento e em Minha visita. */
@Component({
  selector: 'app-ticket',
  imports: [MatIconModule],
  template: `
    <article class="ticket" aria-label="Comprovante da visita">
      <div class="top">
        <span class="kicker">Tour no campus do Insper</span>
        <div class="when">{{ day()[0] }}, {{ booking().time_label }}</div>
        <div class="date">{{ day()[1] }}</div>
      </div>
      <div class="cut" aria-hidden="true"></div>
      <dl class="rows">
        @if (showAmbassador()) {
          <div class="row"><mat-icon>person</mat-icon><div><dt>Embaixador</dt>
            <dd>{{ booking().ambassador || 'Aguardando confirmação. Avisamos por e-mail.' }}</dd></div></div>
        }
        <div class="row"><mat-icon>group</mat-icon><div><dt>Pessoas</dt><dd>{{ booking().party_size }}</dd></div></div>
        <div class="row"><mat-icon>location_on</mat-icon><div><dt>Local de encontro</dt><dd>{{ booking().meeting_point }}</dd></div></div>
        <div class="row"><mat-icon>badge</mat-icon><div><dt>Leve</dt><dd>{{ booking().what_to_bring }}</dd></div></div>
        <div class="row"><mat-icon>confirmation_number</mat-icon><div><dt>Protocolo</dt><dd class="protocol">{{ booking().protocol }}</dd></div></div>
      </dl>
    </article>
  `,
  styles: `
    .ticket { background: var(--card); border-radius: var(--radius-lg); box-shadow: var(--shadow-up); overflow: hidden; }
    .top { background: var(--ink); color: #fff; padding: 26px 28px 30px; }
    .kicker { font-size: 12px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: rgba(255,255,255,.6); }
    .when { font-family: var(--serif); font-size: clamp(26px, 4vw, 34px); font-weight: 700; margin-top: 8px; }
    .when::first-letter { text-transform: uppercase; }
    .date { color: rgba(255,255,255,.75); margin-top: 2px; }
    .cut { height: 22px; margin-top: -11px; background:
      radial-gradient(circle at 0 50%, var(--page) 11px, transparent 12px),
      radial-gradient(circle at 100% 50%, var(--page) 11px, transparent 12px); position: relative; }
    .cut::after { content: ''; position: absolute; left: 22px; right: 22px; top: 50%; border-top: 2px dashed var(--line); }
    .rows { margin: 0; padding: 4px 28px 22px; display: grid; gap: 16px; }
    .row { display: flex; gap: 14px; align-items: flex-start; }
    .row mat-icon { color: var(--muted); flex: none; }
    dt { font-size: 12px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
    dd { margin: 2px 0 0; }
    .protocol { font-family: ui-monospace, "SF Mono", Consolas, monospace; font-weight: 600; letter-spacing: .04em; }
  `,
})
export class Ticket {
  booking = input.required<BookingView>();
  showAmbassador = input(false);
  protected day = computed(() => splitDateLabel(this.booking().date_label));
}
