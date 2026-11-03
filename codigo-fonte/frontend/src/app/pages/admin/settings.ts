import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';

import { dateShort, hhmm } from '../../core/format';
import { AdminApi, Config, ConfigResponse } from './admin-api';
import { AdminState } from './admin-state';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const HIDEABLE = [
  ['companions_names', 'Nome dos acompanhantes'], ['mobility', 'Restrição de locomoção'],
  ['questions', 'Dúvidas'], ['whatsapp_opt_in', 'Opt-in de WhatsApp'],
] as const;

/** Configurações da operação (itens [A CONFIRMAR] da especificação), bloqueios e cursos. */
@Component({
  selector: 'app-admin-settings',
  imports: [FormsModule, MatButtonModule, MatCheckboxModule, MatChipsModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule, MatSelectModule],
  templateUrl: './settings.html',
  styles: `
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 20px; align-items: start; margin-bottom: 20px; }
    @media (max-width: 420px) { .grid { grid-template-columns: 1fr; } }
    .card { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    mat-form-field { width: 100%; }
    .label { font-size: 14px; font-weight: 500; color: var(--ink-2); margin: 4px 0 8px; }
    mat-checkbox { display: block; margin: 2px 0; }
    .list { list-style: none; padding: 0; margin: 0 0 12px;
      li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 14px; } }
    .inline { display: flex; gap: 8px; align-items: flex-start; flex-wrap: wrap; mat-form-field { flex: 1; min-width: 140px; } button { margin-top: 8px; } }
    .pill { font-size: 11px; padding: 1px 8px; margin-left: 6px; }
    .save-bar { position: sticky; bottom: 0; z-index: 2; display: flex; justify-content: flex-end; gap: 10px; padding: 12px 0; background: linear-gradient(transparent, var(--page) 35%); }
  `,
})
export class Settings implements OnInit {
  private api = inject(AdminApi);
  private state = inject(AdminState);

  protected readonly weekdays = WEEKDAYS;
  protected readonly hideable = HIDEABLE;
  protected readonly hhmm = hhmm;
  protected readonly dateShort = dateShort;
  protected data = signal<ConfigResponse | null>(null);
  /** Cópia editável da configuração (os campos são alterados direto pelo ngModel). */
  protected cfg = signal<Config | null>(null);
  private get c() { return this.cfg()!; }
  protected times = '';
  protected langs = '';
  protected saving = signal(false);
  protected bl = { date: '', start_time: '', reason: '' };
  protected newCourse = '';

  ngOnInit() {
    this.load();
  }
  private async load() {
    const r = await this.api.config();
    this.times = r.config.start_times.join(', ');
    this.langs = r.config.languages.join(', ');
    this.data.set(r);
    this.cfg.set(structuredClone(r.config));
  }

  protected hasDay(i: number) { return this.c.weekdays.includes(i); }
  protected toggleDay(i: number) {
    const w = this.c.weekdays;
    this.c.weekdays = w.includes(i) ? w.filter((x) => x !== i) : [...w, i].sort();
  }
  protected isHidden(k: string) { return this.c.hidden_fields.includes(k); }
  protected toggleHidden(k: string, on: boolean) {
    const h = this.c.hidden_fields.filter((x) => x !== k);
    this.c.hidden_fields = on ? [...h, k] : h;
  }

  protected async save() {
    this.saving.set(true);
    const body: Partial<Config> = {
      ...this.c,
      start_times: this.times.split(',').map((s) => s.trim()).filter(Boolean),
      languages: this.langs.split(',').map((s) => s.trim()).filter(Boolean),
    };
    if (await this.state.run(this.api.saveConfig(body), 'Configurações salvas.')) await this.load();
    this.saving.set(false);
  }
  protected async addBlackout() {
    if (await this.state.run(this.api.addBlackout(this.bl), 'Bloqueio adicionado.')) {
      this.bl = { date: '', start_time: '', reason: '' };
      this.load();
    }
  }
  protected async removeBlackout(id: number) {
    if (await this.state.run(this.api.removeBlackout(id), 'Bloqueio removido.')) this.load();
  }
  protected async toggleCourse(id: number, active: boolean) {
    if (await this.state.run(this.api.patchCourse(id, { active: !active }), active ? 'Curso ocultado.' : 'Curso visível.')) this.load();
  }
  protected async addCourse() {
    if (await this.state.run(this.api.addCourse(this.newCourse), 'Curso adicionado.')) {
      this.newCourse = '';
      this.load();
    }
  }
}
