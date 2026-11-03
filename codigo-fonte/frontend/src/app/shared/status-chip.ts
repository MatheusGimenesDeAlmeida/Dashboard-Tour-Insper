import { Component, computed, input } from '@angular/core';

import { statusLabel, statusTone } from '../core/status';

/** Etiqueta colorida com a situação (o texto sempre acompanha a cor). */
@Component({
  selector: 'app-status',
  template: `<span class="pill" [class]="tone()">{{ label() }}</span>`,
  styles: `.pill.dark { background: var(--ink); color: #fff; } .pill { font-size: 12px; padding: 3px 10px; }`,
})
export class StatusChip {
  status = input.required<string>();
  protected label = computed(() => statusLabel(this.status()));
  protected tone = computed(() => 'pill ' + statusTone(this.status()));
}
