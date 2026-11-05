/**
 * HARPIA Universe - Security & Content Protection Module
 * Encapsula a proteção contra inspeção indevida, download de assets e atalhos de teclado.
 */

export class Security {
  static init() {
    // 1. Desativar menu de contexto (botão direito)
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    // 2. Desativar drag and drop de mídia (exceto se for item de inventário drag & drop)
    document.addEventListener('dragstart', (e) => {
      if (e.target.closest && e.target.closest('[draggable="true"]')) {
        return; // Permite drag & drop de itens de inventário
      }
      if (e.target.tagName === 'IMG' || e.target.tagName === 'VIDEO' || e.target.tagName === 'CANVAS') {
        e.preventDefault();
      }
    });

    // 3. Desativar seleção de texto em elementos de UI não interativos
    document.addEventListener('selectstart', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      e.preventDefault();
    });

    // 4. Bloqueio de atalhos comuns de inspeção de código e DevTools
    document.addEventListener('keydown', (e) => {
      // F12
      if (e.key === 'F12') {
        e.preventDefault();
        return false;
      }
      // Ctrl+S (Salvar página)
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        return false;
      }
      // Ctrl+U (Ver código-fonte)
      if (e.ctrlKey && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        return false;
      }
      // Ctrl+Shift+I / J (DevTools / Console)
      if (e.ctrlKey && e.shiftKey && (e.key.toLowerCase() === 'i' || e.key.toLowerCase() === 'j')) {
        e.preventDefault();
        return false;
      }
    });
  }
}
