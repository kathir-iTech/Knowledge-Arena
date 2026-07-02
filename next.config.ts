import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  // Configuration for TypeScript and ESLint to ignore errors during build/dev for faster iteration.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
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
        protocol: 'https' ,
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // Increase body size limit for Server Actions to allow PDF uploads (base64)
  // In Next.js 15, serverActions configuration is a top-level property.
  serverActions: {
    bodySizeLimit: '20mb',
  },
};

export default nextConfig;
