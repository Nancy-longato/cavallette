import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

// Router minimale a "hash" (#/percorso): funziona ovunque, anche su GitHub Pages.
function leggi(): string {
  return window.location.hash.replace(/^#/, '') || '/';
}

export function useRotta(): string {
  const [rotta, setRotta] = useState(leggi());
  useEffect(() => {
    const f = (): void => setRotta(leggi());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return rotta;
}

export function vai(percorso: string): void {
  window.location.hash = percorso;
}

export function Link(props: { to: string; className?: string; children: ReactNode }) {
  return (
    <a href={`#${props.to}`} className={props.className}>
      {props.children}
    </a>
  );
}
