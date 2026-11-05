/**
 * HARPIA Universe - UIComponent Base Class
 * Contrato base para todos os componentes de interface do jogo (Padrão AAA)
 * Fornece ciclo de vida padronizado e gestão de cleanups/unsubscribes.
 */
export class UIComponent {
  constructor() {
    /** @type {HTMLElement|null} */
    this.root = null;
    /** @type {Array<() => void>} */
    this._cleanups = [];
  }

  /**
   * Constrói e anexa a estrutura DOM uma única vez
   * @param {HTMLElement} container
   */
  mount(container) {
    // Implementado nas subclasses
  }

  /**
   * Atualiza nós de dados existentes sem reconstruir o DOM
   * @param {Object} data
   */
  render(data) {
    // Implementado nas subclasses
  }

  /**
   * Registra listeners locais de DOM ou callbacks
   */
  bindEvents() {
    // Implementado nas subclasses
  }

  /**
   * Adiciona uma função de limpeza (listener DOM, unsubscribe do EventBus, etc.)
   * @param {() => void} cleanupFn
   */
  addCleanup(cleanupFn) {
    if (typeof cleanupFn === 'function') {
      this._cleanups.push(cleanupFn);
    }
  }

  /**
   * Executa todas as limpezas registradas e remove o nó do DOM
   */
  destroy() {
    for (const cleanup of this._cleanups) {
      try {
        cleanup();
      } catch (err) {
        console.error('[UIComponent] Erro durante cleanup:', err);
      }
    }
    this._cleanups = [];

    if (this.root && this.root.parentElement) {
      this.root.parentElement.removeChild(this.root);
    }
    this.root = null;
  }
}
