import { Routes } from '@angular/router';

// Telas já migradas para o Angular. As demais (/login, /embaixador, /caixa-de-entrada, /embed)
// ainda são servidas pelas páginas antigas em codigo-fonte/static/, por isso os links para elas usam href comum.
// Ao migrar uma tela, inclua a rota aqui e em SPA_PAGES no app/server.py.
export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home').then((m) => m.Home), title: 'Tours no campus · Insper' },
  { path: 'agendar', loadComponent: () => import('./pages/booking/booking').then((m) => m.Booking), title: 'Agende sua visita · Insper' },
  { path: 'minha-visita/:token', loadComponent: () => import('./pages/my-visit/my-visit').then((m) => m.MyVisit), title: 'Minha visita · Insper' },
  { path: 'nps/grupo/:token', loadComponent: () => import('./pages/nps/nps-group').then((m) => m.NpsGroupPage), title: 'Avalie sua visita · Insper' },
  { path: 'nps/:token', loadComponent: () => import('./pages/nps/nps').then((m) => m.Nps), title: 'Avalie sua visita · Insper' },
  {
    // Painel de Admissões. O servidor só entrega estas páginas para quem entrou com perfil de Admissões.
    path: 'admin',
    loadComponent: () => import('./pages/admin/admin-shell').then((m) => m.AdminShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'visao-geral' },
      { path: 'visao-geral', loadComponent: () => import('./pages/admin/overview').then((m) => m.Overview), title: 'Visão geral · Admissões' },
      { path: 'agenda', loadComponent: () => import('./pages/admin/agenda').then((m) => m.Agenda), title: 'Agenda · Admissões' },
      { path: 'agendamentos', loadComponent: () => import('./pages/admin/bookings').then((m) => m.Bookings), title: 'Agendamentos · Admissões' },
      { path: 'excecoes', loadComponent: () => import('./pages/admin/exceptions').then((m) => m.Exceptions), title: 'Exceções · Admissões' },
      { path: 'embaixadores', loadComponent: () => import('./pages/admin/ambassadors').then((m) => m.Ambassadors), title: 'Embaixadores · Admissões' },
      { path: 'configuracoes', loadComponent: () => import('./pages/admin/settings').then((m) => m.Settings), title: 'Configurações · Admissões' },
      { path: 'mensagens', loadComponent: () => import('./pages/admin/templates').then((m) => m.Templates), title: 'Mensagens · Admissões' },
      { path: 'saude', loadComponent: () => import('./pages/admin/health').then((m) => m.Health), title: 'Saúde e simulação · Admissões' },
      { path: '**', redirectTo: 'visao-geral' },
    ],
  },
  { path: '**', redirectTo: '' },
];
