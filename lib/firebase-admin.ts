import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getStorage, Storage } from 'firebase-admin/storage';

let _app: App | null = null;

function getAdminApp(): App {
  if (_app) return _app;
  if (getApps().length > 0) { _app = getApps()[0]; return _app; }

  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;

  _app = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
  return _app;
}

// Lazy proxies — init only when a method is actually called (at request time, not build/import time)
function lazy<T extends object>(factory: () => T): T {
  return new Proxy({} as T, {
    get(_t, prop) {
      const target = factory();
      const value = Reflect.get(target as object, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export const adminDb: Firestore = lazy(() => getFirestore(getAdminApp()));
export const adminAuth: Auth = lazy(() => getAuth(getAdminApp()));
export const adminStorage: Storage = lazy(() => getStorage(getAdminApp()));

export default getAdminApp;
