import { Injectable, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

import { Api } from '../../core/api';
import { AdminApi, Me } from './admin-api';

/** Estado compartilhado pelas seções do painel: usuário, "hoje" da plataforma e contador de exceções. */
@Injectable({ providedIn: 'root' })
export class AdminState {
  private api = inject(Api);
  private admin = inject(AdminApi);
  private snack = inject(MatSnackBar);

  readonly me = signal<Me | null>(null);
  readonly today = signal<string>(''); // AAAA-MM-DD no fuso de São Paulo (respeita o relógio simulado)
  readonly now = signal<string>(new Date().toISOString());
  readonly openExceptions = signal(0);
  readonly ready = signal(false);

  async init() {
    const [me, cfg, jobs, exc] = await Promise.all([this.admin.me(), this.api.config(), this.admin.jobs(), this.admin.exceptions()]);
    this.me.set(me.user);
    this.today.set(cfg.today);
    this.now.set(jobs.now);
    this.openExceptions.set(exc.items.length);
    this.ready.set(true);
  }

  /** Atualiza relógio e contador depois de uma ação que pode mudá-los. */
  async refresh() {
    const [cfg, jobs, exc] = await Promise.all([this.api.config(), this.admin.jobs(), this.admin.exceptions()]);
    this.today.set(cfg.today);
    this.now.set(jobs.now);
    this.openExceptions.set(exc.items.length);
  }

  toast(msg: string, error = false) {
    this.snack.open(msg, 'OK', { duration: error ? 6000 : 3500, panelClass: error ? 'snack-error' : undefined });
  }

  /** Executa uma ação, mostra o resultado e devolve true se deu certo. */
  async run(action: Promise<unknown>, ok = 'Feito.'): Promise<boolean> {
    try {
      await action;
      this.toast(ok);
      return true;
    } catch (e) {
      this.toast((e as Error).message, true);
      return false;
    }
  }
}
