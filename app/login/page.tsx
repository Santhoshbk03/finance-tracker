'use client';
import { useState } from 'react';
import { IndianRupee, Eye, EyeOff, Lock, Mail, Loader2, Sparkles, ArrowRight } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [showPass, setShowPass] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await cred.user.getIdToken();

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Login failed');
      }

      router.push('/');
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      if (msg.includes('invalid-credential') || msg.includes('wrong-password') || msg.includes('user-not-found')) {
        setError('Invalid email or password');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center p-4"
      style={{ background: 'var(--bg)' }}>

      {/* ── Animated background orbs ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute rounded-full blur-[120px] opacity-60 animate-orb-1"
          style={{
            width: 500, height: 500,
            top: '-10%', left: '-15%',
            background: 'radial-gradient(circle, #6d28d9 0%, transparent 70%)',
          }} />
        <div className="absolute rounded-full blur-[140px] opacity-50 animate-orb-2"
          style={{
            width: 600, height: 600,
            bottom: '-20%', right: '-20%',
            background: 'radial-gradient(circle, #ec4899 0%, transparent 70%)',
          }} />
        <div className="absolute rounded-full blur-[100px] opacity-40 animate-orb-3"
          style={{
            width: 400, height: 400,
            top: '40%', right: '20%',
            background: 'radial-gradient(circle, #06b6d4 0%, transparent 70%)',
          }} />
      </div>

      {/* ── Grid overlay ── */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.06]" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
        WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
      }} />

      {/* ── Main content ── */}
      <div className="relative w-full max-w-sm z-10">

        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-[22px] mb-5 relative"
            style={{
              background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
              boxShadow: '0 20px 60px -10px rgba(139,92,246,0.6), 0 0 0 1px rgba(255,255,255,0.1) inset',
            }}>
            <IndianRupee className="w-10 h-10 text-white drop-shadow-lg" />
            <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center animate-pulse"
              style={{ background: '#fbbf24', boxShadow: '0 0 12px rgba(251,191,36,0.8)' }}>
              <Sparkles className="w-3 h-3 text-amber-900" />
            </div>
          </div>
          <h1 className="text-[28px] font-black tracking-tight mb-1"
            style={{
              background: 'linear-gradient(135deg, #fff 0%, #c4b5fd 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
            FinanceTrack
          </h1>
          <p className="text-[13px]" style={{ color: 'var(--muted)' }}>
            Lending business, reimagined
          </p>
        </div>

        {/* Glass card */}
        <div className="relative rounded-[22px] p-7 backdrop-blur-2xl"
          style={{
            background: 'linear-gradient(135deg, rgba(30,30,45,0.65) 0%, rgba(18,18,28,0.55) 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 24px 72px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(139,92,246,0.1) inset',
          }}>
          {/* Top sheen */}
          <div className="absolute inset-x-6 top-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)' }} />

          <div className="mb-5">
            <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Welcome back</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Sign in to manage your loans</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-[11px] font-semibold mb-1.5 uppercase tracking-wider"
                style={{ color: 'var(--muted)' }}>
                Email
              </label>
              <div className="relative group">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors"
                  style={{ color: 'var(--muted-2)' }} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-3.5 rounded-xl text-sm transition-all outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--glass-border)',
                    color: 'var(--text)',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.12)';
                    e.currentTarget.style.background = 'rgba(139,92,246,0.04)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--glass-border)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                  }}
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[11px] font-semibold mb-1.5 uppercase tracking-wider"
                style={{ color: 'var(--muted)' }}>
                Password
              </label>
              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: 'var(--muted-2)' }} />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full pl-10 pr-12 py-3.5 rounded-xl text-sm transition-all outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--glass-border)',
                    color: 'var(--text)',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.12)';
                    e.currentTarget.style.background = 'rgba(139,92,246,0.04)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--glass-border)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                  }}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-colors hover:bg-white/5"
                  style={{ color: 'var(--muted-2)' }}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 px-3.5 py-3 rounded-xl text-xs font-medium"
                style={{
                  background: 'rgba(244,63,94,0.08)',
                  border: '1px solid rgba(244,63,94,0.25)',
                  color: '#fda4af',
                }}>
                <span className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#fb7185' }} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="relative w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 overflow-hidden transition-all disabled:opacity-60 group"
              style={{
                background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
                color: 'white',
                boxShadow: '0 10px 30px -5px rgba(139,92,246,0.5), 0 0 0 1px rgba(255,255,255,0.15) inset',
              }}
            >
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: 'linear-gradient(135deg, #a78bfa 0%, #f472b6 100%)' }} />
              <div className="relative flex items-center gap-2">
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </div>
            </button>
          </form>

          <div className="mt-6 pt-5 text-center" style={{ borderTop: '1px solid var(--glass-border)' }}>
            <p className="text-[11px]" style={{ color: 'var(--muted-2)' }}>
              Secured with Firebase Auth · End-to-end encrypted
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] mt-6" style={{ color: 'var(--muted-2)' }}>
          Built for lenders who move fast
        </p>
      </div>

      <style jsx>{`
        @keyframes orb-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(40px, 30px) scale(1.1); }
        }
        @keyframes orb-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-50px, -40px) scale(1.15); }
        }
        @keyframes orb-3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, -30px) scale(0.95); }
        }
        .animate-orb-1 { animation: orb-1 12s ease-in-out infinite; }
        .animate-orb-2 { animation: orb-2 14s ease-in-out infinite; }
        .animate-orb-3 { animation: orb-3 10s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
