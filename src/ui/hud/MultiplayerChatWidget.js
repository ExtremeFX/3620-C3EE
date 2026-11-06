/**
 * HARPIA Universe - MultiplayerChatWidget
 * Componente modular de chat multijogador em tempo real (Canais de Setor e Galáxia).
 */
import { UIComponent } from '../core/UIComponent.js';
import { wsClient } from '../../network/websocket.js';
import { api } from '../../network/ApiClient.js';

export class MultiplayerChatWidget extends UIComponent {
  constructor({ bus = null } = {}) {
    super();
    this.bus = bus;
    this.currentChannel = 'system'; // 'system' ou 'universe'
    this.isMinimized = false;

    this.messagesContainer = null;
    this.inputEl = null;
    this.formEl = null;
    this.channelBtns = {};
    this.toggleBtn = null;
  }

  mount(container = document.body) {
    if (this.root) return;

    const wrap = document.createElement('div');
    wrap.className = 'multiplayer-chat-widget';
    wrap.id = 'multiplayer-chat-widget';

    wrap.innerHTML = `
      <div class="chat-header">
        <div class="chat-channels">
          <button type="button" class="chat-channel-btn active" data-channel="system">SETOR</button>
          <button type="button" class="chat-channel-btn" data-channel="universe">UNIVERSO</button>
        </div>
        <button type="button" class="chat-minimize-btn" title="Minimizar / Expandir Chat">─</button>
      </div>

      <div class="chat-messages-container" id="chat-messages-container">
        <div class="chat-message-row" style="opacity: 0.7; font-style: italic;">
          <span class="chat-sender">CANAL [SETOR]</span>
          <span class="chat-text">Frequência quântica sintonizada. Comunicações online.</span>
        </div>
      </div>

      <form class="chat-input-form" id="chat-input-form">
        <input type="text" class="chat-input" placeholder="Mensagem para o setor..." maxlength="180" autocomplete="off" />
        <button type="submit" class="chat-send-btn">ENVIAR</button>
      </form>
    `;

    container.appendChild(wrap);
    this.root = wrap;

    this.messagesContainer = wrap.querySelector('#chat-messages-container');
    this.formEl = wrap.querySelector('#chat-input-form');
    this.inputEl = wrap.querySelector('.chat-input');
    this.toggleBtn = wrap.querySelector('.chat-minimize-btn');

    this.channelBtns = {
      system: wrap.querySelector('[data-channel="system"]'),
      universe: wrap.querySelector('[data-channel="universe"]')
    };

    this.bindEvents();
  }

  bindEvents() {
    // 1. Alternar Canais
    Object.entries(this.channelBtns).forEach(([ch, btn]) => {
      if (!btn) return;
      const onChannelClick = () => this.switchChannel(ch);
      btn.addEventListener('click', onChannelClick);
      this.addCleanup(() => btn.removeEventListener('click', onChannelClick));
    });

    // 2. Minimizar / Expandir
    if (this.toggleBtn) {
      const onToggle = () => this.toggleMinimize();
      this.toggleBtn.addEventListener('click', onToggle);
      this.addCleanup(() => this.toggleBtn.removeEventListener('click', onToggle));
    }

    // 3. Enviar mensagem
    if (this.formEl && this.inputEl) {
      const onSubmit = (e) => {
        e.preventDefault();
        this.sendMessage();
      };
      this.formEl.addEventListener('submit', onSubmit);
      this.addCleanup(() => this.formEl.removeEventListener('submit', onSubmit));

      // Impedir que as teclas digitadas no chat (como WASD ou M de mapa) acionem controlos do jogo
      const stopKeys = (e) => e.stopPropagation();
      this.inputEl.addEventListener('keydown', stopKeys);
      this.inputEl.addEventListener('keyup', stopKeys);
      this.inputEl.addEventListener('keypress', stopKeys);
      this.addCleanup(() => {
        this.inputEl.removeEventListener('keydown', stopKeys);
        this.inputEl.removeEventListener('keyup', stopKeys);
        this.inputEl.removeEventListener('keypress', stopKeys);
      });
    }

    // 4. Receber mensagens de outros pilotos via WebSocket
    const unbindWs = wsClient.on('CHAT_MESSAGE', (payload) => {
      this.addMessage(payload);
    });
    this.addCleanup(unbindWs);
  }

  switchChannel(channel) {
    this.currentChannel = channel;
    Object.entries(this.channelBtns).forEach(([ch, btn]) => {
      btn.classList.toggle('active', ch === channel);
    });
    if (this.inputEl) {
      this.inputEl.placeholder = channel === 'universe' ? 'Mensagem para a galáxia...' : 'Mensagem para o setor...';
    }
  }

  toggleMinimize() {
    this.isMinimized = !this.isMinimized;
    if (this.root) {
      this.root.classList.toggle('minimized', this.isMinimized);
      if (this.toggleBtn) {
        this.toggleBtn.textContent = this.isMinimized ? '▲' : '─';
      }
    }
  }

  sendMessage() {
    if (!this.inputEl) return;
    const text = this.inputEl.value.trim();
    if (!text) return;

    if (!wsClient.isConnected) {
      this.addMessage({
        senderName: 'SISTEMA',
        text: 'Desconectado do servidor espacial.',
        timestamp: Date.now()
      });
      return;
    }

    wsClient.send('CHAT_MESSAGE', {
      channel: this.currentChannel,
      text: text
    });

    this.inputEl.value = '';
    this.inputEl.focus();
  }

  addMessage(msg) {
    if (!this.messagesContainer || !msg) return;

    const row = document.createElement('div');
    row.className = 'chat-message-row';

    const timeStr = msg.timestamp
      ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';

    const channelTag = msg.channel === 'universe' ? '[GALÁXIA] ' : '';
    const sender = (msg.senderName || 'Piloto').toUpperCase();

    row.innerHTML = `
      <span class="chat-time">${timeStr}</span>
      <span class="chat-sender">${channelTag}${sender}:</span>
      <span class="chat-text"></span>
    `;

    // Inserção segura de texto contra XSS
    const textSpan = row.querySelector('.chat-text');
    if (textSpan) {
      textSpan.textContent = msg.text || '';
    }

    this.messagesContainer.appendChild(row);

    // Auto-scroll para a mensagem mais recente
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

    // Se estiver minimizado e receber mensagem nova, mostrar pulso luminoso no botão
    if (this.isMinimized && this.toggleBtn) {
      this.toggleBtn.style.color = '#ffaa00';
      setTimeout(() => {
        if (this.toggleBtn) this.toggleBtn.style.color = '';
      }, 1500);
    }
  }

  show() {
    if (this.root) this.root.style.display = 'flex';
  }

  hide() {
    if (this.root) this.root.style.display = 'none';
  }
}
