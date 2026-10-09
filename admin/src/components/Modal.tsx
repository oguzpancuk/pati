import { useEffect, useRef } from 'react';

interface Props {
  title: string;
  hint?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}

export default function Modal({ title, hint, onClose, children, footer }: Props) {
  // Close on Esc: the most expected way out of a confirmation dialog.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Close on a click that both began and ended on the backdrop. A drag that
  // starts inside the dialog (panning a map, selecting text) and is released
  // outside it also produces a click on the backdrop, and must not throw the
  // form away (review finding).
  const pressedOnBackdrop = useRef(false);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedOnBackdrop.current) onClose();
        pressedOnBackdrop.current = false;
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {hint && (
          <p className="muted" style={{ margin: 0 }}>
            {hint}
          </p>
        )}
        {children}
        <div className="modal-actions">{footer}</div>
      </div>
    </div>
  );
}
