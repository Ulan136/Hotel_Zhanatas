'use client';
import { useEffect } from 'react';

export function Busy({ show }) {
  if (!show) return null;
  return (
    <div className="busy"><div className="sp" /></div>
  );
}

export function TopBar({ icon = '🏨', title = 'MEDINA', sub = '', right = null }) {
  return (
    <div className="top">
      <div className="logo">{icon}</div>
      <div>
        <h1>{title}</h1>
        <div className="sub">{sub}</div>
      </div>
      <div className="right">{right}</div>
    </div>
  );
}

export function Modal({ open, onClose, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div
      className={'modal-bg' + (open ? ' show' : '')}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="modal">
        <div className="grab" />
        {open ? children : null}
      </div>
    </div>
  );
}
