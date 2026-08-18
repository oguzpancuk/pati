import { useEffect } from 'react';

interface Props {
  title: string;
  hint?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}

export default function Modal({ title, hint, onClose, children, footer }: Props) {
  // Esc ile kapatma: bir onay penceresinden çıkmanın en beklenen yolu.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {hint && <p className="muted" style={{ margin: 0 }}>{hint}</p>}
        {children}
        <div className="modal-actions">{footer}</div>
      </div>
    </div>
  );
}
