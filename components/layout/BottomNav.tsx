'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Users, Plus, CreditCard, FileText } from 'lucide-react';

const NAV = [
  { href: '/', icon: Home, label: 'Home' },
  { href: '/customers', icon: Users, label: 'Borrowers' },
  { href: '/loans/new', icon: Plus, label: 'New', fab: true },
  { href: '/loans', icon: CreditCard, label: 'Loans' },
  { href: '/reports', icon: FileText, label: 'Reports' },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 safe-area-inset-bottom"
      style={{
        background: 'rgba(10,10,15,0.9)',
        backdropFilter: 'blur(24px)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
      }}>
      <div className="flex items-end justify-around px-4 pb-3 pt-2 max-w-lg mx-auto">
        {NAV.map(({ href, icon: Icon, label, fab }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href));

          if (fab) {
            return (
              <Link key={href} href={href}
                className="relative -top-4 w-14 h-14 rounded-2xl flex items-center justify-center transition-all active:scale-95 pulse-glow"
                style={{
                  background: 'linear-gradient(135deg, var(--purple) 0%, var(--violet) 100%)',
                  boxShadow: '0 4px 20px rgba(109,40,217,0.5)',
                  border: '1px solid rgba(139,92,246,0.5)',
                }}>
                <Icon className="w-6 h-6 text-white" strokeWidth={2.5} />
              </Link>
            );
          }

          return (
            <Link key={href} href={href}
              className="flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl transition-all min-w-[56px]"
              style={{ color: active ? 'var(--purple)' : 'rgba(255,255,255,0.35)' }}>
              <div className="relative">
                <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
                {active && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                    style={{ background: 'var(--purple)', boxShadow: '0 0 6px var(--purple)' }} />
                )}
              </div>
              <span className="text-[10px]" style={{ fontWeight: active ? 700 : 500 }}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
