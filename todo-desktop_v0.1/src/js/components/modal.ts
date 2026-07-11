let modalOverlay: HTMLElement | null = null;
let currentOnConfirm: (() => void) | null = null;
let currentOnCancel: (() => void) | null = null;

function getOrCreateOverlay(): HTMLElement {
  if (modalOverlay) return modalOverlay;

  modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-overlay';
  modalOverlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <h3 class="modal-title"></h3>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal__body"></div>
      <div class="modal__footer">
        <button class="modal-btn modal-btn-cancel">取消</button>
        <button class="modal-btn modal-btn-confirm">确定</button>
      </div>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  modalOverlay.querySelector('.modal-close')!.addEventListener('click', () => {
    modal.close();
  });

  modalOverlay.querySelector('.modal-btn-cancel')!.addEventListener('click', () => {
    if (currentOnCancel) currentOnCancel();
    modal.close();
  });

  modalOverlay.querySelector('.modal-btn-confirm')!.addEventListener('click', () => {
    if (currentOnConfirm) currentOnConfirm();
    modal.close();
  });

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      if (currentOnCancel) currentOnCancel();
      modal.close();
    }
  });

  return modalOverlay;
}

export const modal = {
  open(options: { title: string; content: string | HTMLElement; onConfirm?: () => void; onCancel?: () => void }): void {
    const overlay = getOrCreateOverlay();

    currentOnConfirm = options.onConfirm ?? null;
    currentOnCancel = options.onCancel ?? null;

    overlay.querySelector('.modal-title')!.textContent = options.title;

    const body = overlay.querySelector('.modal__body')!;
    if (typeof options.content === 'string') {
      body.innerHTML = options.content;
    } else {
      body.innerHTML = '';
      body.appendChild(options.content);
    }

    overlay.classList.add('modal-open');
  },

  close(): void {
    if (!modalOverlay) return;
    modalOverlay.classList.remove('modal-open');
    currentOnConfirm = null;
    currentOnCancel = null;
  },

  confirm(options: { title: string; message: string }): Promise<boolean> {
    return new Promise((resolve) => {
      modal.open({
        title: options.title,
        content: `<p>${options.message}</p>`,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  },
};
