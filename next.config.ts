import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development', // disable SW in dev for easier debugging
});

const nextConfig: NextConfig = {
  // Node-only packages — exclude from edge/browser bundles
  serverExternalPackages: ['firebase-admin', '@react-pdf/renderer'],
  // Suppress Turbopack/webpack conflict warning from @serwist/next
  turbopack: {},
};

export default withSerwist(nextConfig);
