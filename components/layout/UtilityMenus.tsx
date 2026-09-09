'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { UTILITY_LINKS } from './navigation';

const GROUPS = [{ label: '도움말', links: UTILITY_LINKS.slice(0, 2) }, { label: '관리', links: UTILITY_LINKS.slice(2) }];

export default function UtilityMenus() {
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(null); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      root.current?.querySelector<HTMLButtonElement>('button[aria-expanded="true"]')?.focus();
      setOpen(null);
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', closeOutside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div ref={root} className="flex gap-2">{GROUPS.map(group => <div key={group.label} className="relative">
    <button type="button" aria-expanded={open === group.label} aria-controls={`utility-${group.label}`} onClick={() => setOpen(open === group.label ? null : group.label)} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">{group.label} ▾</button>
    {open === group.label && <div id={`utility-${group.label}`} className="absolute right-0 top-full z-50 mt-2 min-w-36 rounded-lg border border-slate-700 bg-slate-950 p-1 shadow-xl">{group.links.map(link => <Link key={link.href} href={link.href} onClick={() => setOpen(null)} className="block rounded px-3 py-2 text-xs text-slate-200 hover:bg-slate-800">{link.label}</Link>)}</div>}
  </div>)}</div>;
}
