import { Component, ElementRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';

import { Api, ApiError } from '../../core/api';
import { addDays, cpfValid, dateLong, fromDate, hhmm, maskCPF, maskPhone, phoneValid, shortDate, toDate } from '../../core/format';
import { BookingRequest, BookingView, PublicConfig, Slot } from '../../core/models';
import { Ticket } from '../../shared/ticket';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

/** Mensagens de erro de cada validação, na ordem em que aparecem. */
const MESSAGES: Record<string, Record<string, string>> = {
  full_name: { required: 'Informe seu nome completo.', fullName: 'Informe nome e sobrenome.' },
  cpf: { required: 'Informe o CPF.', cpf: 'CPF inválido. Confira os números.' },
  phone: { required: 'Informe o celular.', phone: 'Informe o celular com DDD.' },
  email: { required: 'Informe o e-mail.', email: 'E-mail inválido.' },
  email_confirm: { required: 'Repita o e-mail.', mismatch: 'Os e-mails não conferem.' },
  course_interest: { required: 'Escolha o curso de interesse.' },
  is_treineiro: { required: 'Informe se você é treineiro.' },
  questions: { maxlength: 'Use até 500 caracteres.' },
  privacy_accepted: { required: 'É preciso aceitar o aviso de privacidade.' },
};

@Component({
  selector: 'app-booking',
  imports: [
    ReactiveFormsModule, RouterLink, MatButtonModule, MatCheckboxModule, MatDatepickerModule, MatFormFieldModule,
    MatIconModule, MatInputModule, MatProgressBarModule, MatRadioModule, MatSelectModule, Ticket,
  ],
  templateUrl: './booking.html',
  styleUrl: './booking.scss',
})
export class Booking implements OnInit {
  private api = inject(Api);
  private snack = inject(MatSnackBar);
  private host = inject(ElementRef<HTMLElement>);
  private fb = inject(FormBuilder).nonNullable;

  /** ?reagendar=<token>: reaproveita o calendário para trocar o horário de uma visita existente. */
  reagendar = input<string>();

  protected readonly hhmm = hhmm;
  protected readonly dateLong = dateLong;
  protected readonly shortDate = shortDate;

  protected cfg = signal<PublicConfig | null>(null);
  protected current = signal<BookingView | null>(null); // visita sendo reagendada
  protected loadError = signal<string | null>(null);
  protected blocked = signal<string | null>(null); // reagendamento não permitido
  protected loadingSlots = signal(false);
  protected step = signal<1 | 2 | 3>(1);
  protected party = signal(1);
  protected slots = signal<Slot[]>([]);
  protected day = signal<string | null>(null);
  protected selected = signal<Slot | null>(null);
  protected submitting = signal(false);
  protected formError = signal<string | null>(null);
  protected result = signal<BookingView | null>(null);

  protected isReschedule = computed(() => !!this.reagendar());
  protected stepLabels = computed(() => this.isReschedule() ? ['Novo horário', 'Confirmação'] : ['Data e horário', 'Seus dados', 'Confirmação']);
  protected stepIndex = computed(() => this.isReschedule() && this.step() === 3 ? 2 : this.step());
  protected partyLabel = computed(() => this.party() === 1 ? 'Só eu' : `${this.party()} pessoas`);

  protected openDays = computed(() => new Set(this.slots().filter((s) => s.available).map((s) => s.date)));
  protected daySlots = computed(() => this.slots().filter((s) => s.date === this.day()));
  protected minDate = computed(() => this.cfg() ? toDate(this.cfg()!.today) : null);
  protected maxDate = computed(() => this.cfg() ? toDate(addDays(this.cfg()!.today, this.cfg()!.max_days_ahead)) : null);
  protected dayDate = computed(() => this.day() ? toDate(this.day()!) : null);
  /** Nova função a cada mudança de vagas: assim o calendário redesenha os dias disponíveis. */
  protected dateFilter = computed(() => {
    const open = this.openDays();
    return (d: Date | null) => !!d && open.has(fromDate(d));
  });

  protected form = this.fb.group({
    full_name: ['', [Validators.required, (c: AbstractControl) => c.value.trim().split(/\s+/).length < 2 ? { fullName: true } : null]],
    cpf: ['', [Validators.required, (c: AbstractControl) => c.value && !cpfValid(c.value) ? { cpf: true } : null]],
    phone: ['', [Validators.required, (c: AbstractControl) => c.value && !phoneValid(c.value) ? { phone: true } : null]],
    email: ['', [Validators.required, (c: AbstractControl) => c.value && !EMAIL_RE.test(c.value.trim()) ? { email: true } : null]],
    email_confirm: ['', Validators.required],
    course_interest: ['', Validators.required],
    is_treineiro: this.fb.control<boolean | null>(null, Validators.required),
    companions_names: this.fb.array<string>([]),
    mobility_restriction: [false],
    mobility_notes: [''],
    language: ['Português'],
    questions: ['', Validators.maxLength(500)],
    whatsapp_opt_in: [false],
    privacy_accepted: [false, Validators.requiredTrue],
    website: [''],
  }, {
    validators: (g: AbstractControl): ValidationErrors | null => {
      const confirm = g.get('email_confirm')!;
      const mismatch = confirm.value && g.get('email')!.value.trim().toLowerCase() !== confirm.value.trim().toLowerCase();
      const errs = { ...(confirm.errors || {}) };
      if (mismatch) errs['mismatch'] = true; else delete errs['mismatch'];
      confirm.setErrors(Object.keys(errs).length ? errs : null, { emitEvent: false });
      return null;
    },
  });

  protected get companions() {
    return this.form.controls.companions_names as FormArray;
  }

  async ngOnInit() {
    try {
      const cfg = await this.api.config();
      this.cfg.set(cfg);
      // Campos que Admissões escolheu ocultar ficam desabilitados (e sem validação)
      for (const name of cfg.hidden_fields || []) this.form.get(name)?.disable();
      const token = this.reagendar();
      if (token) {
        const b = await this.api.booking(token);
        this.current.set(b);
        if (!b.can_reschedule) {
          this.blocked.set(b.reschedules_left === 0
            ? 'Você já usou todos os reagendamentos pelo link. Fale com Admissões.'
            : `O reagendamento pelo link fecha ${b.cancel_cutoff_hours}h antes do tour, ou a visita não está mais ativa.`);
          return;
        }
        this.party.set(b.party);
      }
      await this.loadSlots();
    } catch (e) {
      this.loadError.set((e as Error).message);
    }
  }

  protected hidden(name: string) {
    return (this.cfg()?.hidden_fields || []).includes(name);
  }

  private async loadSlots() {
    const cfg = this.cfg()!;
    this.loadingSlots.set(true);
    try {
      const data = await this.api.slots(cfg.today, addDays(cfg.today, cfg.max_days_ahead), this.party(), this.reagendar());
      this.slots.set(data.slots);
      const sel = this.selected();
      if (sel && !data.slots.find((s) => s.slot_start === sel.slot_start && s.available)) this.selected.set(null);
      if (!this.day() || !this.openDays().has(this.day()!)) this.day.set(data.slots.find((s) => s.available)?.date ?? null);
    } finally {
      this.loadingSlots.set(false);
    }
  }

  protected async setParty(n: number) {
    this.party.set(n);
    await this.loadSlots();
  }

  protected pickDay(d: Date | null) {
    if (!d) return;
    this.day.set(fromDate(d));
    this.selected.set(null);
  }

  protected slotLabel(s: Slot) {
    if (s.reason) return 'bloqueado';
    if (s.remaining <= 0) return 'esgotado';
    if (!s.available) return `sem espaço p/ ${this.party()}`;
    return `${s.remaining} ${s.remaining === 1 ? 'vaga' : 'vagas'}`;
  }

  protected next() {
    if (!this.selected()) return;
    if (this.isReschedule()) {
      this.doReschedule();
      return;
    }
    // Um campo por acompanhante (o candidato já conta como 1)
    const n = this.party() - 1;
    while (this.companions.length < n) this.companions.push(this.fb.control(''));
    while (this.companions.length > n) this.companions.removeAt(this.companions.length - 1);
    this.formError.set(null);
    this.step.set(2);
    window.scrollTo({ top: 0 });
  }

  protected back() {
    this.step.set(1);
    this.formError.set(null);
  }

  protected mask(name: 'cpf' | 'phone') {
    const c = this.form.controls[name];
    c.setValue((name === 'cpf' ? maskCPF : maskPhone)(c.value), { emitEvent: false });
  }

  protected error(name: string): string | null {
    const c = this.form.get(name);
    if (!c || !c.errors || !(c.touched || c.dirty)) return null;
    if (c.errors['server']) return c.errors['server'];
    const msgs = MESSAGES[name] || {};
    const key = Object.keys(c.errors).find((k) => msgs[k]) ?? (c.errors['required'] !== undefined ? 'required' : '');
    return msgs[key] || msgs['required'] || 'Verifique este campo.';
  }

  protected async submit() {
    this.form.updateValueAndValidity();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focusFirstInvalid();
      return;
    }
    this.submitting.set(true);
    this.formError.set(null);
    const f = this.form.getRawValue();
    const body: BookingRequest = {
      slot_start: this.selected()!.slot_start, full_name: f.full_name, cpf: f.cpf, email: f.email, email_confirm: f.email_confirm,
      phone: f.phone, course_interest: f.course_interest, is_treineiro: f.is_treineiro, companions: this.party() - 1,
      companions_names: f.companions_names, mobility_restriction: !!f.mobility_restriction, mobility_notes: f.mobility_notes,
      language: f.language || 'Português', questions: f.questions, privacy_accepted: f.privacy_accepted,
      whatsapp_opt_in: !!f.whatsapp_opt_in, website: f.website,
    };
    try {
      this.result.set(await this.api.createBooking(body));
      this.step.set(3);
      window.scrollTo({ top: 0 });
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'esgotado' || err.code === 'horario_invalido') {
        // Alguém pegou a última vaga: volta ao calendário com as vagas atualizadas
        await this.loadSlots();
        this.step.set(1);
        this.toast(err.message, true);
        return;
      }
      for (const [name, msg] of Object.entries(err.fields || {})) {
        const c = this.form.get(name);
        if (c) { c.setErrors({ server: msg }); c.markAsTouched(); }
      }
      this.formError.set(err.message);
      this.focusFirstInvalid();
    } finally {
      this.submitting.set(false);
    }
  }

  private async doReschedule() {
    this.submitting.set(true);
    try {
      this.result.set(await this.api.reschedule(this.reagendar()!, this.selected()!.slot_start));
      this.step.set(3);
      window.scrollTo({ top: 0 });
    } catch (e) {
      this.toast((e as Error).message, true);
      await this.loadSlots();
    } finally {
      this.submitting.set(false);
    }
  }

  protected manageUrl() {
    return this.result()?.manage_url || `/minha-visita/${this.reagendar()}`;
  }

  protected icsUrl() {
    return this.result()?.ics_url || `/api/public/bookings/${this.reagendar()}/ics`;
  }

  private focusFirstInvalid() {
    setTimeout(() => {
      const el = (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>(
        'input.ng-invalid, mat-select.ng-invalid, textarea.ng-invalid, mat-radio-group.ng-invalid input, mat-checkbox.ng-invalid input, .form-error');
      el?.focus();
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }

  private toast(msg: string, error = false) {
    this.snack.open(msg, 'OK', { duration: 5000, panelClass: error ? 'snack-error' : undefined });
  }
}
