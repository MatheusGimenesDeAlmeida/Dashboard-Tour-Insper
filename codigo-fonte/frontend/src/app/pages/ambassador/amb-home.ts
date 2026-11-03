import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { dateLong, hhmm, num } from '../../core/format';
import { AmbApi, AmbStats, Invitation, Opportunities } from './amb-api';
import { OfferCard, respondInvite } from './amb-cards';

// Níveis e benefícios. Hoje só existem brinde e voucher; os demais são exemplos para Admissões validar.
const LEVELS = [
  { name: 'Bronze', min: 0, color: '#d29a68', perks: ['Brinde e voucher de almoço a cada tour'] },
  { name: 'Prata', min: 60, color: '#aab6c0', perks: ['Certificado de horas complementares'] },
  { name: 'Ouro', min: 160, color: '#ffcc00', perks: ['Recebe convites antes dos demais', 'Kit Insper exclusivo'] },
  { name: 'Diamante', min: 320, color: '#8fd8ff', perks: ['Carta de recomendação de Admissões', 'Convite para eventos do Insper'] },
];
const BADGES: [string, string, string, (s: AmbStats) => boolean][] = [
  ['military_tech', 'Primeiro tour', '1 tour conduzido', (s) => s.tours_total >= 1],
  ['emoji_events', '10 tours', '10 tours conduzidos', (s) => s.tours_total >= 10],
  ['groups', '50 visitantes', '50 pessoas recebidas', (s) => s.people_total >= 50],
  ['star', 'Nota 5', 'avaliação máxima de um candidato', (s) => s.five_stars >= 1],
  ['bolt', 'Resposta rápida', '3 convites aceitos em até 1h', (s) => s.fast_accepts >= 3],
  ['translate', 'Poliglota', 'tour em outro idioma', (s) => s.foreign_tours >= 1],
  ['local_fire_department', 'Mês cheio', '4 tours no mesmo mês', (s) => s.tours_month >= 4],
  ['task_alt', 'Presença em dia', 'nenhuma presença pendente', (s) => s.tours_total >= 3 && !s.pending_presence],
];

@Component({
  selector: 'app-amb-home',
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule, OfferCard],
  templateUrl: './amb-home.html',
  styleUrl: './amb-home.scss',
})
export class AmbHome implements OnInit {
  private amb = inject(AmbApi);
  private dialog = inject(MatDialog);

  protected st = signal<AmbStats | null>(null);
  protected invites = signal<Invitation[]>([]);
  protected now = signal('');
  protected opp = signal<Opportunities | null>(null);
  protected readonly levels = LEVELS;
  protected readonly num = num;
  protected readonly hhmm = hhmm;
  protected readonly dateLong = dateLong;
  protected first = computed(() => this.amb.me()!.ambassador.display_name.split(' ')[0]);

  protected level = computed(() => {
    const pts = this.st()?.game.points ?? 0;
    const lvl = [...LEVELS].reverse().find((l) => pts >= l.min)!;
    const next = LEVELS[LEVELS.indexOf(lvl) + 1];
    return { pts, lvl, next, pct: next ? Math.round((100 * (pts - lvl.min)) / (next.min - lvl.min)) : 100 };
  });
  protected badges = computed(() => {
    const s = this.st();
    return s ? BADGES.map(([icon, title, how, test]) => ({ icon, title, how, earned: test(s) })) : [];
  });
  protected earned = computed(() => this.badges().filter((b) => b.earned).length);
  protected challengesDone = computed(() => (this.st()?.game.challenges ?? []).filter((c) => c.progress >= c.goal).length);
  protected requirements = computed(() => {
    const s = this.st()!;
    return [
      { title: 'Aceite de convites', value: s.accept_rate === null ? '—' : `${s.accept_rate}%`, goal: 'mínimo 80%', ok: s.accept_rate === null || s.accept_rate >= 80 },
      { title: 'Nota dos candidatos', value: s.rating_avg === null ? 'sem notas' : num(s.rating_avg), goal: 'mínimo 4,5', ok: s.rating_avg === null || s.rating_avg >= 4.5 },
      { title: 'Presença registrada', value: s.pending_presence ? `${s.pending_presence} pendente(s)` : 'em dia', goal: 'nenhuma pendência', ok: !s.pending_presence },
    ];
  });
  protected earnings = computed(() => {
    const g = this.st()!.game;
    return [
      { icon: 'tour', title: 'Tour conduzido', pts: g.rules.tour, total: g.parts.tours },
      { icon: 'local_fire_department', title: 'Tour em horário em alta', pts: g.rules.hot, total: g.parts.hot },
      { icon: 'bolt', title: 'Aceite em até 1 hora', pts: g.rules.fast, total: g.parts.fast },
      { icon: 'star', title: 'Nota 5 de um candidato', pts: g.rules.five, total: g.parts.five },
    ];
  });

  ngOnInit() {
    this.load();
  }
  private async load() {
    const [st, inv, opp] = await Promise.all([this.amb.stats(), this.amb.invitations(), this.amb.opportunities()]);
    this.st.set(st);
    this.invites.set(inv.invitations);
    this.now.set(inv.now);
    this.opp.set(opp);
  }

  protected async respond(inv: Invitation, accept: boolean) {
    if (await respondInvite(this.amb, this.dialog, inv, accept)) this.load();
  }
  protected async claim(groupId: number) {
    if (await this.amb.run(this.amb.claim(groupId), 'Tour assumido. O grupo já recebeu seu nome.')) this.load();
  }
  protected async addHot(date: string, time: string) {
    if (await this.amb.run(this.amb.addAvailability(date, time), 'Disponibilidade adicionada. Os próximos convites desse horário podem vir para você.')) this.load();
  }
  protected challengeIcon(id: string, done: boolean) {
    return done ? 'check' : id === 'hot1' ? 'local_fire_department' : id === 'fast2' ? 'bolt' : 'calendar_month';
  }
  protected timeOf(iso: string) {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).replace(':00', 'h').replace(':', 'h');
  }
  protected dayOf(iso: string) {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));
  }
}
