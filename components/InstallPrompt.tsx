'use client';
import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (localStorage.getItem('pwa-install-dismissed')) return;

    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
    setIsIOS(ios);

    if (ios) {
      // Show iOS install instructions after 10s
      const timer = setTimeout(() => setShowBanner(true), 10000);
      return () => clearTimeout(timer);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowBanner(false);
      setDeferredPrompt(null);
    }
  }

  function dismiss() {
    setShowBanner(false);
    setDismissed(true);
    localStorage.setItem('pwa-install-dismissed', '1');
  }

  if (!showBanner || dismissed) return null;

  if (isIOS) {
    return (
      <div className="fixed bottom-24 left-4 right-4 z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 p-4">
        <button onClick={dismiss} className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Download className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">Install FinanceTrack</p>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Tap the <strong>Share</strong> button at the bottom of Safari, then tap <strong>Add to Home Screen</strong> to install the app.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-24 left-4 right-4 z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 p-4">
      <button onClick={dismiss} className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600">
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <Download className="w-5 h-5 text-emerald-600" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-gray-900 text-sm">Install FinanceTrack</p>
          <p className="text-xs text-gray-500">Access anywhere, works offline</p>
        </div>
        <button
          onClick={handleInstall}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'var(--green)' }}
        >
          Install
        </button>
      </div>
    </div>
  );
}
