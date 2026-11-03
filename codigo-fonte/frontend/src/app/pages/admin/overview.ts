import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';

import { addDays, dateLong, dateShort, hhmm, num } from '../../core/format';
import { AdminApi, Dashboard } from './admin-api';
import { AdminState } from './admin-state';

type Status = 'ok' | 'warn' | 'crit' | 'none';

interface Kpi { icon: string; label: string; value: string; unit: string; status: Status; progress: number; foot: string }

const PRESETS = [
  { key: '7', label: '7 dias', back: 7, fwd: 0 },
  { key: '30', label: '30 dias', back: 30, fwd: 0 },
  { key: '90', label: '90 dias', back: 90, fwd: 0 },
  { key: 'next14', label: 'Próximos 14 dias', back: 0, fwd: 14 },
];
const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const AUDIENCE: Record<string, string> = { candidato: 'Candidatos', embaixador: 'Embaixadores', admissoes: 'Admissões' };
// Cores categóricas validadas (paleta de referência, slots 1–3) e rampa sequencial de um só tom
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a'];
const JOURNEY_ICONS: Record<string, string> = {
  calendar: 'event', users: 'group', bell: 'notifications', pin: 'location_on', star: 'star', 'check-circle': 'task_alt',
};

@Component({
  selector: 'app-admin-overview',
  imports: [MatButtonModule, MatButtonToggleModule, MatIconModule, MatProgressBarModule, MatTooltipModule],
  templateUrl: './overview.html',
  styleUrl: './overview.scss',
})
export class Overview implements OnInit {
  private api = inject(AdminApi);
  private router = inject(Router);
  protected state = inject(AdminState);

  protected readonly presets = PRESETS;
  protected readonly series = SERIES;
  protected readonly num = num;
  protected readonly hhmm = hhmm;
  protected preset = signal('30');
  protected d = signal<Dashboard | null>(null);
  protected loading = signal(false);
  protected error = signal<string | null>(null);

  protected period = computed(() => {
    const p = PRESETS.find((x) => x.key === this.preset())!;
    const t = this.state.today();
    return { from: addDays(t, -p.back), to: addDays(t, p.fwd) };
  });
  protected periodLabel = computed(() => `${dateShort(this.period().from)} a ${dateShort(this.period().to)}`);
  protected todayLabel = computed(() => dateLong(this.state.today()));
  protected csvUrl = computed(() => `/api/admin/export/dashboard.csv?from=${this.period().from}&to=${this.period().to}`);

  protected pending = computed(() => {
    const a = this.d()?.alerts;
    if (!a) return [];
    const items: { icon: string; tone: string; title: string; sub: string; n: number; go: () => void }[] = [];
    if (a.open_exceptions) items.push({ icon: 'report', tone: 'red', title: a.open_exceptions === 1 ? 'Grupo sem embaixador' : 'Grupos sem embaixador',
      sub: 'Designar, conduzir ou propor nova data', n: a.open_exceptions, go: () => this.router.navigate(['/admin/excecoes']) });
    if (a.invites_expiring) items.push({ icon: 'schedule', tone: 'amber', title: a.invites_expiring === 1 ? 'Convite vencendo' : 'Convites vencendo',
      sub: 'Vencem em até 6 h', n: a.invites_expiring, go: () => this.router.navigate(['/admin/agenda']) });
    if (a.presence_pending) items.push({ icon: 'how_to_reg', tone: 'gray', title: 'Presenças sem registro',
      sub: 'Marcar compareceu ou não compareceu', n: a.presence_pending,
      go: () => this.router.navigate(['/admin/agendamentos'], { queryParams: { status: 'presenca_pendente' } }) });
    return items;
  });
  protected pendingTotal = computed(() => this.pending().reduce((s, x) => s + x.n, 0));
  protected peopleToday = computed(() => (this.d()?.today ?? []).reduce((s, g) => s + g.people, 0));

  protected kpis = computed<Kpi[]>(() => {
    const d = this.d();
    if (!d) return [];
    const st = (v: number | null, ok: (x: number) => boolean, warn: (x: number) => boolean): Status =>
      v === null || v === undefined ? 'none' : ok(v) ? 'ok' : warn(v) ? 'warn' : 'crit';
    const rr = d.realized_rate, fc = d.first_confirmation_seconds, mt = d.manual_tasks_per_tour, nps = d.nps;
    const fcMin = fc.avg === null ? null : fc.avg / 60;
    return [
      { icon: 'task_alt', label: 'Realizados ÷ agendados', value: rr.gross === null ? '—' : num(rr.gross, 0), unit: rr.gross === null ? '' : '%',
        status: st(rr.gross, (v) => v >= 85, (v) => v >= 75), progress: rr.gross === null ? 0 : rr.gross / 85, foot: 'Meta 85% · antes 63%' },
      { icon: 'bolt', label: '1ª confirmação', value: fcMin === null ? '—' : fcMin < 1 ? num(fc.avg, 0) : num(fcMin, 1),
        unit: fcMin === null ? '' : fcMin < 1 ? 's' : 'min', status: st(fc.avg, (v) => v <= 300, (v) => v <= 3600),
        progress: fc.avg === null ? 0 : Math.min(1, 300 / Math.max(fc.avg, 1)), foot: 'Meta 5 min · antes ~26 h' },
      { icon: 'back_hand', label: 'Tarefas manuais por tour', value: mt.value === null ? '—' : num(mt.value, 1), unit: '',
        status: st(mt.value, (v) => v <= 3, (v) => v <= 5), progress: mt.value === null ? 0 : mt.value <= 3 ? 1 : 3 / mt.value, foot: 'Meta 3 · antes 8' },
      { icon: 'star', label: 'NPS do tour', value: nps.score === null ? '—' : num(nps.score, 0), unit: '',
        status: st(nps.score, (v) => v >= 90, (v) => v >= 75), progress: nps.score === null ? 0 : (nps.score + 100) / 190,
        foot: `Meta 90 · ${nps.responses} respostas` },
    ];
  });

  protected journey = computed(() => {
    const j = this.d()?.journey ?? [];
    const first = Math.max(1, j[0]?.count ?? 0);
    return j.map((s, i) => ({
      ...s, icon: JOURNEY_ICONS[s.icon] ?? 'circle', pct: (100 * s.count) / first,
      conv: i < j.length - 1 && s.count ? Math.round((100 * j[i + 1].count) / s.count) : null,
    }));
  });

  protected weekly = computed(() => {
    const w = this.d()?.weekly ?? [];
    const max = Math.max(1, ...w.map((x) => x.bookings));
    return { max, half: Math.round(max / 2), items: w.map((x) => ({ ...x, label: `${x.week_start.slice(8, 10)}/${x.week_start.slice(5, 7)}`,
      hb: (100 * x.bookings) / max, hr: (100 * x.realized) / max })) };
  });

  protected messages = computed(() => {
    const m = this.d()?.messages;
    if (!m) return null;
    const audTotal = Math.max(1, m.by_audience.reduce((s, x) => s + x.count, 0));
    const top = m.by_template.slice(0, 6);
    const maxT = Math.max(1, ...top.map((t) => t.count));
    return {
      ...m,
      audience: m.by_audience.map((x, i) => ({ name: AUDIENCE[x.audience] ?? x.audience, count: x.count, pct: (100 * x.count) / audTotal, color: SERIES[i % 3] })),
      top: top.map((t) => ({ ...t, pct: (100 * t.count) / maxT })),
    };
  });

  protected heat = computed(() => {
    const occ = this.d()?.occupancy ?? [];
    const times = [...new Set(occ.map((o) => o.time))].sort();
    const wds = [...new Set(occ.map((o) => o.weekday))].sort();
    const max = Math.max(1, ...occ.map((o) => o.pct ?? 0));
    return {
      wds: wds.map((w) => WEEKDAYS[w]),
      rows: times.map((t) => ({
        time: hhmm(t),
        cells: wds.map((w) => {
          const c = occ.find((o) => o.weekday === w && o.time === t);
          const share = c?.pct == null ? 0 : Math.round((90 * c.pct) / max);
          return { label: c?.pct == null ? '—' : `${Math.round(c.pct)}%`, share, dark: share > 50,
            tip: c ? `${WEEKDAYS[w]} ${hhmm(t)}: ${c.people} de ${c.capacity} lugares` : 'Sem horário' };
        }),
      })),
    };
  });

  protected courses = computed(() => {
    const c = this.d()?.by_course ?? [];
    const max = Math.max(1, c[0]?.total ?? 1);
    return c.map((x) => ({ ...x, pct: (100 * x.total) / max }));
  });

  async ngOnInit() {
    await this.load();
  }

  protected async setPreset(key: string) {
    this.preset.set(key);
    await this.load();
  }

  private async load() {
    this.loading.set(true);
    try {
      const p = this.period();
      const d = await this.api.dashboard(p.from, p.to);
      this.d.set(d);
      this.state.openExceptions.set(d.alerts.open_exceptions);
      this.error.set(null);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  /** Anel de progresso até a meta: comprimento do traço no círculo de raio 26 */
  protected dash(progress: number) {
    const c = 2 * Math.PI * 26;
    return `${(c * Math.max(0, Math.min(1, progress))).toFixed(1)} ${c.toFixed(1)}`;
  }
  protected statusText(s: Status) {
    return { ok: 'Na meta', warn: 'Perto da meta', crit: 'Fora da meta', none: 'Sem dados' }[s];
  }
  protected statusIcon(s: Status) {
    return { ok: 'check_circle', warn: 'error', crit: 'cancel', none: 'remove' }[s];
  }
}
