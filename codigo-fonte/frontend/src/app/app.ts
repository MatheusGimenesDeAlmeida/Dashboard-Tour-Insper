import { Component, inject } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  constructor() {
    // Ícones: fonte Material Symbols (carregada no index.html)
    inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');
  }
}
