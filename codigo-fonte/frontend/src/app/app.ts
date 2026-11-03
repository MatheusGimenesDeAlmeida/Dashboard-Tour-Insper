import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconRegistry } from '@angular/material/icon';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: { '[class.app-admin]': 'isAdmin()' },
})
export class App {
  private router = inject(Router);

  /** O painel de Admissões e o portal do embaixador têm cabeçalho próprio; o do site público some ali. */
  protected isAdmin = toSignal(
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => App.ownShell(this.router.url))),
    { initialValue: App.ownShell(location.pathname) },
  );

  private static ownShell(url: string) {
    return url.startsWith('/admin') || url.startsWith('/embaixador');
  }

  constructor() {
    // Ícones: fonte Material Symbols (carregada no index.html)
    inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');
  }
}
