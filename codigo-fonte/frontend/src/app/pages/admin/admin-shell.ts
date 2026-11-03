import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, OnInit, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { AdminApi } from './admin-api';
import { AdminState } from './admin-state';

/** Estrutura do painel de Admissões: menu lateral + barra superior + seção atual. */
@Component({
  selector: 'app-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatSidenavModule, MatButtonModule, MatIconModule, MatBadgeModule, MatTooltipModule, MatProgressBarModule],
  templateUrl: './admin-shell.html',
  styleUrl: './admin-shell.scss',
})
export class AdminShell implements OnInit {
  protected state = inject(AdminState);
  private admin = inject(AdminApi);
  private router = inject(Router);

  protected isMobile = toSignal(inject(BreakpointObserver).observe('(max-width: 900px)').pipe(map((r) => r.matches)), { initialValue: false });
  protected menuOpen = signal(false);
  protected error = signal<string | null>(null);

  protected main = [
    { path: 'visao-geral', icon: 'space_dashboard', label: 'Visão geral' },
    { path: 'agenda', icon: 'calendar_view_week', label: 'Agenda' },
    { path: 'agendamentos', icon: 'list_alt', label: 'Agendamentos' },
    { path: 'excecoes', icon: 'report', label: 'Exceções', badge: true },
    { path: 'embaixadores', icon: 'diversity_3', label: 'Embaixadores' },
  ];
  protected secondary = [
    { path: 'configuracoes', icon: 'tune', label: 'Configurações' },
    { path: 'mensagens', icon: 'mail', label: 'Mensagens' },
    { path: 'saude', icon: 'monitor_heart', label: 'Saúde e simulação' },
  ];

  constructor() {
    // No celular, o menu fecha ao trocar de seção
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.menuOpen.set(false));
  }

  async ngOnInit() {
    try {
      await this.state.init();
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }

  protected async logout() {
    await this.admin.logout();
    location.href = '/login';
  }
}
