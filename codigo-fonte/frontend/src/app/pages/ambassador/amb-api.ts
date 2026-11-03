import { Injectable, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

import { Api, ApiError } from '../../core/api';

// Formatos das respostas de /api/ambassador/* (app/server.py).

export interface Person {
  booking_id: number; first_name: string; course_interest: string; is_treineiro: boolean; companions: number; party_size: number;
  language: string; mobility_restriction: boolean; mobility_notes: string; questions: string; status: string; attended: boolean | null;
}

export interface Tour {
  group_id: number; slot_start: string; date_label: string; time_label: string; status: string; people_count: number; people: Person[];
  gift_collected: boolean; has_gift: boolean; is_today: boolean; is_past: boolean; can_mark: boolean;
}

export interface Invitation extends Tour { invitation_id: number; expires_at: string }

export interface AmbMe {
  ambassador: { id: number; display_name: string; course: string | null; languages: string[]; phone: string | null };
  availability_stale: boolean; grid: { weekdays: number[]; start_times: string[] }; courses: string[]; languages: string[]; email: string;
}

export interface AmbStats {
  tours_total: number; tours_month: number; people_total: number; accept_rate: number | null; fast_accepts: number;
  rating_avg: number | null; five_stars: number; foreign_tours: number; pending_presence: number;
  game: {
    points: number; streak: number; this_week: boolean;
    parts: { tours: number; hot: number; fast: number; five: number };
    rules: { tour: number; hot: number; fast: number; five: number };
    challenges: { id: string; title: string; progress: number; goal: number; reward: number }[];
  };
}

export interface Opportunities {
  claimable: { group_id: number; slot_start: string; people: number; courses: string[]; hot: boolean }[];
  hot: { date: string; time: string; slot_start: string; booked: number }[];
}

export interface Availability {
  rules: { weekday: number; start_time: string }[];
  exceptions: { date: string; start_time: string | null; available: boolean }[];
  updated_at: string | null;
}

/** API e estado do portal do embaixador. Sessão expirada (401) leva para o login. */
@Injectable({ providedIn: 'root' })
export class AmbApi {
  private api = inject(Api);
  private snack = inject(MatSnackBar);

  readonly me = signal<AmbMe | null>(null);
  readonly pendingInvites = signal(0);

  async req<T>(method: string, url: string, body?: unknown): Promise<T> {
    try {
      return await this.api.request<T>(method, url, body);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) location.href = '/login?next=' + encodeURIComponent(location.pathname);
      throw e;
    }
  }

  async loadMe() {
    this.me.set(await this.req<AmbMe>('GET', '/api/ambassador/me'));
  }
  stats() { return this.req<AmbStats>('GET', '/api/ambassador/stats'); }
  async invitations() {
    const r = await this.req<{ invitations: Invitation[]; recent: { status: string; responded_at: string; slot_start: string }[]; now: string }>('GET', '/api/ambassador/invitations');
    this.pendingInvites.set(r.invitations.length);
    return r;
  }
  tours() { return this.req<{ upcoming: Tour[]; past: Tour[]; pending_attendance: Tour[] }>('GET', '/api/ambassador/tours'); }
  opportunities() { return this.req<Opportunities>('GET', '/api/ambassador/opportunities'); }
  availability() { return this.req<Availability>('GET', '/api/ambassador/availability'); }
  saveAvailability(body: { rules: { weekday: number; start_time: string }[]; exceptions: Availability['exceptions'] }) {
    return this.req('PUT', '/api/ambassador/availability', body);
  }
  addAvailability(date: string, start_time: string) { return this.req('POST', '/api/ambassador/availability/add', { date, start_time }); }
  saveProfile(body: { course: string; languages: string[]; phone: string }) {
    return this.req('PUT', '/api/ambassador/profile', { ...body, notify_prefs: { email: true } });
  }
  accept(id: number) { return this.req('POST', `/api/ambassador/invitations/${id}/accept`); }
  decline(id: number, reason: string) { return this.req('POST', `/api/ambassador/invitations/${id}/decline`, { reason }); }
  claim(groupId: number) { return this.req('POST', `/api/ambassador/opportunities/${groupId}/claim`); }
  attendance(groupId: number, marks: { booking_id: number; attended: boolean }[]) {
    return this.req('POST', `/api/ambassador/tours/${groupId}/attendance`, { marks });
  }
  gift(groupId: number, collected: boolean) { return this.req('POST', `/api/ambassador/tours/${groupId}/gift-collected`, { collected }); }
  withdraw(groupId: number) { return this.req('POST', `/api/ambassador/tours/${groupId}/withdraw`, { reason: 'desistência pelo portal' }); }
  npsQr(groupId: number) { return this.req<{ url: string }>('GET', `/api/ambassador/tours/${groupId}/nps-qr`); }
  logout() { return this.req('POST', '/api/auth/logout'); }

  toast(msg: string, error = false) {
    this.snack.open(msg, 'OK', { duration: error ? 6000 : 3500, panelClass: error ? 'snack-error' : undefined });
  }

  /** Executa uma ação, mostra o resultado e devolve true se deu certo. */
  async run(action: Promise<unknown>, ok: string): Promise<boolean> {
    try {
      await action;
      this.toast(ok);
      return true;
    } catch (e) {
      this.toast((e as Error).message, true);
      return false;
    }
  }
}
