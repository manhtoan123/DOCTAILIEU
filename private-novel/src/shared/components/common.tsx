import {useEffect, useRef, type ReactNode} from 'react';

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  keyboardEnabled?: boolean;
  dismissOnBackdrop?: boolean;
}

export function Modal({title, children, onClose, wide = false, keyboardEnabled = true, dismissOnBackdrop = false}: ModalProps) {
  const close = useRef(onClose);
  close.current = onClose;
  const keyboard = useRef(keyboardEnabled);
  keyboard.current = keyboardEnabled;
  const backdropPointer = useRef(false);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;

    function handleKeyDown(event: KeyboardEvent) {
      if (!keyboard.current) return;
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
    <div className="overlay"
      onPointerDown={event=>{backdropPointer.current=dismissOnBackdrop&&keyboardEnabled&&event.target===event.currentTarget;}}
      onPointerUp={event=>{backdropPointer.current=backdropPointer.current&&event.target===event.currentTarget;}}
      onPointerCancel={()=>{backdropPointer.current=false;}}
      onClick={event=>{const outside=backdropPointer.current&&event.target===event.currentTarget;backdropPointer.current=false;if(dismissOnBackdrop&&keyboardEnabled&&outside)onClose();}}>
      <section className={`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal={keyboardEnabled?true:undefined} aria-label={title}>
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

