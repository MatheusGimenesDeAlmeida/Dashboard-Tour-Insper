import { Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AmbApi } from './amb-api';

/** Estrutura do portal do embaixador: abas no topo (computador) ou barra de navegação embaixo (celular). */
@Component({
  selector: 'app-amb-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    <header class="bar">
      <div class="wrap inner">
        <a class="brand" routerLink="/embaixador">
          <span class="logo">Insper<span class="dot">.</span></span><span class="area">Embaixador</span>
        </a>
        <div class="right">
          @if (amb.me(); as me) { <span class="who"><span class="avatar" aria-hidden="true">{{ me.ambassador.display_name[0] }}</span><span class="name">{{ me.ambassador.display_name }}</span></span> }
          <button mat-stroked-button class="out" (click)="logout()">Sair</button>
        </div>
      </div>
      <nav class="wrap tabs" aria-label="Seções do portal">
        @for (t of tabs; track t.path) {
          <a [routerLink]="t.path" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: t.path === '.' }" ariaCurrentWhenActive="page">
            <mat-icon>{{ t.icon }}</mat-icon><span>{{ t.label }}</span>
            @if (t.path === 'convites' && amb.pendingInvites()) { <b class="count">{{ amb.pendingInvites() }}</b> }
            @if (t.path === 'disponibilidade' && amb.me()?.availability_stale) { <b class="count">!</b> }
          </a>
        }
      </nav>
    </header>
    <main class="wrap page">
      @if (error(); as msg) {
        <div class="notice error" role="alert"><mat-icon>error</mat-icon>{{ msg }}</div>
      } @else if (amb.me()) {
        <router-outlet />
      } @else {
        <mat-progress-bar mode="indeterminate" aria-label="Carregando" />
      }
    </main>
  `,
  styles: `
    :host { display: block; min-height: 100vh; background: var(--page); }
    .bar { background: var(--ink); color: #fff; position: sticky; top: 0; z-index: 20; }
    .inner { display: flex; align-items: center; justify-content: space-between; height: 60px; }
    .brand { display: flex; align-items: baseline; gap: 10px; text-decoration: none; color: #fff; }
    .logo { font-family: var(--serif); font-weight: 700; font-size: 23px; letter-spacing: -.02em; } .dot { color: var(--red); }
    .area { font-size: 14px; color: rgba(255,255,255,.65); padding-left: 10px; border-left: 1px solid rgba(255,255,255,.2); }
    .right { display: flex; align-items: center; gap: 14px; }
    .who { display: flex; align-items: center; gap: 8px; font-size: 14px; color: rgba(255,255,255,.85); }
    .avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--red); display: grid; place-items: center; font-weight: 700; font-size: 13px; color: #fff; }
    .out { --mat-button-outlined-label-text-color: #fff; --mat-button-outlined-outline-color: rgba(255,255,255,.3); }
    .tabs { display: flex; gap: 4px; overflow-x: auto; }
    .tabs a { display: flex; align-items: center; gap: 8px; padding: 12px 14px; color: rgba(255,255,255,.7); text-decoration: none; font-weight: 500;
      font-size: 15px; border-bottom: 3px solid transparent; white-space: nowrap; position: relative;
      mat-icon { font-size: 20px; width: 20px; height: 20px; }
      &:hover { color: #fff; } &.on { color: #fff; border-color: var(--red); mat-icon { font-variation-settings: 'FILL' 1; } } }
    .count { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; background: var(--red); color: #fff; font-size: 11px; display: grid; place-items: center; }
    .page { padding-top: 28px; }
    // No celular, as abas viram uma barra de navegação fixa embaixo, como num aplicativo
    @media (max-width: 720px) {
      .name { display: none; }
      .tabs { position: fixed; bottom: 0; left: 0; right: 0; z-index: 30; background: var(--ink); padding: 4px 4px calc(4px + env(safe-area-inset-bottom));
        justify-content: space-around; box-shadow: 0 -6px 20px rgba(0,0,0,.2); }
      .tabs a { flex-direction: column; gap: 2px; padding: 6px 4px; font-size: 11px; border: 0; flex: 1; justify-content: center;
        mat-icon { font-size: 24px; width: 24px; height: 24px; } &.on { color: #fff; mat-icon { color: var(--red); } } }
      .count { position: absolute; top: 2px; left: 55%; }
      .page { padding-bottom: 110px; }
    }
  `,
})
export class AmbShell implements OnInit {
  protected amb = inject(AmbApi);
  protected error = signal<string | null>(null);
  protected tabs = [
    { path: '.', icon: 'home', label: 'Início' },
    { path: 'convites', icon: 'mail', label: 'Convites' },
    { path: 'tours', icon: 'tour', label: 'Meus tours' },
    { path: 'disponibilidade', icon: 'event_available', label: 'Disponibilidade' },
    { path: 'perfil', icon: 'person', label: 'Perfil' },
  ];

  async ngOnInit() {
    try {
      await Promise.all([this.amb.loadMe(), this.amb.invitations()]);
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }

  protected async logout() {
    await this.amb.logout();
    location.href = '/login';
  }
}
