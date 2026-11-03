// Formatos das respostas da API pública (app/server.py e domain.public_view).

export interface PublicConfig {
  courses: string[];
  languages: string[];
  group_capacity: number;
  hidden_fields: string[];
  meeting_point: string;
  what_to_bring: string;
  privacy_url: string;
  virtual_tour_url: string;
  max_days_ahead: number;
  min_lead_hours: number;
  today: string; // AAAA-MM-DD no fuso de São Paulo
  now: string;
  dev: boolean;
}

export interface Slot {
  date: string; // AAAA-MM-DD
  time: string; // HH:MM
  slot_start: string; // ISO em UTC
  remaining: number;
  max_fit: number;
  available: boolean;
  reason?: string;
}

export interface BookingView {
  protocol: string;
  status: string;
  status_label: string;
  first_name: string;
  slot_start: string;
  date_label: string; // "quarta-feira, 4 de novembro de 2026"
  time_label: string; // "10h"
  party_size: number;
  party: number;
  ambassador: string;
  meeting_point: string;
  what_to_bring: string;
  can_cancel: boolean;
  can_reschedule: boolean;
  reschedules_left: number;
  presence_confirmed: boolean;
  cancel_cutoff_hours: number;
  nps_link: string | null;
  ics_url?: string;
  manage_url?: string;
}

export interface NpsInfo {
  first_name: string;
  answered: boolean;
  date_label: string;
  ambassador: string;
  open: boolean;
  status: string;
}

export interface NpsGroup {
  date_label: string;
  people: { first_name: string; token: string; answered: boolean }[];
}

export interface BookingRequest {
  slot_start: string;
  full_name: string;
  cpf: string;
  email: string;
  email_confirm: string;
  phone: string;
  course_interest: string;
  is_treineiro: boolean | null;
  companions: number;
  companions_names: string[];
  mobility_restriction: boolean;
  mobility_notes: string;
  language: string;
  questions: string;
  privacy_accepted: boolean;
  whatsapp_opt_in: boolean;
  website: string; // armadilha anti-robô: humanos deixam vazio
}

export const ACTIVE_STATUSES = ['aguardando_embaixador', 'confirmado', 'excecao'];
