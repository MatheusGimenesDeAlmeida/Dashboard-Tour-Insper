import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';

import { Api } from '../../core/api';
import { safeNext } from '../../core/safe-next';

interface DevUser { email: string; name: string; role: string }

/** /login — link mágico por e-mail; em desenvolvimento, acesso rápido com os usuários fictícios. */
@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <div class="wrap page">
      <div class="layout">
        <section class="card main">
          <p class="eyebrow">Área restrita</p>
          <h1>Entrar</h1>
          <p class="muted">Para embaixadores e equipe de Admissões. Enviamos um link de acesso para o seu e-mail.</p>
          @if (erro()) {
            <div class="notice error" role="alert"><mat-icon>link_off</mat-icon>O link de acesso expirou ou é inválido. Peça um novo.</div>
          }
          @if (sent(); as msg) {
            <div class="notice ok-notice" role="status"><mat-icon>mark_email_read</mat-icon>{{ msg }}</div>
          } @else {
            <form (ngSubmit)="send()">
              <mat-form-field class="full">
                <mat-label>E-mail institucional</mat-label>
                <mat-icon matPrefix>mail</mat-icon>
                <input matInput type="email" name="email" autocomplete="email" required [(ngModel)]="email">
              </mat-form-field>
              <button mat-flat-button type="submit" class="full" [disabled]="!email || sending()">
                {{ sending() ? 'Enviando…' : 'Enviar link de acesso' }}
              </button>
            </form>
            <p class="sso"><mat-icon>badge</mat-icon>Entrar com a conta Microsoft do Insper: a configurar com a TI.</p>
          }
        </section>

        @if (users().length) {
          <section class="card demo">
            <h2 class="sec"><mat-icon>bolt</mat-icon> Acesso rápido de demonstração</h2>
            <p class="muted">Só existe no modo de demonstração. Os links enviados por e-mail ficam na
              <a routerLink="/caixa-de-entrada">caixa de entrada simulada</a>.</p>
            <h3>Admissões</h3>
            <div class="users">
              @for (u of admins(); track u.email) {
                <button type="button" class="user" (click)="quick(u)"><span class="av adm">{{ u.name[0] }}</span>{{ u.name }}</button>
              }
            </div>
            <h3>Embaixadores</h3>
            <div class="users">
              @for (u of ambassadors(); track u.email) {
                <button type="button" class="user" (click)="quick(u)"><span class="av">{{ u.name[0] }}</span>{{ u.name }}</button>
              }
            </div>
          </section>
        }
      </div>
    </div>
  `,
  styles: `
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 24px; align-items: start; max-width: 980px; margin: 0 auto; }
    @media (max-width: 820px) { .layout { grid-template-columns: 1fr; } }
    .main { padding: 32px; } h1 { margin-bottom: 6px; }
    .full { width: 100%; }
    form { margin-top: 20px; display: grid; gap: 8px; }
    .notice { margin-top: 16px; } .ok-notice { background: var(--ok-soft); color: var(--ok); }
    .sso { display: flex; align-items: center; gap: 8px; margin: 20px 0 0; font-size: 13px; color: var(--muted); mat-icon { font-size: 18px; width: 18px; height: 18px; } }
    .demo { .sec { display: flex; align-items: center; gap: 8px; mat-icon { color: #c98500; } } a { color: var(--red); } }
    h3 { font-family: var(--sans); font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 18px 0 8px; }
    .users { display: flex; flex-wrap: wrap; gap: 8px; }
    .user { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px 6px 6px; border-radius: 999px; border: 1.5px solid var(--line);
      background: var(--card); font: 500 14px var(--sans); color: var(--ink); cursor: pointer;
      &:hover { border-color: var(--ink); } }
    .av { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: var(--red-soft); color: var(--red-dark); font-weight: 700; font-size: 12px;
      &.adm { background: var(--ink); color: #fff; } }
  `,
})
export class Login implements OnInit {
  private api = inject(Api);
  next = input<string>();
  erro = input<string>();

  protected email = '';
  protected sending = signal(false);
  protected sent = signal<string | null>(null);
  protected users = signal<DevUser[]>([]);
  protected admins = computed(() => this.users().filter((u) => u.role === 'admissions'));
  protected ambassadors = computed(() => this.users().filter((u) => u.role !== 'admissions'));

  async ngOnInit() {
    try {
      this.users.set((await this.api.request<{ users: DevUser[] }>('GET', '/api/auth/dev-users')).users);
    } catch {
      // Sem acesso rápido fora do modo de demonstração
    }
  }

  protected async send() {
    this.sending.set(true);
    try {
      const r = await this.api.request<{ message: string }>('POST', '/api/auth/magic-link', { email: this.email });
      this.sent.set(r.message);
    } catch (e) {
      this.sent.set(null);
      alert((e as Error).message);
    } finally {
      this.sending.set(false);
    }
  }

  protected async quick(u: DevUser) {
    const r = await this.api.request<{ redirect: string }>('POST', '/api/auth/dev-login', { email: u.email });
    location.href = safeNext(this.next() ?? null, u.role, r.redirect);
  }
}
