'use client';
import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function Header({ title }: { title: string }) {
  const [overdueCount, setOverdueCount] = useState(0);

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => setOverdueCount(d.overduePayments?.length || 0))
      .catch(() => {});
  }, []);

  return (
    <header className="sticky top-0 z-20 px-4 py-3.5 flex items-center justify-between"
      style={{
        background: 'rgba(10,10,15,0.85)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--glass-border)',
      }}>
      <h1 className="text-base font-bold" style={{ color: 'var(--text)' }}>{title}</h1>
      <Link href="/" className="relative p-2 rounded-xl transition-all hover:bg-white/5">
        <Bell className="w-5 h-5" style={{ color: 'var(--muted)' }} />
        {overdueCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
            style={{ background: 'var(--red)', boxShadow: '0 0 8px var(--glow-red)' }}>
            {overdueCount > 9 ? '9+' : overdueCount}
          </span>
        )}
      </Link>
    </header>
  );
}
