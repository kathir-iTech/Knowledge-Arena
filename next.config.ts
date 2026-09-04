import type {NextConfig} from 'next';
import path from 'path';

const FIREBASE_AUTH_BACKEND = 'studio-4092189688-c74a7.firebaseapp.com';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: __dirname,
  // Ensure Vercel standalone trace includes pdfjs worker & resources
  // which are loaded via `new URL('pdf.worker.mjs', import.meta.url)` and
  // `require('@napi-rs/canvas')` at runtime (not static imports).
  // Without this, standalone trace omits pdf.worker.mjs → runtime
  // "Cannot find module pdf.worker.mjs" and canvas .node binaries.
  outputFileTracingIncludes: {
    '/*': [
      './node_modules/pdfjs-dist/**/*',
      './node_modules/@napi-rs/**/*',
      './node_modules/pdfjs-dist/cmaps/**/*',
      './node_modules/pdfjs-dist/standard_fonts/**/*',
      './node_modules/pdfjs-dist/wasm/**/*',
    ],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
  // pdfjs-dist contains `new URL('pdf.worker.mjs', import.meta.url)` which
  // Webpack tries to bundle as `/var/task/.next/server/chunks/pdf.worker.mjs`
  // and fails at runtime even with `disableWorker:true`. Externalizing
  // prevents that bundling and uses Node's native require in prod.
  // @napi-rs/canvas is also external to avoid bundling the .node binary.
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/__/:path*',
        destination: `https://${FIREBASE_AUTH_BACKEND}/__/:path*`,
      },
    ];
  },
  webpack(config, { isServer }) {
    // @opentelemetry/exporter-jaeger was an unused dep (Phase 96A). The
    // OTEL sdk-node optionally requires it at runtime; alias to false so the
    // missing module does not emit a "Module not found" warning after removal.
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@opentelemetry/exporter-jaeger': false,
    };
    if (isServer) {
      // The ESM builds of the Firebase client SDK are bundled by webpack
      // into server chunks with broken export interop (missing named
      // exports) on some platforms. Use the CJS builds for the server
      // compilation, which resolve and execute reliably in Node.
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        'firebase/app': path.join(process.cwd(), 'node_modules/firebase/app/dist/index.cjs.js'),
        'firebase/auth': path.join(process.cwd(), 'node_modules/firebase/auth/dist/index.cjs.js'),
        'firebase/firestore': path.join(process.cwd(), 'node_modules/firebase/firestore/dist/index.cjs.js'),
        'firebase/storage': path.join(process.cwd(), 'node_modules/firebase/storage/dist/index.cjs.js'),
        'firebase/messaging': path.join(process.cwd(), 'node_modules/firebase/messaging/dist/index.cjs.js'),
        'firebase/functions': path.join(process.cwd(), 'node_modules/firebase/functions/dist/index.cjs.js'),
        'firebase/analytics': path.join(process.cwd(), 'node_modules/firebase/analytics/dist/index.cjs.js'),
        'firebase/remote-config': path.join(process.cwd(), 'node_modules/firebase/remote-config/dist/index.cjs.js'),
        'firebase/performance': path.join(process.cwd(), 'node_modules/firebase/performance/dist/index.cjs.js'),
        'firebase/database': path.join(process.cwd(), 'node_modules/firebase/database/dist/index.cjs.js'),
      };
    }
    return config;
  },
  poweredByHeader: false,
};

export default nextConfig;
