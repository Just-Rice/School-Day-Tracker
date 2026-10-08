// Small shared UI primitives. Styling lives in styles.css; see the class names there.
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export function Page({ title, subtitle, actions, children, wide }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode; wide?: boolean }) {
  return (
    <div className={'page' + (wide ? ' page-wide' : '')}>
      <header className="page-head">
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

export function Card({ title, actions, children, className, style }: { title?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <section className={'card' + (className ? ' ' + className : '')} style={style}>
      {(title || actions) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; small?: boolean };
export function Button({ variant = 'secondary', small, className, ...rest }: BtnProps) {
  return <button type="button" className={`btn btn-${variant}${small ? ' btn-sm' : ''}${className ? ' ' + className : ''}`} {...rest} />;
}

export function Field({ label, hint, children, wide }: { label: ReactNode; hint?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <label className={'field' + (wide ? ' field-wide' : '')}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon" aria-hidden>{icon}</div>}
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function Chip({ children, color, onClick, active, title }: { children: ReactNode; color?: string; onClick?: () => void; active?: boolean; title?: string }) {
  const style = color ? ({ '--chip': color } as React.CSSProperties) : undefined;
  if (onClick)
    return (
      <button type="button" className={'chip' + (active ? ' chip-active' : '')} style={style} onClick={onClick} aria-pressed={active} title={title}>
        {children}
      </button>
    );
  return (
    <span className="chip" style={style} title={title}>
      {children}
    </span>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <span className="spinner-dot" aria-hidden />
      {label}
    </div>
  );
}

/** Accessible modal dialog using <dialog>. Closes on Escape and backdrop click. */
export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close?.();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="modal"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-body">
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </dialog>
  );
}

/** Class color dot */
export function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return <span className="dot" style={{ background: color, width: size, height: size }} aria-hidden />;
}
