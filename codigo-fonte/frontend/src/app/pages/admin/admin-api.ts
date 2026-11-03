import { Injectable, inject } from '@angular/core';

import { Api, ApiError } from '../../core/api';
import { Slot } from '../../core/models';

// Formatos das respostas de /api/admin/* (app/server.py, app/metrics.py).

export interface Me { id: number; email: string; name: string; role: string }

export interface Dashboard {
  period: { from: string; to: string };
  totals: { bookings: number; realized: number; no_show: number; cancelled_candidate: number; cancelled_admissions: number; presence_pending: number };
  realized_rate: { gross: number | null; adjusted: number | null; target: number; baseline: number };
  first_confirmation_seconds: { avg: number | null; p90: number | null; target: number; baseline: number };
  manual_tasks_per_tour: { value: number | null; target: number; baseline: number };
  nps: { score: number | null; responses: number; target: number };
  occupancy: { weekday: number; weekday_label: string; time: string; people: number; capacity: number; pct: number | null }[];
  by_course: { course: string; total: number; treineiros: number }[];
  journey: { key: string; label: string; icon: string; count: number; msg?: { email: number; whatsapp: number } | null; note: string }[];
  messages: {
    total: number; email: number; whatsapp: number; failed: number;
    by_audience: { audience: string; count: number }[];
    by_template: { code: string; name: string; audience: string; count: number }[];
  };
  weekly: { week_start: string; bookings: number; realized: number }[];
  today: { time_label: string; ambassador: string | null; handled_by_admissions: boolean; people: number; capacity: number; in_exception: boolean }[];
  alerts: { open_exceptions: number; presence_pending: number; invites_expiring: number; failed_notifications: number; failed_crm: number; failed_jobs: number };
}

export interface GroupBooking { id: number; protocol: string; name: string; party_size: number; status: string; course: string }

export interface Group {
  id: number; slot_start: string; date_label: string; time_label: string; status: string; in_exception: boolean;
  handled_by_admissions: boolean; capacity: number; people: number; ambassador: string | null; ambassador_id: number | null;
  pending_invite: { ambassador: string; expires_at: string } | null; bookings: GroupBooking[];
  reason?: string; hours_left?: number;
}

export interface Agenda { from: string; to: string; groups: Group[]; slots: Slot[]; start_times: string[]; weekdays: number[] }

export interface BookingRow {
  id: number; protocol: string; status: string; party_size: number; full_name: string; email: string; course_interest: string;
  is_treineiro: number; slot_start: string; ambassador_name: string | null; date_label: string; time_label: string;
}

export interface BookingDetail extends BookingRow {
  cpf: string | null; phone: string; companions_names: string[]; language: string; mobility_restriction: number;
  mobility_notes: string | null; questions: string | null; handled_by_admissions: number; reschedule_count: number;
  whatsapp_opt_in: number; crm_id: string | null; anonymized: boolean; manage_url: string;
  events: { id: number; type: string; actor: string; is_manual: number; created_at: string }[];
  notifications: { id: number; template_code: string; channel: string; status: string; subject: string; sent_at: string | null }[];
  crm: { operation: string; status: string; attempts: number; last_error: string | null }[];
  nps: { score: number; highlight: string | null } | null;
  group: Group;
}

export interface AvailableAmbassador { id: number; name: string; course: string | null; available: boolean; busy: boolean }

export interface Ambassador {
  id: number; display_name: string; email: string; course: string | null; active: number;
  availability: { weekday: number; start_time: string }[]; availability_stale: boolean;
  stats: { tours: number; invites: number; accepted: number; declined: number; expired: number; nps_avg: number | null; gifts_pending: number };
}

export interface Gift { tour_group_id: number; ambassador_id: number; collected_at: string | null; display_name: string; status: string; date_label: string }

export interface Config {
  weekdays: number[]; start_times: string[]; duration_min: number; group_capacity: number; min_lead_hours: number;
  max_days_ahead: number; reminder_time: string; cancel_cutoff_hours: number; invite_timeout_hours: number;
  exception_cutoff_hours: number; reserve_required: boolean; max_reschedules: number; match_course: boolean;
  metric_cancel_exclusion_hours: number; retention_months: number; meeting_point: string; what_to_bring: string;
  privacy_url: string; virtual_tour_url: string; languages: string[]; hidden_fields: string[]; admissions_email: string;
}

export interface ConfigResponse {
  config: Config;
  blackouts: { id: number; date: string; start_time: string | null; reason: string | null }[];
  courses: { id: number; name: string; active: number }[];
}

export interface Template { code: string; name: string; audience: string; channel: string; subject: string; body: string; active: number }

export interface Jobs {
  jobs: { job: string; started_at: string; status: string; detail: string | null }[];
  crm: { status: string; n: number }[];
  notifications: { status: string; n: number }[];
  now: string; clock_offset_hours: number; dev: boolean; email_adapter: string; crm_adapter: string;
}

/** API do painel de Admissões. Sessão expirada (401) leva para o login. */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private api = inject(Api);

  async req<T>(method: string, url: string, body?: unknown): Promise<T> {
    try {
      return await this.api.request<T>(method, url, body);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) location.href = '/login?next=' + encodeURIComponent(location.pathname);
      throw e;
    }
  }

  me() { return this.req<{ user: Me | null }>('GET', '/api/auth/me'); }
  logout() { return this.req('POST', '/api/auth/logout'); }
  dashboard(from: string, to: string) { return this.req<Dashboard>('GET', `/api/admin/dashboard?from=${from}&to=${to}`); }
  agenda(from: string, to: string) { return this.req<Agenda>('GET', `/api/admin/agenda?from=${from}&to=${to}`); }
  bookings(params: URLSearchParams) { return this.req<{ items: BookingRow[] }>('GET', `/api/admin/bookings?${params}`); }
  booking(id: number) { return this.req<BookingDetail>('GET', `/api/admin/bookings/${id}`); }
  patchBooking(id: number, body: Record<string, unknown>) { return this.req('PATCH', `/api/admin/bookings/${id}`, body); }
  exceptions() { return this.req<{ items: Group[] }>('GET', '/api/admin/exceptions'); }
  availableAmbassadors(groupId: number) { return this.req<{ items: AvailableAmbassador[] }>('GET', `/api/admin/groups/${groupId}/available-ambassadors`); }
  resolveException(groupId: number, body: Record<string, unknown>) { return this.req('POST', `/api/admin/exceptions/${groupId}/resolve`, body); }
  ambassadors() { return this.req<{ items: Ambassador[] }>('GET', '/api/admin/ambassadors'); }
  inviteAmbassador(body: { name: string; email: string; course: string }) { return this.req('POST', '/api/admin/ambassadors', body); }
  patchAmbassador(id: number, body: Record<string, unknown>) { return this.req('PATCH', `/api/admin/ambassadors/${id}`, body); }
  gifts() { return this.req<{ items: Gift[] }>('GET', '/api/admin/gifts'); }
  config() { return this.req<ConfigResponse>('GET', '/api/admin/config'); }
  saveConfig(body: Partial<Config>) { return this.req('PUT', '/api/admin/config', body); }
  addBlackout(body: { date: string; start_time: string; reason: string }) { return this.req('POST', '/api/admin/blackouts', body); }
  removeBlackout(id: number) { return this.req('DELETE', `/api/admin/blackouts/${id}`); }
  addCourse(name: string) { return this.req('POST', '/api/admin/courses', { name }); }
  patchCourse(id: number, body: { active: boolean }) { return this.req('PATCH', `/api/admin/courses/${id}`, body); }
  templates() { return this.req<{ items: Template[] }>('GET', '/api/admin/templates'); }
  saveTemplate(code: string, body: { subject: string; body: string; active: boolean }) { return this.req('PUT', `/api/admin/templates/${code}`, body); }
  resetTemplate(code: string) { return this.req('POST', `/api/admin/templates/${code}/reset`); }
  jobs() { return this.req<Jobs>('GET', '/api/admin/jobs'); }
  runJobs() { return this.req('POST', '/api/admin/jobs/run'); }
  clock(body: { advance_hours?: number; reset?: boolean }) { return this.req<{ now: string }>('POST', '/api/admin/dev/clock', body); }
  anonymize(id: number) { return this.req('POST', `/api/admin/lgpd/${id}/anonymize`); }
  slots(from: string, to: string, party: number, token: string) {
    return this.req<{ slots: Slot[] }>('GET', `/api/public/slots?from=${from}&to=${to}&party=${party}&token=${token}`);
  }
}
