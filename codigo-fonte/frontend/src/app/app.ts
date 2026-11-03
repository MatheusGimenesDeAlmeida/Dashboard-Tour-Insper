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

  /** O painel de Admissões tem cabeçalho próprio; o do site público some ali. */
  protected isAdmin = toSignal(
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url.startsWith('/admin'))),
    { initialValue: location.pathname.startsWith('/admin') },
  );

  constructor() {
    // Ícones: fonte Material Symbols (carregada no index.html)
    inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');
  }
}
