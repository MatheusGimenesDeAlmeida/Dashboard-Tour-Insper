import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { BookingRequest, BookingView, NpsGroup, NpsInfo, PublicConfig, Slot } from './models';

/** Erro devolvido pela API: mensagem pronta para mostrar, código e erros por campo. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly fields: Record<string, string> = {}) {
    super(message);
  }
}

/** Acesso à API REST do servidor Python. Todas as chamadas devolvem Promise para simplificar as telas. */
@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);

  async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    try {
      return await firstValueFrom(this.http.request<T>(method, url, { body, withCredentials: true }));
    } catch (e) {
      if (e instanceof HttpErrorResponse) {
        const data = (e.error && typeof e.error === 'object') ? e.error : {};
        throw new ApiError(data.error || 'Algo deu errado. Tente novamente.', e.status, data.code, data.fields || {});
      }
      throw e;
    }
  }

  config() {
    return this.request<PublicConfig>('GET', '/api/public/config');
  }

  slots(from: string, to: string, party: number, rescheduleToken?: string | null) {
    const q = new URLSearchParams({ from, to, party: String(party) });
    if (rescheduleToken) q.set('token', rescheduleToken);
    return this.request<{ party: number; slots: Slot[] }>('GET', `/api/public/slots?${q}`);
  }

  createBooking(body: BookingRequest) {
    return this.request<BookingView>('POST', '/api/public/bookings', body);
  }

  booking(token: string) {
    return this.request<BookingView>('GET', `/api/public/bookings/${token}`);
  }

  reschedule(token: string, slotStart: string) {
    return this.request<BookingView>('POST', `/api/public/bookings/${token}/reschedule`, { slot_start: slotStart });
  }

  cancel(token: string, reason: string) {
    return this.request<BookingView>('POST', `/api/public/bookings/${token}/cancel`, { reason });
  }

  confirmAttendance(token: string) {
    return this.request<BookingView>('POST', `/api/public/bookings/${token}/confirm-attendance`, {});
  }

  nps(token: string) {
    return this.request<NpsInfo>('GET', `/api/public/nps/${token}`);
  }

  submitNps(token: string, body: { score: number; highlight: string; improvement: string; ambassador_rating: number | null }) {
    return this.request<{ ok: boolean }>('POST', `/api/public/nps/${token}`, body);
  }

  npsGroup(token: string) {
    return this.request<NpsGroup>('GET', `/api/public/nps-group/${token}`);
  }
}
