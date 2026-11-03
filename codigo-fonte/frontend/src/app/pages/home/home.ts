import { Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { Api } from '../../core/api';
import { PublicConfig } from '../../core/models';

// Fotos do site do Insper. Se o site bloquear o carregamento, o bloco fica na cor da marca.
const IMG = 'https://www.insper.edu.br/content/dam/insper-portal/imagens/';

@Component({
  selector: 'app-home',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements OnInit {
  private api = inject(Api);
  protected cfg = signal<PublicConfig | null>(null);
  protected heroImg = IMG + 'campus/novo-pr%C3%A9dio/Predio%20Novo%20Fachada%20013bx.jpg';
  protected imgFailed = signal(false);

  protected steps = [
    { icon: 'event_available', title: 'Escolha dia e horário', text: 'Só aparecem horários com vaga para o tamanho do seu grupo.' },
    { icon: 'edit_note', title: 'Preencha seus dados', text: 'Leva uns 2 minutos. Não precisa estar inscrito no vestibular.' },
    { icon: 'mark_email_read', title: 'Receba a confirmação', text: 'Comprovante e convite de calendário na hora, por e-mail.' },
    { icon: 'school', title: 'Visite com um aluno', text: 'Um embaixador mostra o campus e responde suas dúvidas.' },
  ];

  protected profiles = [
    { icon: 'person', title: 'Candidato', text: 'Agendar, ver, reagendar ou cancelar a visita e responder a avaliação.', href: '/agendar', spa: true },
    { icon: 'diversity_3', title: 'Embaixador', text: 'Disponibilidade, convites, lista de presença, QR da avaliação e brinde.', href: '/embaixador' },
    { icon: 'monitoring', title: 'Admissões', text: 'Indicadores, agenda, exceções, embaixadores e configurações.', href: '/admin' },
    { icon: 'web', title: 'Site do Insper', text: 'Botão pronto para colocar o agendamento na página institucional.', href: '/embed' },
    { icon: 'inbox', title: 'Caixa de entrada', text: 'E-mails e WhatsApps simulados que a plataforma enviou.', href: '/caixa-de-entrada' },
    { icon: 'science', title: 'Simulador', text: 'Versão autônoma que roda no navegador, com troca rápida de persona.', href: '/simulador' },
  ];

  async ngOnInit() {
    try {
      this.cfg.set(await this.api.config());
    } catch {
      // A página inicial funciona sem a configuração; só os detalhes práticos ficam de fora.
    }
  }
}
