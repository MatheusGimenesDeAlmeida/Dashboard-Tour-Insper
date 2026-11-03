import { Routes } from '@angular/router';

// Telas já migradas para o Angular. As demais (/login, /embaixador, /admin, /caixa-de-entrada, /embed)
// ainda são servidas pelas páginas antigas em codigo-fonte/static/, por isso os links para elas usam href comum.
// Ao migrar uma tela, inclua a rota aqui e em SPA_PAGES no app/server.py.
export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home').then((m) => m.Home), title: 'Tours no campus · Insper' },
  { path: 'agendar', loadComponent: () => import('./pages/booking/booking').then((m) => m.Booking), title: 'Agende sua visita · Insper' },
  { path: 'minha-visita/:token', loadComponent: () => import('./pages/my-visit/my-visit').then((m) => m.MyVisit), title: 'Minha visita · Insper' },
  { path: 'nps/grupo/:token', loadComponent: () => import('./pages/nps/nps-group').then((m) => m.NpsGroupPage), title: 'Avalie sua visita · Insper' },
  { path: 'nps/:token', loadComponent: () => import('./pages/nps/nps').then((m) => m.Nps), title: 'Avalie sua visita · Insper' },
  { path: '**', redirectTo: '' },
];
