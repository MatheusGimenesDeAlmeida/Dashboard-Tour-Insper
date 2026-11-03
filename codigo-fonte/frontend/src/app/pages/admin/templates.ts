import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { AdminApi, Template } from './admin-api';
import { AdminState } from './admin-state';

const AUDIENCE: Record<string, string> = { candidato: 'Candidato', embaixador: 'Embaixador', admissoes: 'Admissões' };

/** Textos das mensagens automáticas (M1–M12), editáveis por Admissões. */
@Component({
  selector: 'app-admin-templates',
  imports: [FormsModule, MatButtonModule, MatCheckboxModule, MatExpansionModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule],
  template: `
    <header class="adm-head">
      <div><p class="eyebrow">Comunicação</p><h1>Mensagens automáticas</h1></div>
      <p class="muted">Variáveis disponíveis: <code>{{ vars }}</code></p>
    </header>
    @if (items(); as list) {
      <mat-accordion>
        @for (t of list; track t.code) {
          <mat-expansion-panel>
            <mat-expansion-panel-header>
              <mat-panel-title><span class="mono code">{{ t.code }}</span>{{ t.name }}</mat-panel-title>
              <mat-panel-description>
                <span class="pill">{{ audience(t.audience) }}</span>
                <span class="pill">{{ t.channel === 'whatsapp' ? 'WhatsApp' : 'E-mail' }}</span>
                @if (!t.active) { <span class="pill err">desativada</span> }
              </mat-panel-description>
            </mat-expansion-panel-header>
            <mat-form-field class="full"><mat-label>Assunto</mat-label><input matInput [(ngModel)]="t.subject" [name]="'s' + t.code"></mat-form-field>
            <mat-form-field class="full"><mat-label>Texto</mat-label><textarea matInput rows="8" [(ngModel)]="t.body" [name]="'b' + t.code"></textarea></mat-form-field>
            <mat-checkbox [checked]="!!t.active" (change)="t.active = $event.checked ? 1 : 0">Ativa</mat-checkbox>
            <mat-action-row>
              <button mat-button (click)="reset(t)">Restaurar padrão</button>
              <button mat-flat-button (click)="save(t)">Salvar</button>
            </mat-action-row>
          </mat-expansion-panel>
        }
      </mat-accordion>
    } @else { <mat-progress-bar mode="indeterminate" aria-label="Carregando" /> }
  `,
  styles: `
    code { font-size: 12px; background: var(--mat-sys-surface-container); padding: 2px 6px; border-radius: 6px; line-height: 2; }
    .code { display: inline-block; min-width: 44px; color: var(--red-dark); }
    mat-panel-description { justify-content: flex-end; gap: 6px; flex-wrap: wrap; }
    .pill { font-size: 11px; padding: 2px 9px; }
    .full { width: 100%; }
    mat-expansion-panel { --mat-expansion-container-shape: 16px; margin-bottom: 8px; }
  `,
})
export class Templates implements OnInit {
  private api = inject(AdminApi);
  private state = inject(AdminState);
  protected items = signal<Template[] | null>(null);
  protected readonly vars =
    '{nome} {data} {hora} {protocolo} {pessoas} {embaixador} {ponto_de_encontro} {o_que_levar} {link_minha_visita} {link_nps} {link_agendar} {perfil_grupo} {prazo} {link_portal} {mudanca} {motivo}';

  ngOnInit() {
    this.load();
  }
  private async load() {
    this.items.set((await this.api.templates()).items);
  }
  protected audience(a: string) {
    return AUDIENCE[a] ?? a;
  }
  protected save(t: Template) {
    this.state.run(this.api.saveTemplate(t.code, { subject: t.subject, body: t.body, active: !!t.active }), 'Mensagem salva.');
  }
  protected async reset(t: Template) {
    if (await this.state.run(this.api.resetTemplate(t.code), 'Texto padrão restaurado.')) this.load();
  }
}
