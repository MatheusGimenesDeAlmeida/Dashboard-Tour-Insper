import { Routes } from '@angular/router';

// Todas as telas da plataforma. Ao criar uma rota nova, inclua o caminho também em SPA_PAGES no app/server.py,
// que decide quais endereços entregam o Angular (e exige login nas áreas de Admissões e do embaixador).
// Os links entre áreas (/admin, /embaixador, /login) usam href comum para o servidor conferir o login.
export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home').then((m) => m.Home), title: 'Tours no campus · Insper' },
  { path: 'agendar', loadComponent: () => import('./pages/booking/booking').then((m) => m.Booking), title: 'Agende sua visita · Insper' },
  { path: 'minha-visita/:token', loadComponent: () => import('./pages/my-visit/my-visit').then((m) => m.MyVisit), title: 'Minha visita · Insper' },
  { path: 'nps/grupo/:token', loadComponent: () => import('./pages/nps/nps-group').then((m) => m.NpsGroupPage), title: 'Avalie sua visita · Insper' },
  { path: 'nps/:token', loadComponent: () => import('./pages/nps/nps').then((m) => m.Nps), title: 'Avalie sua visita · Insper' },
  { path: 'login', loadComponent: () => import('./pages/login/login').then((m) => m.Login), title: 'Entrar · Insper' },
  { path: 'caixa-de-entrada', loadComponent: () => import('./pages/inbox/inbox').then((m) => m.Inbox), title: 'Caixa de entrada · Insper' },
  { path: 'embed', loadComponent: () => import('./pages/embed/embed').then((m) => m.Embed), title: 'Botão para o site · Insper' },
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
  {
    // Portal do embaixador. O servidor só entrega estas páginas para quem entrou como embaixador.
    path: 'embaixador',
    loadComponent: () => import('./pages/ambassador/amb-shell').then((m) => m.AmbShell),
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./pages/ambassador/amb-home').then((m) => m.AmbHome), title: 'Início · Embaixador' },
      { path: 'convites', loadComponent: () => import('./pages/ambassador/amb-pages').then((m) => m.AmbInvites), title: 'Convites · Embaixador' },
      { path: 'tours', loadComponent: () => import('./pages/ambassador/amb-pages').then((m) => m.AmbTours), title: 'Meus tours · Embaixador' },
      { path: 'disponibilidade', loadComponent: () => import('./pages/ambassador/amb-pages').then((m) => m.AmbAvailability), title: 'Disponibilidade · Embaixador' },
      { path: 'perfil', loadComponent: () => import('./pages/ambassador/amb-pages').then((m) => m.AmbProfile), title: 'Perfil · Embaixador' },
      { path: '**', redirectTo: '' },
    ],
  },
  { path: '**', redirectTo: '' },
];
