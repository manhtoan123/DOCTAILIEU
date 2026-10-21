import {useEffect, useRef, type ReactNode} from 'react';

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}

export function Modal({title, children, onClose, wide = false}: ModalProps) {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close.current();

      if (event.key === 'Tab') {
        const nodes = Array.from(document.querySelectorAll<HTMLElement>(
          '.dialog button:not(:disabled),.dialog input,.dialog select,.dialog textarea,.dialog a',
        ));
        const first = nodes[0];
        const last = nodes[nodes.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.querySelector<HTMLElement>('.dialog button')?.focus();

    // Khi đóng hộp thoại, bỏ listener và trả focus về phần tử trước đó.
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previous?.focus();
    };
  }, []);

  return (
    <div className="overlay">
      <section className={`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng">×</button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function Empty({title, children}: {title: string; children: ReactNode}) {
  return (
    <div className="empty">
      <span className="empty-mark">⌑</span>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

