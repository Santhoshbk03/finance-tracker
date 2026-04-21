'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Users, FileText, PlusCircle, LogOut, IndianRupee, Menu, X } from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { href: '/',           label: 'Dashboard', icon: LayoutDashboard },
  { href: '/customers',  label: 'Customers',  icon: Users },
  { href: '/loans',      label: 'All Loans',  icon: FileText },
  { href: '/loans/new',  label: 'New Loan',   icon: PlusCircle },
];

function Nav({ onNav }: { onNav?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center">
            <IndianRupee className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-[15px] leading-tight">FinanceTrack</p>
            <p className="text-white/50 text-xs">Loan Manager</p>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link key={href} href={href} onClick={onNav}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                active
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}>
              <Icon className="w-[18px] h-[18px] flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-5 border-t border-white/10 pt-4 space-y-1">
        <div className="px-4 py-2">
          <p className="text-white/40 text-xs">Signed in as</p>
          <p className="text-white/90 text-sm font-semibold">Admin</p>
        </div>
        <button onClick={handleLogout}
          className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm text-white/60 hover:bg-red-500/20 hover:text-red-300 transition-all">
          <LogOut className="w-[18px] h-[18px]" /> Logout
        </button>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop */}
      <aside className="hidden md:flex w-60 flex-col fixed inset-y-0 left-0 z-30"
        style={{ background: 'linear-gradient(160deg, #064e3b 0%, #065f46 60%, #047857 100%)' }}>
        <Nav />
      </aside>

      {/* Mobile toggle */}
      <button onClick={() => setOpen(true)}
        className="md:hidden fixed top-4 left-4 z-40 w-9 h-9 rounded-xl flex items-center justify-center shadow-lg"
        style={{ background: 'var(--green)' }}>
        <Menu className="w-4 h-4 text-white" />
      </button>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-60 flex flex-col relative"
            style={{ background: 'linear-gradient(160deg, #064e3b 0%, #065f46 60%, #047857 100%)' }}>
            <button onClick={() => setOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white">
              <X className="w-4 h-4" />
            </button>
            <Nav onNav={() => setOpen(false)} />
          </div>
          <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}
